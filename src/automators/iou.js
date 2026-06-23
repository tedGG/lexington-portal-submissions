const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { uploadScreenshot } = require('../helpers/salesforce');

const { IOU_URL, IOU_USERNAME, IOU_PASSWORD } = process.env;

const DEFAULT_SF_RECORD_ID = '';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto(`${IOU_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#user_email', { timeout: 30_000 });
  await page.fill('#user_email', IOU_USERNAME);
  await page.fill('#user_password', IOU_PASSWORD);
  await Promise.all([
    page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {}),
    page.click('input[type="submit"], button[type="submit"]'),
  ]);
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  console.log(`Logged in. URL: ${page.url()}`);
}

async function openNewApplication(page) {
  await page.click('[data-cy="new-app"]');
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log(`New Application opened. URL: ${page.url()}`);
}

// Select an option in a MUI Select by id.
async function selectMui(page, comboId, optionText) {
  if (!optionText) return;
  await page.click(`#${comboId}`);
  await page.waitForSelector('[role="listbox"] [role="option"]', { timeout: 5_000 });
  await page.getByRole('option', { name: optionText, exact: true }).click();
  await page.waitForTimeout(200);
  console.log(`Selected "${optionText}" for #${comboId}`);
}

// Street Number is an autocomplete combobox — type and pick first suggestion,
// or leave as typed if no suggestions appear.
async function fillStreetNumber(page, comboId, value) {
  if (!value) return;
  await page.click(`#${comboId}`);
  await page.type(`#${comboId}`, String(value), { delay: 60 });
  await page.waitForTimeout(800);
  const option = page.locator('[role="listbox"] [role="option"]').first();
  const hasOption = await option.count().then(c => c > 0).catch(() => false);
  if (hasOption) {
    await option.click().catch(() => page.keyboard.press('Escape'));
  } else {
    await page.keyboard.press('Escape').catch(() => {});
  }
  await page.waitForTimeout(200);
  console.log(`Filled street number #${comboId}: ${value}`);
}

async function safeFill(page, selector, value) {
  if (!value && value !== 0) return;
  await page.fill(selector, String(value));
  console.log(`Filled ${selector}`);
}

// ─── Data shaping ────────────────────────────────────────────────────────────

// Salesforce sends businessData.inBusinessSince as "YYYY-MM" or "YYYY-MM-DD".
// IOU wants "MM/YYYY".
function formatStartDate(value) {
  if (!value) return null;
  const [year, month] = String(value).split('-');
  if (!year || !month) return value;
  return `${month}/${year}`;
}

// Salesforce sends dateOfBirth as "YYYY-MM-DD". IOU native date input wants "YYYY-MM-DD".
// (No conversion needed — pass through.)
function formatDOB(value) {
  return value || null;
}

// Map Salesforce Entity_Type__c values to IOU Company Type picklist options.
const COMPANY_TYPE_MAP = {
  'Corporation': 'Corporation',
  'General Partnership': 'General Partnership',
  'Limited Liability Partnership': 'Limited Liability Partnership (LLP)',
  'LLP': 'Limited Liability Partnership (LLP)',
  'Limited Liability Company': 'Limited Liability Company (LLC)',
  'LLC': 'Limited Liability Company (LLC)',
  'PLC': 'Public Liability Company (PLC)',
  'Sole Proprietorship': 'Sole Proprietorship',
};

function mapCompanyType(value) {
  if (!value) return null;
  return COMPANY_TYPE_MAP[value] || value;
}

// IOU state picklist uses full names ("New York"), same as Salesforce BillingState.
// Pass through — no mapping needed.

// ─── Form fill ───────────────────────────────────────────────────────────────

