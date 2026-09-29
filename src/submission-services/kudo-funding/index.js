const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { uploadScreenshot, isScreenshotUploadEnabled } = require('../../helpers/salesforce');
const { fillStepOne, fillStepTwo, fillStepThree, TEST_DATA, TEST_CONTACT, TEST_CONTACT_2 } = require('./forms');
const { uploadDocuments } = require('./upload');
const { dismissInterstitial } = require('./modal');
const { maybeSubmit } = require('../../helpers/portalSubmit');

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
const CLAIM_BUTTON = 'button:has-text("Claim My Pre-Approval")';
const STEP_FIVE_READY = 'text=STEP 5 OF 5';
const SUBMIT_BUTTON = 'button:has-text("Submit & Get Funded Today")';

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

async function readToasts(page) {
  const frame = page.frames().find(f => f.url().includes('/resource/'));
  if (!frame) return [];
  return frame.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[data-sonner-toast], [role="status"], [role="alert"]')) {
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (text) out.push(text.slice(0, 200));
    }
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length) continue;
      const text = (el.textContent || '').trim();
      if (/^please complete[: ]/i.test(text)) out.push(text.slice(0, 200));
    }
    return [...new Set(out)];
  }).catch(() => []);
}

async function advanceStep(frame, page, buttonSelector, nextStepSelector, label) {
  await frame.locator(buttonSelector).first().click();

  const next = frame.locator(nextStepSelector);
  const toasts = new Set();

  for (let attempt = 0; attempt < 30; attempt++) {
    if (await next.count()) return;
    for (const toast of await readToasts(page)) toasts.add(toast);
    await page.waitForTimeout(1_000);
  }

  const all = [...toasts];
  const complaints = all.filter(t => /please complete|required|invalid|error/i.test(t));
  const reported = (complaints.length ? complaints : all).join(' | ');
  throw new Error(`Could not advance past ${label}${reported ? ` — portal reported: ${reported}` : ' (no error shown by the portal)'}`);
}

async function confirmKudoSubmit(page) {
  await page.waitForTimeout(8_000);
  const frame = page.frames().find(f => f.url().includes('/resource/'));
  if (!frame) return { verified: false, detail: 'application frame not found after submit' };

  return frame.evaluate(() => {
    const socialProof = /\b[A-Z][a-z]+ [A-Z]\.? from [A-Z][a-z ]+ (received|got approved for) \$[\d,]+ — \d+ \w+ ago/gi;
    const text = (document.body.innerText || '').replace(socialProof, '').replace(/\s+/g, ' ');

    const stillOnStep5 = /STEP 5 OF 5/i.test(text);
    const dropzoneStillThere = /Drop your statements here/i.test(text);
    const success = text.match(/(thank you|application (submitted|received)|successfully submitted|we'?ll be in touch|under review)[^.!]{0,120}/i);

    if (success) return { verified: true, detail: `saw "${success[0].trim()}"` };
    if (!stillOnStep5 && !dropzoneStillThere) return { verified: true, detail: 'left Step 5 (upload form gone)' };
    return { verified: false, detail: 'still on Step 5 with the upload form present — the portal did not advance' };
  }).catch(err => ({ verified: false, detail: `confirmation check failed: ${err.message}` }));
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

  const recordId = businessData?.salesforceRecordId || businessData?.opportunityId || null;
  const sandbox = businessData?.sandbox === true || String(businessData?.sandbox).toLowerCase() === 'true';
  if (sandbox) console.log('SANDBOX payload — Salesforce sandbox credentials will be used and the application will NOT be submitted');

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
    await advanceStep(frame, page, CONTINUE_BUTTON, STEP_TWO_READY, 'Step 1 (Contact Info)');
    await page.waitForTimeout(1_200);
    console.log('Step 1 complete — on Step 2 (Business Details).');

    await fillStepTwo(frame, page, data);
    await advanceStep(frame, page, NEXT_BUTTON, STEP_THREE_READY, 'Step 2 (Business Details)');
    await page.waitForTimeout(1_800);
    console.log('Step 2 complete — on Step 3 (Owner Verification).');

    const hasValues = c => c && Object.values(c).some(v => v !== null && v !== undefined && v !== '');
    const owners = businessData?.demo
      ? [TEST_CONTACT, TEST_CONTACT_2]
      : [contact1Data, contact2Data].filter(hasValues);
    console.log(`Owners in payload: ${owners.length}`);
    await fillStepThree(frame, page, data, owners);
    await advanceStep(frame, page, VERIFY_BUTTON, STEP_FOUR_READY, 'Step 3 (Owner Verification)');
    await page.waitForTimeout(2_000);
    console.log('Step 3 complete — on Step 4 (Review & Agree).');

    await advanceStep(frame, page, CLAIM_BUTTON, STEP_FIVE_READY, 'Step 4 (Review & Agree)');
    await page.waitForTimeout(2_000);
    console.log('Step 4 complete — on Step 5 (Bank Statements).');

    await dismissInterstitial(frame, page, 'before uploading documents');
    const uploads = await uploadDocuments(frame, page, files, businessData?.demo === true, sandbox);
    await dismissInterstitial(frame, page, 'before submitting');

    const submission = await maybeSubmit(
      frame.locator(SUBMIT_BUTTON),
      page,
      { lender: 'Kudo Funding', buttonLabel: 'Submit & Get Funded Today', confirm: confirmKudoSubmit, sandbox }
    );

    await shots.capture(submission.submitted ? 'Final - after submit' : 'Final - Step 5 (not submitted)');

    return {
      success: true,
      message: submission.submitted
        ? 'All 5 steps completed and application SUBMITTED.'
        : 'Steps 1-4 completed and documents attached — stopped on Step 5, NOT submitted.',
      owners: owners.length,
      files: uploads,
      submitted: submission.submitted,
      submitConfirmation: submission.confirmation,
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
