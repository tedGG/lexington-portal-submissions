const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  const sessionFile = '/tmp/session-channel-partners.json';
  if (fs.existsSync(sessionFile)) {
    const { cookies } = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    await context.addCookies(cookies);
    console.log('Session cookies loaded');
  }

  const page = await context.newPage();
  await page.goto('https://channelpconnect.com/login');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const elements = await page.evaluate((email) => {
    return [...document.querySelectorAll('*')].filter(el => {
      const text = el.innerText?.trim();
      return text && text.includes(email) && el.children.length === 0;
    }).map(el => {
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        class: el.className || null,
        text: el.innerText?.trim() || null,
        role: el.getAttribute('role') || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        dataAttrs: [...el.attributes]
          .filter(a => a.name.startsWith('data-'))
          .reduce((acc, a) => ({ ...acc, [a.name]: a.value }), {}),
        visible: rect.width > 0 && rect.height > 0,
      };
    });
  }, 'uw@lexingtoncapitalholdings.com');

  console.log(JSON.stringify(elements, null, 2));
  await page.screenshot({ path: 'login-screenshot.png', fullPage: true });
  await browser.close();
})();
