const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { uploadScreenshot, isScreenshotUploadEnabled } = require('../../helpers/salesforce');
const { fillApplicationForm, TEST_DATA, TEST_CONTACT } = require('./forms');
const { uploadFiles } = require('./upload');
const { maybeSubmit } = require('../../helpers/portalSubmit');

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

async function collectValidationErrors(page) {
  const found = await page.evaluate(() => {
    const errors = [];
    const empties = [];
    const walk = root => {
      for (const el of root.querySelectorAll('.slds-has-error, [role="alert"], .slds-notify__content, .toastMessage')) {
        const help = el.querySelector ? el.querySelector('.slds-form-element__help') : null;
        const label = el.querySelector ? el.querySelector('label, .slds-form-element__label') : null;
        const text = ((help && help.innerText) || el.innerText || '').trim();
        if (text) errors.push(label ? `${label.innerText.trim()}: ${text}` : text);
      }
      for (const field of root.querySelectorAll('input, textarea')) {
        const isRequired = field.required || field.getAttribute('aria-required') === 'true';
        if (!isRequired || field.type === 'hidden') continue;
        if ((field.value || '').trim()) continue;
        const name = field.getAttribute('name')
          || field.getAttribute('aria-label')
          || field.getAttribute('placeholder');
        if (name) empties.push(name);
      }
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(document);
    return { errors: [...new Set(errors)], empties: [...new Set(empties)] };
  }).catch(() => ({ errors: [], empties: [] }));

  const parts = [];
  if (found.errors.length) parts.push(found.errors.join(' | '));
  if (found.empties.length) parts.push(`empty required field(s): ${found.empties.join(', ')}`);
  return parts.join(' — ');
}

function watchServerErrors(page) {
  const seen = [];
  const handler = async response => {
    try {
      const url = response.url();
      if (!/aura|apexremote|webruntime|\/services\//i.test(url)) return;
      if (response.status() >= 400) {
        seen.push(`HTTP ${response.status()} on ${url.split('?')[0]}`);
        return;
      }
      if (response.request().method() !== 'POST') return;
      const body = await response.text().catch(() => '');
      if (!body || !/"(?:message|errorMessage|exceptionMessage|stackTrace)"/.test(body)) return;
      const match = body.match(/"(?:message|errorMessage|exceptionMessage)"\s*:\s*"([^"]{5,400})"/);
      if (match) seen.push(match[1]);
    } catch { /* diagnostics only */ }
  };
  page.on('response', handler);
  return { seen, stop: () => page.off('response', handler) };
}

async function visibleModalText(page) {
  return page.evaluate(() => {
    const out = [];
    const walk = root => {
      for (const el of root.querySelectorAll('section.slds-modal, [role="dialog"], .slds-notify')) {
        if (el.offsetParent === null && el.className.indexOf('slds-fade-in-open') < 0) continue;
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (text) out.push(text.slice(0, 300));
      }
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(document);
    return [...new Set(out)].join(' || ');
  }).catch(() => '');
}

async function saveApplication(page) {
  const watcher = watchServerErrors(page);
  await page.getByRole('button', { name: /^save$/i }).first().click();
  console.log('Clicked Save — waiting for the Files section...');

  const ready = page.locator('button:has-text("Add Files")').first();
  let saved = false;
  for (let elapsed = 0; elapsed < 90; elapsed += 5) {
    if (await ready.count()) { saved = true; break; }
    await page.waitForTimeout(5_000);
    const modal = await visibleModalText(page);
    if (modal) console.log(`After ${elapsed + 5}s — dialog on screen: ${modal}`);
  }
  watcher.stop();

  if (!saved) {
    const errors = await collectValidationErrors(page);
    const modal = await visibleModalText(page);
    const server = [...new Set(watcher.seen)].join(' | ');
    const detail = [errors, modal && `dialog: ${modal}`, server && `server: ${server}`]
      .filter(Boolean).join(' — ');
    throw new Error(`Save did not complete${detail ? ` — ${detail}` : ' (no Files section, no error shown by the portal)'}`);
  }
  if (watcher.seen.length) {
    console.log(`Save succeeded, but server reported: ${[...new Set(watcher.seen)].join(' | ')}`);
  }
  console.log('Application saved. (Application NOT submitted.)');

  await page.getByRole('button', { name: /go to application/i }).first().click();
  await page.waitForURL(/\/s\/opportunity\//, { timeout: 60_000 });
  await page.locator('button:has-text("Submit Application")').first().waitFor({ timeout: 60_000 });
  console.log(`Opened application record: ${page.url()}`);

  await page.getByText('Files', { exact: true }).first().click();
  await page.locator('button:has-text("Add Files")').first().waitFor({ timeout: 60_000 });
  console.log('Files tab ready.');

  return page.url();
}

async function uploadToSalesforce(page, recordId, title) {
  if (!recordId) {
    console.log('No opportunityId in payload, skipping screenshot upload');
    return null;
  }
  try {
    const png = await page.screenshot({ fullPage: true });
    const result = await uploadScreenshot(png.toString('base64'), title, recordId, sandbox);
    console.log(`Screenshot uploaded to Salesforce ${recordId}: ${title}`);
    return result;
  } catch (err) {
    console.log(`Screenshot upload failed (ignored): ${err.message.split('\n')[0]}`);
    return null;
  }
}

const SUBMIT_BUTTON = 'button:has-text("Submit Application")';

async function handleIBusinessConfirmDialog(page) {
  await page.waitForTimeout(2_500);
  const modal = page.locator('section.slds-modal, div[role="dialog"]').filter({ hasText: /submit/i }).first();
  if (!(await modal.isVisible().catch(() => false))) return;

  const text = (await modal.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200);
  console.log(`IBusiness: confirmation dialog appeared after Submit — "${text}"`);

  const confirm = modal.locator('button').filter({ hasText: /^(submit|confirm|yes|ok|continue)$/i }).first();
  if (await confirm.isVisible().catch(() => false)) {
    const label = (await confirm.innerText().catch(() => '')).trim();
    await confirm.click();
    console.log(`IBusiness: clicked "${label}" in the confirmation dialog`);
    await page.waitForTimeout(3_000);
  } else {
    console.log('IBusiness: confirmation dialog has no obvious confirm button — leaving it as-is');
  }
}

async function readStage(page) {
  return page.evaluate(() => {
    const match = (document.body.innerText || '').match(/(?:^|\n)Stage(?:\s*\n)?\s*([^\n]{2,40})/);
    return match ? match[1].trim() : '';
  }).catch(() => '');
}

async function readToasts(page) {
  return page.evaluate(() => {
    const out = [];
    const walk = root => {
      for (const el of root.querySelectorAll('.toastMessage, .slds-notify__content, .forceActionsText, [role="alert"], .slds-theme_error')) {
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (text) out.push(text.slice(0, 200));
      }
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(document);
    return [...new Set(out)];
  }).catch(() => []);
}

const SUBMITTED_STAGE = /underwriting/i;

function confirmIBusinessSubmit(stageBefore) {
  return async page => {
    const toasts = new Set();
    let stageAfter = '';
    let buttonGone = false;

    for (let waited = 0; waited < 30; waited += 2) {
      await page.waitForTimeout(2_000);
      for (const toast of await readToasts(page)) toasts.add(toast);
      stageAfter = await readStage(page);
      buttonGone = (await page.locator(SUBMIT_BUTTON).count()) === 0;
      if (SUBMITTED_STAGE.test(stageAfter) || buttonGone) break;
    }

    const reachedUnderwriting = SUBMITTED_STAGE.test(stageAfter);
    const stageChanged = Boolean(stageAfter) && stageAfter !== stageBefore;
    const stillNotSubmitted = /not submitted/i.test(stageAfter);

    const detail = [
      `stage before "${stageBefore || 'unknown'}"`,
      `after "${stageAfter || 'unknown'}"`,
      reachedUnderwriting ? 'reached Underwriting' : null,
      buttonGone ? 'Submit Application button gone' : 'Submit Application button still present',
      toasts.size ? `portal said: ${[...toasts].join(' | ')}` : null,
    ].filter(Boolean).join('; ');

    return {
      verified: reachedUnderwriting || buttonGone || (stageChanged && !stillNotSubmitted),
      detail,
    };
  };
}

async function submitLoan(businessData, contact1Data, contact2Data, files) {
  if (!IBUSINESS_URL) throw new Error('IBUSINESS_URL is not set');
  if (!IBUSINESS_USERNAME || !IBUSINESS_PASSWORD) throw new Error('IBUSINESS_USERNAME / IBUSINESS_PASSWORD are not set');

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
    await openNewApplication(page);

    const data = businessData?.demo ? TEST_DATA : businessData;
    const contact = businessData?.demo ? TEST_CONTACT : contact1Data;
    await fillApplicationForm(page, data, contact);

    const applicationUrl = await saveApplication(page);
    const uploads = await uploadFiles(page, files, businessData?.demo === true, recordId, sandbox);

    const stageBefore = await readStage(page);
    const submission = await maybeSubmit(
      page.locator(SUBMIT_BUTTON),
      page,
      {
        lender: 'IBusiness',
        buttonLabel: 'Submit Application',
        confirm: confirmIBusinessSubmit(stageBefore),
        confirmDialog: handleIBusinessConfirmDialog,
        sandbox,
      }
    );

    const screenshot = await uploadToSalesforce(
      page,
      recordId,
      `IBusiness - Final - ${submission.submitted ? 'after submit' : 'not submitted'} - ${data.businessName || 'Demo'}`
    );

    return {
      success: true,
      message: submission.submitted
        ? 'Application saved, files uploaded and SUBMITTED.'
        : 'Application saved and files uploaded — application NOT submitted.',
      applicationUrl,
      files: uploads,
      submitted: submission.submitted,
      submitConfirmation: submission.confirmation,
      screenshot,
    };
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

module.exports = { submitLoan, collectValidationErrors };
