const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { uploadScreenshot } = require('../helpers/salesforce');

const { IOU_URL, IOU_USERNAME, IOU_PASSWORD } = process.env;

// Default Opportunity Id to attach iou screenshots to when none is supplied.
const DEFAULT_SF_RECORD_ID = '';

// Dump the structure of every form on the page: action/method, inputs
// (name/id/type/placeholder), selects, and buttons. Used to capture exact
// selectors so the automator doesn't have to guess.
async function dumpForms(page) {
  return page.evaluate(() => {
    const text = el => (el.innerText || el.value || '').trim().slice(0, 60);
    return [...document.querySelectorAll('form')].map(form => ({
      action: form.getAttribute('action'),
      method: form.getAttribute('method'),
      id: form.id || null,
      inputs: [...form.querySelectorAll('input, textarea, select')].map(el => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        id: el.id || null,
        placeholder: el.getAttribute('placeholder'),
        required: el.required || null,
      })),
      buttons: [...form.querySelectorAll('button, input[type=submit]')].map(text),
    }));
  });
}

async function snapshot(page) {
  const finalUrl = page.url();
  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) || '');
  const forms = await dumpForms(page);
  return { finalUrl, title, bodyText, forms };
}

// Opens the iou portal, optionally logs in, and dumps the form structure of
// whatever loads (login page and, if credentials are present, the page after
// login). Diagnostic-only: lets a geo-blocked operator see the portal via the
// US-West server and capture selectors for building the real automator.
async function inspect() {
  if (!IOU_URL) throw new Error('IOU_URL is not set');

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const consoleLogs = [];
  const failedRequests = [];

  try {
    const page = await context.newPage();

    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => consoleLogs.push(`[pageerror] ${err.message}`));
    page.on('requestfailed', req =>
      failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText || 'failed'}`));
    page.on('response', res => {
      if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    });

    console.log(`Navigating to iou portal: ${IOU_URL}`);
    const response = await page.goto(IOU_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const status = response ? response.status() : null;
    console.log(`Initial response status: ${status}. URL: ${page.url()}`);

    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
      console.log('networkidle not reached within 30s (continuing).');
    });

    const loginPage = await snapshot(page);
    console.log(`Login page: ${loginPage.title} — ${loginPage.forms.length} form(s) found.`);

    let loggedIn = null;
    let loginError = null;

    if (IOU_USERNAME && IOU_PASSWORD) {
      try {
        loggedIn = await attemptLogin(page, loginPage.forms);
        console.log(`Post-login URL: ${loggedIn.finalUrl} — ${loggedIn.forms.length} form(s).`);
      } catch (err) {
        loginError = err.message;
        console.log(`Login attempt failed: ${err.message}`);
      }
    } else {
      console.log('IOU_USERNAME/IOU_PASSWORD not set — skipping login.');
    }

    return {
      success: true,
      status,
      loginPage,
      loggedIn,
      loginError,
      consoleLogs,
      failedRequests,
    };
  } finally {
    await browser.close();
  }
}

// Fill the email/password fields by their detected names and submit, then wait
// for navigation away from the login URL.
async function attemptLogin(page, forms) {
  const inputs = forms.flatMap(f => f.inputs);
  const emailInput = inputs.find(i =>
    i.type === 'email' || /email|login|user/i.test(`${i.name} ${i.id} ${i.placeholder}`));
  const passwordInput = inputs.find(i => i.type === 'password');

  if (!emailInput || !passwordInput) {
    throw new Error(`Could not locate login fields (email=${!!emailInput}, password=${!!passwordInput})`);
  }

  const sel = i => (i.id ? `#${i.id}` : `[name="${i.name}"]`);
  console.log(`Filling login: email=${sel(emailInput)} password=${sel(passwordInput)}`);

  await page.fill(sel(emailInput), IOU_USERNAME);
  await page.fill(sel(passwordInput), IOU_PASSWORD);

  const beforeUrl = page.url();
  await Promise.all([
    page.waitForURL(url => url.toString() !== beforeUrl, { timeout: 30_000 }).catch(() => {}),
    page.click('button[type="submit"], input[type="submit"], button'),
  ]);

  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  return snapshot(page);
}

// Opens the portal, optionally logs in, and returns a full-page PNG buffer so a
// geo-blocked operator can view the actual rendered page (e.g. inline in Postman).
// When preSubmit is true, fills the credentials but stops BEFORE clicking Log In,
// so the password field's dots confirm it was actually populated.
async function screenshot({ preSubmit = false } = {}) {
  if (!IOU_URL) throw new Error('IOU_URL is not set');

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  try {
    const page = await context.newPage();
    await page.goto(IOU_URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });

    if (IOU_USERNAME && IOU_PASSWORD) {
      try {
        await page.fill('#user_email', IOU_USERNAME);
        await page.fill('#user_password', IOU_PASSWORD);

        const pwLen = await page.inputValue('#user_password').then(v => v.length).catch(() => 0);
        console.log(`Password field populated: ${pwLen} chars.`);

        if (preSubmit) {
          console.log('preSubmit mode — capturing page before clicking Log In.');
        } else {
          // submit triggers a full-page navigation (Rails form POST); wait for it
          await Promise.all([
            page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {}),
            page.click('input[type="submit"], button[type="submit"]'),
          ]);
          // dashboard loads data async (Turbo/XHR) — wait for network to settle
          // and for visible body content before screenshotting.
          await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {
            console.log('networkidle not reached in 20s (continuing).');
          });
          await page.waitForFunction(
            () => (document.body?.innerText || '').trim().length > 0,
            { timeout: 10_000 }
          ).catch(() => console.log('No visible body text after 10s (continuing).'));
          await page.waitForTimeout(2500); // final settle for late-rendering widgets

          // log where we landed so we can see the post-login page
          const url = page.url();
          const title = await page.title().catch(() => '');
          const bodyText = await page
            .evaluate(() => (document.body?.innerText || '').trim().slice(0, 2000))
            .catch(() => '');
          console.log(`Post-login URL: ${url}`);
          console.log(`Post-login title: ${title}`);
          console.log(`Post-login body text:\n${bodyText}`);
        }
      } catch (err) {
        console.log(`Login attempt failed (capturing page as-is): ${err.message}`);
      }
    }

    const png = await page.screenshot({ fullPage: true });
    return png;
  } finally {
    await browser.close();
  }
}

// Captures the iou screenshot and uploads it to a Salesforce record as a
// ContentVersion, so it can be viewed from Salesforce (no image streamed back
// through Railway — avoids the request-timeout limit entirely).
async function screenshotToSalesforce(recordId = DEFAULT_SF_RECORD_ID, options = {}) {
  if (!recordId) throw new Error('No Salesforce recordId provided (and no default set)');

  const png = await screenshot(options);
  const title = `iou Portal Screenshot - ${new Date().toISOString()}`;
  console.log(`Uploading iou screenshot to Salesforce record ${recordId}...`);
  const result = await uploadScreenshot(png.toString('base64'), title, recordId);
  console.log(`Uploaded: ${JSON.stringify(result)}`);
  return { success: true, recordId, contentVersion: result };
}

module.exports = { inspect, screenshot, screenshotToSalesforce };