async function fillApplicationForm(page, businessData, contact1Data) {
  // Industry checkbox — always check to certify
  await page.locator('input[name="industryCheckbox"]').check().catch(() => {});
  console.log('Checked: industry checkbox');

  // ── Business Information ──
  await safeFill(page, '#companyCpr', businessData.federalTaxId);
  await safeFill(page, '#companyFirstName', businessData.businessName);
  await safeFill(page, '#companyLastName', businessData.dba);
  await selectMui(page, 'mui-2', mapCompanyType(businessData.businessType));
  await safeFill(page, '#businessStartDate', formatStartDate(businessData.inBusinessSince));
  await safeFill(page, '#companyUrl', businessData.website);
  await safeFill(page, '#companyPhoneNumber', businessData.phone);
  await safeFill(page, '#companyEmail', businessData.email);
  await fillStreetNumber(page, 'mui-4', businessData.streetNumber);
  await safeFill(page, '#companyStreetName', businessData.streetAddress);
  await safeFill(page, '#companyUnit', businessData.streetAddressLine2);
  await safeFill(page, '#companyCity', businessData.city);
  await selectMui(page, 'mui-6', businessData.billingState);
  await safeFill(page, '#companyZip', businessData.zipCode);
  console.log('Filled: Business Information');

  // ── Loan Information ──
  await safeFill(page, '#loanAmount', businessData.loanAmount);
  await selectMui(page, 'mui-8', businessData.loanReason);
  await selectMui(page, 'mui-10', businessData.paymentFrequency);
  await selectMui(page, 'mui-12', businessData.loanTerm);
  await safeFill(page, '#loanDescription', businessData.loanDescription);
  console.log('Filled: Loan Information');

  // ── Guarantor Information (contact1) ──
  if (contact1Data) {
    await safeFill(page, '#guarantorFirstName', contact1Data.firstName);
    await safeFill(page, '#guarantorLastName', contact1Data.lastName);
    await fillStreetNumber(page, 'mui-14', contact1Data.streetNumber);
    await safeFill(page, '#guarantorStreetName', contact1Data.streetAddress);
    await safeFill(page, '#guarantorUnit', contact1Data.unit);
    await safeFill(page, '#guarantorCity', contact1Data.city);
    await selectMui(page, 'mui-16', contact1Data.state);
    await safeFill(page, '#guarantorZip', contact1Data.zipCode);
    await safeFill(page, '#guarantorCell', contact1Data.phoneMobile || contact1Data.phone);
    await safeFill(page, '#guarantorPhoneNumber', contact1Data.phone);
    await safeFill(page, '#guarantorEmail', contact1Data.email);
    await safeFill(page, '#guarantorCpr', contact1Data.ssn);
    await safeFill(page, '#guarnatorDOB', formatDOB(contact1Data.dateOfBirth)); // typo in their id
    await safeFill(page, '#guarantorPercentage', contact1Data.percentageOwned);
    console.log('Filled: Guarantor Information');
  }

  console.log('Form populated — NOT saved or submitted.');
}

// ─── submitLoan (main entry point) ───────────────────────────────────────────

async function submitLoan(businessData_, contact1Data, contact2Data, files) {
  if (!IOU_URL) throw new Error('IOU_URL is not set');

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    slowMo: 300,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  let page;
  try {
    page = await context.newPage();
    await login(page);
    await openNewApplication(page);

    let businessData;

    if (businessData_?.demo) {
      businessData = {
        federalTaxId: '98-7654321',
        businessName: 'Test Business LLC',
        dba: 'Test DBA',
        businessType: 'LLC',
        inBusinessSince: '2020-01',
        website: 'https://example.com',
        phone: '5551234567',
        email: 'business@example.com',
        streetNumber: '123',
        streetAddress: 'Main Street',
        streetAddressLine2: 'Suite 100',
        city: 'New York',
        billingState: 'New York',
        zipCode: '10001',
        loanAmount: '50000',
        loanReason: 'Working Capital',
        paymentFrequency: 'Weekly',
        loanTerm: '12 Months',
        loanDescription: 'Test application — do not process.',
      };
      contact1Data = {
        firstName: 'John',
        lastName: 'Doe',
        streetNumber: '456',
        streetAddress: 'Oak Avenue',
        unit: 'Apt 2B',
        city: 'New York',
        state: 'New York',
        zipCode: '10001',
        phoneMobile: '5559876543',
        phone: '5551112222',
        email: 'john.doe@example.com',
        ssn: '123-45-6789',
        dateOfBirth: '1985-01-15',
        percentageOwned: 100,
      };
    } else {
      businessData = businessData_;
    }

    await fillApplicationForm(page, businessData, contact1Data);

    const screenshot = await page.screenshot({ fullPage: true });
    console.log('Screenshot taken.');

    if (businessData_?.salesforceRecordId) {
      const title = `IOU Financial Submission - ${businessData_.businessName || 'Demo'}`;
      const result = await uploadScreenshot(screenshot.toString('base64'), title, businessData_.salesforceRecordId);
      console.log(`Screenshot uploaded to Salesforce: ${JSON.stringify(result)}`);
    }

    return { success: true, message: 'Application form populated — not submitted.' };
  } catch (err) {
    // Upload a screenshot of whatever the page looks like when the error occurs.
    if (page && businessData_?.salesforceRecordId) {
      try {
        const png = await page.screenshot({ fullPage: true }).catch(() => null);
        if (png) {
          const title = `IOU Error Screenshot - ${new Date().toISOString()}`;
          const result = await uploadScreenshot(png.toString('base64'), title, businessData_.salesforceRecordId);
          console.log(`Error screenshot uploaded: ${JSON.stringify(result)}`);
        }
      } catch (uploadErr) {
        console.log(`Failed to upload error screenshot: ${uploadErr.message}`);
      }
    }
    throw err;
  } finally {
    await browser.close();
  }
}

