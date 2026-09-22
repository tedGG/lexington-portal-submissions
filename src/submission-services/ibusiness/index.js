const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { uploadScreenshot } = require('../../helpers/salesforce');
const { fillApplicationForm, TEST_DATA, TEST_CONTACT } = require('./forms');

const { IBUSINESS_URL, IBUSINESS_USERNAME, IBUSINESS_PASSWORD } = process.env;

const USERNAME_INPUT = 'input[placeholder="Username"]';
const PASSWORD_INPUT = 'input[placeholder="Password"]';
const LOGIN_BUTTON = 'button.loginButton';
const LOGIN_ERROR = '.loginError, [id*="error"]:not(:empty), .slds-form-element__help';

function isLoginUrl(url) {
  return /login/i.test(url);
}

async function readLoginError(page) {
  const text = await page.locator(LOGIN_ERROR).first().innerText({ timeout: 1_000 }).catch(() => '');
  return text.trim();
}

async function login(page) {
  await page.goto(`${IBUSINESS_URL}/s/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector(USERNAME_INPUT, { timeout: 30_000 });
  console.log(`Login page loaded. URL: ${page.url()}`);

  await page.fill(USERNAME_INPUT, IBUSINESS_USERNAME);
  await page.fill(PASSWORD_INPUT, IBUSINESS_PASSWORD);
  await page.click(LOGIN_BUTTON);

  await page.waitForFunction(
    ({ errorSelector }) => {
      if (!/login/i.test(window.location.href)) return true;
      const err = document.querySelector(errorSelector);
      return Boolean(err && err.innerText.trim());
    },
    { errorSelector: LOGIN_ERROR },
    { timeout: 30_000 }
  ).catch(() => {});

  if (isLoginUrl(page.url())) {
    const error = await readLoginError(page);
    throw new Error(`IBusiness login failed${error ? `: ${error}` : ''} (still on ${page.url()})`);
  }

  console.log(`Logged in. URL: ${page.url()}`);
}

async function openNewApplication(page) {
  await page.goto(`${IBUSINESS_URL}/s/create-application`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('input[name="Borrower Requested Amount"]').waitFor({ timeout: 30_000 });
  await page.locator('lightning-dual-listbox [data-source-list] [role="option"]').first().waitFor({ timeout: 30_000 });
  console.log(`Create Application form ready. URL: ${page.url()}`);
}

async function uploadToSalesforce(page, recordId, title) {
  if (!recordId) {
    console.log('No opportunityId in payload, skipping screenshot upload');
    return null;
  }
  const png = await page.screenshot({ fullPage: true });
  console.log('Screenshot taken.');
  const result = await uploadScreenshot(png.toString('base64'), title, recordId);
  console.log(`Screenshot uploaded to Salesforce ${recordId}: ${JSON.stringify(result)}`);
  return result;
}

async function submitLoan(businessData, contact1Data, contact2Data, files) {
  if (!IBUSINESS_URL) throw new Error('IBUSINESS_URL is not set');
  if (!IBUSINESS_USERNAME || !IBUSINESS_PASSWORD) throw new Error('IBUSINESS_USERNAME / IBUSINESS_PASSWORD are not set');

  const recordId = businessData?.opportunityId || businessData?.salesforceRecordId || null;

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  let page;
  try {
    page = await context.newPage();
    await login(page);
    await openNewApplication(page);

    const data = businessData?.demo ? TEST_DATA : businessData;
    const contact = businessData?.demo ? TEST_CONTACT : contact1Data;
    await fillApplicationForm(page, data, contact);
    console.log('Form populated — NOT saved or submitted.');

    const screenshot = await uploadToSalesforce(page, recordId, `IBusiness Submission - ${data.businessName || 'Demo'}`);

    return { success: true, message: 'Application form populated — not submitted.', screenshot };
  } catch (err) {
    if (page && recordId) {
      await uploadToSalesforce(page, recordId, `IBusiness Error Screenshot - ${new Date().toISOString()}`)
        .catch(uploadErr => console.log(`Failed to upload error screenshot: ${uploadErr.message}`));
    }
    throw err;
  } finally {
    await browser.close();
  }
}

module.exports = { submitLoan };
