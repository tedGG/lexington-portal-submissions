const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { fillApplicationForm, fillContactForm, TEST_DATA, TEST_CONTACTS } = require('./forms');
const { waitForLabel } = require('../../helpers/vuetify');
const { uploadFiles } = require('./upload');
const { maybeSubmit, waitForNetworkQuiet } = require('../../helpers/portalSubmit');
const { uploadScreenshot } = require('../../helpers/salesforce');

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

const SUBMIT_BUTTON = 'button:has-text("SEND TO ELITE")';

async function waitForBusinessTabGone(page) {
  await page.waitForFunction(
    () => ![...document.querySelectorAll('label')]
      .some(l => l.offsetParent !== null && /^Federal Tax ID/.test(l.innerText)),
    { timeout: 20_000 }
  ).then(
    () => console.log('Business tab unmounted — Contacts fields are now unambiguous'),
    () => console.log('WARNING — Business tab fields still present; contact fields may be ambiguous')
  );
}

async function captureFinalScreenshot(page, recordId, title) {
  if (!recordId) {
    console.log('No submissionId in payload, skipping final screenshot');
    return null;
  }
  try {
    const png = await page.screenshot({ fullPage: true });
    const result = await uploadScreenshot(png.toString('base64'), title, recordId, sandbox);
    console.log(`Final screenshot uploaded to Salesforce ${recordId}: ${title}`);
    return result;
  } catch (err) {
    const reason = err.message.split('\n')[0];
    console.log(`Final screenshot upload failed (ignored): ${reason}`);
    return { uploaded: false, reason };
  }
}

async function confirmChannelPartnersSubmit(page) {
  await page.waitForTimeout(2_000);
  console.log('Channel Partners: waiting for the send to finish before closing the browser...');
  await waitForNetworkQuiet(page, { quietMs: 5_000, timeoutMs: 180_000, label: 'Channel Partners send' });
  await page.waitForTimeout(3_000);
  const dialog = await page.locator('.v-overlay__content:visible').first().innerText().catch(() => '');
  const body = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ')).catch(() => '');
  const hit = body.match(/(application (submitted|sent)|successfully (submitted|sent)|thank you)[^.!]{0,120}/i);
  const buttonGone = (await page.locator(SUBMIT_BUTTON).count()) === 0;

  const detail = [
    dialog && `dialog: ${dialog.replace(/\s+/g, ' ').trim().slice(0, 160)}`,
    hit && `saw "${hit[0].trim()}"`,
    buttonGone && 'SEND TO ELITE button gone',
  ].filter(Boolean).join('; ') || 'no confirmation signal detected';

  return { verified: Boolean(hit) || buttonGone, detail };
}

async function submitLoan(businessData, contact1Data, contact2Data, files) {
  const sandbox = businessData?.sandbox === true || String(businessData?.sandbox).toLowerCase() === 'true';
  if (sandbox) console.log('SANDBOX payload — Salesforce sandbox credentials will be used and the application will NOT be sent');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const startedAt = Date.now();
  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

  try {
    const page = await context.newPage();
    await login(page, context);

    await page.waitForLoadState('networkidle');
    console.log(`Logged in after ${elapsed()} — ${page.url()}`);

    await page.getByRole('button', { name: /new application/i }).click();
    await waitForLabel(page, 'Federal Tax ID');
    console.log('New Application form ready');

    const data = businessData.demo ? TEST_DATA : businessData;
    await fillApplicationForm(page, data);
    console.log(`Business form filled after ${elapsed()}`);

    await page.locator('.v-tab', { hasText: 'CONTACTS' }).click();
    await waitForLabel(page, 'First Name');
    await waitForBusinessTabGone(page);
    console.log('Navigated to Contacts tab');

    const contacts = businessData.demo
      ? TEST_CONTACTS
      : [contact1Data, contact2Data].filter(Boolean);

    for (let i = 0; i < contacts.length; i++) {
      if (i > 0) {
        await page.getByRole('button', { name: /add new/i }).click();
        await waitForLabel(page, 'First Name', i);
        console.log('Clicked Add Contact');
      }
      await fillContactForm(page, contacts[i], i);
    }
    console.log(`Contacts filled after ${elapsed()}`);

    const uploads = await uploadFiles(page, files, businessData.demo === true, businessData.salesforceRecordId, sandbox);

    const submission = await maybeSubmit(
      page.locator(SUBMIT_BUTTON),
      page,
      { lender: 'Channel Partners', buttonLabel: 'SEND TO ELITE', confirm: confirmChannelPartnersSubmit, sandbox }
    );

    const recordId = businessData?.salesforceRecordId || businessData?.opportunityId || null;
    const screenshot = await captureFinalScreenshot(
      page,
      recordId,
      `Channel Partners - Final - ${submission.submitted ? 'after send' : 'not sent'} - ${businessData?.businessName || 'Demo'}`
    );

    console.log(`Channel Partners submission finished in ${elapsed()}`);

    return {
      success: true,
      message: submission.submitted ? 'Application form filled and SENT TO ELITE.' : 'Application form filled — not sent.',
      files: uploads,
      submitted: submission.submitted,
      submitVerified: submission.submitVerified,
      submitConfirmation: submission.confirmation,
      screenshot,
    };
  } finally {
    await browser.close();
  }
}

module.exports = { submitLoan };
