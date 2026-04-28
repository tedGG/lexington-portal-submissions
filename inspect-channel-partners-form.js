require('dotenv').config();
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
chromium.use(StealthPlugin());

const { loadSession } = require('./src/sessionManager');
const SESSION_KEY = 'channel-partners';
const { CHANNEL_PARTNERS_URL, CHANNEL_PARTNERS_USERNAME, CHANNEL_PARTNERS_PASSWORD } = process.env;

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  const sessionLoaded = await loadSession(context, SESSION_KEY);
  if (sessionLoaded) {
    await page.goto(`${CHANNEL_PARTNERS_URL}/`);
    await page.waitForLoadState('networkidle');
    const loggedIn = !page.url().includes('/login') && !page.url().includes('auth0');
    if (!loggedIn) {
      await context.clearCookies();
      await page.goto(`${CHANNEL_PARTNERS_URL}/login`);
      await page.waitForLoadState('networkidle');
      await page.fill('[id="1-email"]', CHANNEL_PARTNERS_USERNAME);
      await page.fill('[id="1-password"]', CHANNEL_PARTNERS_PASSWORD);
      await page.click('[id="1-submit"]');
      await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 20_000 });
    }
  } else {
    await context.clearCookies();
    await page.goto(`${CHANNEL_PARTNERS_URL}/login`);
    await page.waitForLoadState('networkidle');
    await page.fill('[id="1-email"]', CHANNEL_PARTNERS_USERNAME);
    await page.fill('[id="1-password"]', CHANNEL_PARTNERS_PASSWORD);
    await page.click('[id="1-submit"]');
    await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 20_000 });
  }

  await page.waitForLoadState('networkidle');
  await page.getByText('NEW APPLICATION').click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  // Dismiss cookie banner if present
  const cookieBtn = page.getByText('ALLOW COOKIES');
  if (await cookieBtn.isVisible().catch(() => false)) {
    await cookieBtn.click();
    await page.waitForTimeout(500);
  }

  // Dump all input/select/textarea fields with their attributes
  const fields = await page.evaluate(() => {
    const results = [];
    const elements = document.querySelectorAll('input, select, textarea, [role="combobox"], [role="listbox"]');
    elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const labelEl = el.labels?.[0] || document.querySelector(`label[for="${el.id}"]`);
      results.push({
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        id: el.id || null,
        name: el.name || null,
        placeholder: el.placeholder || null,
        class: el.className || null,
        role: el.getAttribute('role') || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        labelText: labelEl?.innerText?.trim() || null,
        dataAttrs: [...el.attributes]
          .filter(a => a.name.startsWith('data-'))
          .reduce((acc, a) => ({ ...acc, [a.name]: a.value }), {}),
      });
    });
    return results;
  });

  fs.writeFileSync('/tmp/channel-partners-form-fields.json', JSON.stringify(fields, null, 2));
  console.log(`Saved ${fields.length} fields to /tmp/channel-partners-form-fields.json`);
  console.log(JSON.stringify(fields, null, 2));

  await page.screenshot({ path: '/tmp/channel-partners-form-inspect.png', fullPage: true });
  await browser.close();
})();