// ─── Diagnostic helpers (kept for inspection endpoints) ──────────────────────

async function dumpFields(page) {
  const fields = await page.evaluate(() => {
    const nodes = document.querySelectorAll(
      'input, textarea, select, [role="combobox"], [role="button"][aria-haspopup="listbox"]'
    );
    return [...nodes].map((el, i) => {
      const isPicklist = el.matches('[role="combobox"], [role="button"][aria-haspopup="listbox"]');
      el.setAttribute('data-dump-idx', i);
      return {
        idx: i,
        control: isPicklist ? 'picklist' : el.tagName.toLowerCase(),
        type: isPicklist ? null : el.getAttribute('type'),
        name: el.getAttribute('name'),
        id: el.id || null,
        placeholder: el.getAttribute('placeholder') || (isPicklist ? el.innerText.trim() : null),
        required: el.required || el.getAttribute('aria-required') === 'true' || null,
      };
    });
  });

  for (const field of fields) {
    if (field.control !== 'picklist') continue;
    const combo = page.locator(`[data-dump-idx="${field.idx}"]`);
    try {
      await combo.click();
      await page.waitForSelector('[role="listbox"] [role="option"]', { timeout: 5_000 });
      field.options = await page.locator('[role="listbox"] [role="option"]')
        .allInnerTexts()
        .then(arr => arr.map(s => s.trim()).filter(Boolean));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    } catch (err) {
      field.optionsError = err.message;
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  return fields;
}

async function settleAndLog(page, label) {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {
    console.log(`${label}: networkidle not reached in 20s (continuing).`);
  });
  await page.waitForFunction(
    () => (document.body?.innerText || '').trim().length > 0,
    { timeout: 10_000 }
  ).catch(() => console.log(`${label}: no visible body text after 10s (continuing).`));
  await page.waitForTimeout(2500);
  const title = await page.title().catch(() => '');
  console.log(`${label}: ${page.url()} — "${title}"`);
}

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

    const finalUrl = page.url();
    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) || '');
    const fields = await dumpFields(page);
    const loginPage = { finalUrl, title, bodyText, fields };
    console.log(`Login page: ${title}`);

    let loggedIn = null;
    let loginError = null;

    if (IOU_USERNAME && IOU_PASSWORD) {
      try {
        await page.fill('#user_email', IOU_USERNAME);
        await page.fill('#user_password', IOU_PASSWORD);
        const beforeUrl = page.url();
        await Promise.all([
          page.waitForURL(u => u.toString() !== beforeUrl, { timeout: 30_000 }).catch(() => {}),
          page.click('input[type="submit"], button[type="submit"]'),
        ]);
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
        const loggedInFields = await dumpFields(page);
        loggedIn = { finalUrl: page.url(), title: await page.title(), fields: loggedInFields };
        console.log(`Post-login URL: ${loggedIn.finalUrl}`);
      } catch (err) {
        loginError = err.message;
        console.log(`Login attempt failed: ${err.message}`);
      }
    }

    return { success: true, status, loginPage, loggedIn, loginError, consoleLogs, failedRequests };
  } finally {
    await browser.close();
  }
}

async function screenshot({ preSubmit = false, newApplication = false, fillTestData = false } = {}) {
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
          await Promise.all([
            page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {}),
            page.click('input[type="submit"], button[type="submit"]'),
          ]);
          await settleAndLog(page, 'Post-login');

          if (newApplication) {
            console.log('Opening New Application...');
            await page.click('[data-cy="new-app"]');
            await settleAndLog(page, 'New Application');

            if (fillTestData) {
              await submitLoan({ demo: true }, null, null, null);
            } else {
              const fields = await dumpFields(page);
              const picklists = fields.filter(f => f.control === 'picklist').length;
              console.log(`New Application: ${fields.length} fields (${picklists} picklists).`);
              console.log(`FIELDS_JSON ${JSON.stringify(fields)}`);
            }
          }
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

async function screenshotToSalesforce(recordId = DEFAULT_SF_RECORD_ID, options = {}) {
  if (!recordId) throw new Error('No Salesforce recordId provided (and no default set)');
  const png = await screenshot(options);
  const title = `iou Portal Screenshot - ${new Date().toISOString()}`;
  console.log(`Uploading iou screenshot to Salesforce record ${recordId}...`);
  const result = await uploadScreenshot(png.toString('base64'), title, recordId);
  console.log(`Uploaded: ${JSON.stringify(result)}`);
  return { success: true, recordId, contentVersion: result };
}

module.exports = { submitLoan, inspect, screenshot, screenshotToSalesforce };
