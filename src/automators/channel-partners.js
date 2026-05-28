const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { fillApplicationForm, fillContactForm, TEST_DATA, TEST_CONTACTS } = require('./channel-partners-forms');
const { uploadFiles } = require('./channel-partners-upload');

const { CHANNEL_PARTNERS_URL, CHANNEL_PARTNERS_USERNAME, CHANNEL_PARTNERS_PASSWORD } = process.env;

async function login(page, context) {
  await context.clearCookies();
  await page.goto(`${CHANNEL_PARTNERS_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('[id="1-email"]', CHANNEL_PARTNERS_USERNAME);
  await page.fill('[id="1-password"]', CHANNEL_PARTNERS_PASSWORD);
  await page.click('[id="1-submit"]');
  await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 20_000 });
}

async function isLoggedIn(page) {
  const url = page.url();
  return !url.includes('/login') && !url.includes('auth0');
}

async function submitLoan(businessData, contact1Data, contact2Data, files) {
  const browser = await chromium.launch({
    headless: true,
    slowMo: 800,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  try {
    const page = await context.newPage();
    await login(page, context);

    await page.waitForLoadState('networkidle');
    console.log(`Page URL after auth: ${page.url()}`);

    await page.getByRole('button', { name: /new application/i }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    const data = businessData.demo ? TEST_DATA : businessData;
    await fillApplicationForm(page, data);

    await page.locator('.v-tab', { hasText: 'CONTACTS' }).click();
    await page.waitForTimeout(2000);
    console.log('Navigated to Contacts tab');

    const contacts = businessData.demo
      ? TEST_CONTACTS
      : [contact1Data, contact2Data].filter(Boolean);

    for (let i = 0; i < contacts.length; i++) {
      if (i > 0) {
        await page.getByRole('button', { name: /add new/i }).click();
        await page.waitForTimeout(1500);
        console.log('Clicked Add Contact');
      }
      await fillContactForm(page, contacts[i], i);
    }

    await uploadFiles(page, files, businessData.demo === true);

    await page.screenshot({ path: '/tmp/channel-partners-new-application.png', fullPage: true });
    await page.waitForTimeout(10000);

    return { success: true, message: 'Application form filled' };
  } finally {
    await browser.close();
  }
}

module.exports = { submitLoan };
