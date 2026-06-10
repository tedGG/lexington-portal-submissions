const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { fillBusinessInformation, fillOwners, fillFinancialInformation, TEST_DATA } = require('./fundomate-forms');
const { FUNDOMATE_URL, FUNDOMATE_USERNAME, FUNDOMATE_PASSWORD } = process.env;

async function login(page, context) {
  await context.clearCookies();
  await page.goto(`${FUNDOMATE_URL}/login`);
  await page.waitForLoadState('networkidle');

  await page.waitForSelector('#username', { timeout: 15_000 });

  await page.fill('#username', FUNDOMATE_USERNAME);
  await page.fill('#password', FUNDOMATE_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForFunction(
    () => window.location.hostname.includes('partner.fundomate.com'),
    { timeout: 20_000 }
  );
  console.log(`Logged in. URL: ${page.url()}`);
}

async function submitLoan(businessData_, contact1Data, contact2Data, files) {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    slowMo: 800,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  try {
    const page = await context.newPage();
    await login(page, context);

    await page.goto(`${FUNDOMATE_URL}/merchants/create`);
    await page.waitForLoadState('networkidle');
    console.log(`Navigated to create merchant page. URL: ${page.url()}`);

    const businessData = businessData_?.demo ? TEST_DATA.business : businessData_;
    const owners = businessData_?.demo ? TEST_DATA.owners : [contact1Data, contact2Data].filter(Boolean);
    const financial = businessData_?.demo ? TEST_DATA.financial : {};

    await fillBusinessInformation(page, businessData);
    await fillOwners(page, owners);
    await fillFinancialInformation(page, financial);

    await page.screenshot({ path: '/tmp/fundomate-new-application.png', fullPage: true });
    console.log('Screenshot saved.');

    return { success: true, message: 'Application form filled' };
  } finally {
    await browser.close();
  }
}

module.exports = { submitLoan };
