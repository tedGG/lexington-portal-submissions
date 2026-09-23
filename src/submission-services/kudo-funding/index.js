const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { uploadScreenshot } = require('../../helpers/salesforce');
const { fillStepOne, fillStepTwo, fillStepThree, TEST_DATA, TEST_CONTACT, TEST_CONTACT_2 } = require('./forms');

const { KUDO_FUNDING_URL, KUDO_FUNDING_USERNAME, KUDO_FUNDING_PASSWORD } = process.env;

const APP_FRAME = 'iframe.react-frame';
const EMAIL_INPUT = '#login-email';
const PASSCODE_INPUT = '#login-passcode';
const SIGN_IN_BUTTON = 'button[type="submit"]';
const LOGIN_ERROR = 'p.text-destructive';
const WIZARD_READY = 'text=STEP 1 OF 5';
const STEP_TWO_READY = 'text=STEP 2 OF 5';
const STEP_THREE_READY = 'text=STEP 3 OF 5';
const STEP_FOUR_READY = 'text=STEP 4 OF 5';
const CONTINUE_BUTTON = 'button:has-text("Continue")';
const NEXT_BUTTON = 'button:has-text("Next")';
const VERIFY_BUTTON = 'button:has-text("Verify & Secure")';

function appFrame(page) {
  return page.frameLocator(APP_FRAME);
}

async function login(page) {
  await page.goto(KUDO_FUNDING_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

  const frame = appFrame(page);
  await frame.locator(EMAIL_INPUT).waitFor({ timeout: 45_000 });
  console.log(`Login page loaded. URL: ${page.url()}`);

  await frame.locator(EMAIL_INPUT).fill(KUDO_FUNDING_USERNAME);
  await frame.locator(PASSCODE_INPUT).fill(KUDO_FUNDING_PASSWORD);
  await frame.locator(SIGN_IN_BUTTON).click();

  const error = frame.locator(LOGIN_ERROR);
  const wizard = frame.locator(WIZARD_READY);

  const outcome = await Promise.race([
    wizard.waitFor({ timeout: 45_000 }).then(() => 'wizard'),
    error.waitFor({ timeout: 45_000 }).then(() => 'error'),
  ]).catch(() => 'timeout');

  if (outcome !== 'wizard') {
    const message = await error.innerText({ timeout: 2_000 }).catch(() => '');
    throw new Error(`Kudo Funding login failed${message ? `: ${message.trim()}` : ' (no application wizard after sign in)'}`);
  }

  console.log('Logged in — application wizard loaded (Step 1 of 5: Contact Info).');
}

async function uploadToSalesforce(page, recordId, title) {
  if (!recordId) {
    console.log(`No opportunityId in payload, skipping screenshot upload (${title})`);
    return null;
  }
  const png = await page.screenshot({ fullPage: true });
  const result = await uploadScreenshot(png.toString('base64'), title, recordId);
  console.log(`Screenshot uploaded to Salesforce ${recordId}: ${title}`);
  return result;
}

function stepCapturer(page, recordId, businessName) {
  const uploaded = [];
  return {
    uploaded,
    capture: async label => {
      const title = `Kudo Funding - ${label} - ${businessName || 'Demo'}`;
      try {
        const result = await uploadToSalesforce(page, recordId, title);
        if (result) uploaded.push({ step: label, contentVersionId: result.id });
      } catch (err) {
        console.log(`Screenshot upload failed for "${label}": ${err.message}`);
      }
    },
  };
}

async function submitLoan(businessData, contact1Data, contact2Data, files) {
  if (!KUDO_FUNDING_URL) throw new Error('KUDO_FUNDING_URL is not set');
  if (!KUDO_FUNDING_USERNAME || !KUDO_FUNDING_PASSWORD) {
    throw new Error('KUDO_FUNDING_USERNAME / KUDO_FUNDING_PASSWORD are not set');
  }

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

    const frame = appFrame(page);
    const data = businessData?.demo ? TEST_DATA : businessData;
    const contact = businessData?.demo ? TEST_CONTACT : contact1Data;

    const shots = stepCapturer(page, recordId, data?.businessName);

    await fillStepOne(frame, page, data, contact);
    await shots.capture('Step 1 of 5 - Contact Info');
    await frame.locator(CONTINUE_BUTTON).first().click();
    await frame.locator(STEP_TWO_READY).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1_200);
    console.log('Step 1 complete — on Step 2 (Business Details).');

    await fillStepTwo(frame, page, data);
    await shots.capture('Step 2 of 5 - Business Details');
    await frame.locator(NEXT_BUTTON).first().click();
    await frame.locator(STEP_THREE_READY).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1_800);
    console.log('Step 2 complete — on Step 3 (Owner Verification).');

    const owners = businessData?.demo ? [TEST_CONTACT, TEST_CONTACT_2] : [contact1Data, contact2Data].filter(Boolean);
    await fillStepThree(frame, page, data, owners);
    await shots.capture('Step 3 of 5 - Owner Verification');
    await frame.locator(VERIFY_BUTTON).first().click();
    await frame.locator(STEP_FOUR_READY).waitFor({ timeout: 40_000 });
    await page.waitForTimeout(2_000);
    console.log('Step 3 complete — on Step 4 (Review & Agree). STOPPING — pre-approval NOT claimed.');

    await shots.capture('Step 4 of 5 - Review and Agree');

    return {
      success: true,
      message: 'Steps 1-3 completed — stopped on Step 4 (Review & Agree), not submitted.',
      owners: owners.length,
      screenshots: shots.uploaded,
    };
  } catch (err) {
    if (page && recordId) {
      await uploadToSalesforce(page, recordId, `Kudo Funding Error Screenshot - ${new Date().toISOString()}`)
        .catch(uploadErr => console.log(`Failed to upload error screenshot: ${uploadErr.message}`));
    }
    throw err;
  } finally {
    await browser.close();
  }
}

module.exports = { submitLoan };
