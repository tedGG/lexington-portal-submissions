const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const { loadSession, saveSession, clearSession } = require('../sessionManager');

const SESSION_KEY = 'channel-partners';
const { CHANNEL_PARTNERS_URL, CHANNEL_PARTNERS_USERNAME, CHANNEL_PARTNERS_PASSWORD } = process.env;

const TEST_DATA = {
  businessName: 'Acme',
  dba: 'Acme DBA',
  federalTaxId: '12-3456789',
  useOfFunds: 'Advertising',
  businessType: null,
  stateOfIncorporation: null,
  phone: '5551234567',
  email: 'test@acmecorp.com',
  grossAnnualSales: '500000',
  inBusinessSince: '2020-01-15',
  website: 'https://acmecorp.com',
  streetAddress: '123 Main Street',
  streetAddressLine2: 'Suite 100',
  city: 'Los Angeles',
  zipCode: '90001',
  billingState: null,
};

const TEST_CONTACTS = [
  {
    firstName: 'John',
    lastName: 'Doe',
    middleName: null,
    suffix: null,
    phone: '5559876543',
    mobilePhone: null,
    ssn: '122-33-1313',
    email: 'john.doe@acmecorp.com',
    percentageOwned: '60',
    dateOfBirth: '1980-05-15',
    streetAddress: '456 Oak Avenue',
    streetAddressLine2: null,
    city: 'Los Angeles',
    zipCode: '90001',
    state: null,
  },
  {
    firstName: 'Jane',
    lastName: 'Smith',
    middleName: null,
    suffix: null,
    phone: '5554321987',
    mobilePhone: null,
    ssn: '987-65-4321',
    email: 'jane.smith@acmecorp.com',
    percentageOwned: '40',
    dateOfBirth: '1985-09-22',
    streetAddress: '789 Pine Street',
    streetAddressLine2: null,
    city: 'San Francisco',
    zipCode: '94102',
    state: null,
  },
];

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

async function inputByLabel(page, labelText, nth = 0) {
  const id = await page.evaluate(({ text, nth }) => {
    const normalize = s => s?.trim().replace(/\s*\*\s*$/, '').trim();
    const isVisible = el => el.offsetParent !== null;
    const labels = [...document.querySelectorAll('label')].filter(
      l => normalize(l.innerText) === normalize(text) && isVisible(l)
    );
    return labels[nth]?.getAttribute('for') || null;
  }, { text: labelText, nth });
  if (!id) { console.log(`Label not found: "${labelText}" [${nth}]`); return null; }
  return page.locator(`#${id}`);
}

async function pickVuetifyOption(page, text) {
  await page.waitForTimeout(800);
  const options = page.locator('.v-overlay__content .v-list-item');
  const count = await options.count();
  const texts = [];
  for (let i = 0; i < count; i++) texts.push(await options.nth(i).innerText().catch(() => ''));
  console.log('Dropdown options:', texts);
  if (count === 0) { console.log('No dropdown options found'); return; }
  if (text) {
    const match = options.filter({ hasText: text }).first();
    if (await match.isVisible().catch(() => false)) { await match.click(); return; }
  }
  await options.first().click();
  await page.waitForTimeout(300);
}

async function openDropdown(page, labelText, nth = 0) {
  const input = await inputByLabel(page, labelText, nth);
  if (!input) { console.log(`Dropdown not found: ${labelText} [${nth}]`); return; }
  await input.locator('xpath=ancestor::div[contains(@class,"v-field")][1]').click();
}

async function fillContactForm(page, contactData, contactIndex = 0) {
  const n = contactIndex;

  const textFields = [
    ['First Name', contactData.firstName, n],
    ['Last Name', contactData.lastName, n],
    ['Middle Name', contactData.middleName, n],
    ['Suffix', contactData.suffix, n],
    ['Phone Number', contactData.phone, n],
    ['Mobile Number', contactData.mobilePhone, n],
    ['Email', contactData.email, n],
    ['Percentage Owned', contactData.percentageOwned, n],
  ];

  for (const [label, value, nth] of textFields) {
    if (!value) continue;
    const el = await inputByLabel(page, label, nth);
    if (el) { await el.fill(String(value)); console.log(`Filled contact[${contactIndex}]: ${label}`); }
  }

  if (contactData.ssn) {
    const el = await inputByLabel(page, 'Social Security Number', n);
    if (el) { await el.fill(contactData.ssn); console.log(`Filled contact[${contactIndex}]: SSN`); }
  }

  if (contactData.dateOfBirth) {
    const el = await inputByLabel(page, 'Date of Birth', n);
    if (el) { await el.fill(contactData.dateOfBirth); console.log(`Filled contact[${contactIndex}]: Date of Birth`); }
  }

  if (contactData.streetAddress) {
    // Clear "Same as" via Vue's reactive model so address fields become visible/editable
    await page.evaluate((nth) => {
      const normalize = s => s?.trim().replace(/\s*\*\s*$/, '').trim();
      const labels = [...document.querySelectorAll('label')].filter(
        l => normalize(l.innerText) === 'Same as Billing or Shipping Address' && l.offsetParent !== null
      );
      const label = labels[nth];
      if (!label) return;
      let el = document.getElementById(label.getAttribute('for'))?.parentElement;
      while (el) {
        const vue = el.__vueParentComponent;
        if (vue?.vnode?.props?.['onUpdate:modelValue']) {
          vue.vnode.props['onUpdate:modelValue'](null);
          return;
        }
        el = el.parentElement;
      }
    }, n);
    await page.waitForTimeout(800);
    console.log(`Cleared contact[${contactIndex}]: Same as Billing or Shipping Address`);

    const streetEl = await inputByLabel(page, 'Street Address', n);
    if (streetEl) {
      await streetEl.click();
      await streetEl.fill(contactData.streetAddress);
      await page.waitForTimeout(1500);
      await pickVuetifyOption(page, null);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      console.log(`Filled contact[${contactIndex}]: Street Address`);
    }

    const line2 = await inputByLabel(page, 'Street Address Line 2', n);
    if (line2 && contactData.streetAddressLine2) { await line2.fill(contactData.streetAddressLine2); }

    const city = await inputByLabel(page, 'City', n);
    if (city && contactData.city) { await city.fill(contactData.city); }

    const zip = await inputByLabel(page, 'Zip Code', n);
    if (zip && contactData.zipCode) { await zip.fill(String(contactData.zipCode)); }

    await openDropdown(page, 'State', n);
    await pickVuetifyOption(page, contactData.state || null);
    console.log(`Selected contact[${contactIndex}]: State`);
  }
}

async function fillApplicationForm(page, data) {
  // Cookie banner
  try {
    await page.locator('button', { hasText: /^ALLOW COOKIES$/ }).click({ timeout: 3000 });
    await page.waitForTimeout(600);
    console.log('Cookie banner dismissed');
  } catch {
    console.log('No cookie banner');
  }

  // Business search — just type, picking autocomplete resets the form via Vue reactivity
  const bizSearch = await inputByLabel(page, 'Search businesses');
  if (bizSearch && data.businessName) {
    await bizSearch.fill(data.businessName);
    console.log('Business search filled');
  }

  // Plain text / number fields
  const textFields = [
    ['DBA', data.dba],
    ['Federal Tax ID', data.federalTaxId],
    ['Phone Number', data.phone],
    ['Business Email', data.email],
    ['Gross Annual Sales', data.grossAnnualSales],
    ['Website', data.website],
  ];
  for (const [label, value] of textFields) {
    if (!value) continue;
    const el = await inputByLabel(page, label);
    if (el) { await el.fill(String(value)); console.log(`Filled: ${label}`); }
  }

  // Date
  if (data.inBusinessSince) {
    const dateEl = await inputByLabel(page, 'In Business Since');
    if (dateEl) { await dateEl.fill(data.inBusinessSince); console.log('Filled: In Business Since'); }
  }

  // Dropdowns
  await openDropdown(page, 'Use of Funds');
  await pickVuetifyOption(page, data.useOfFunds || null);
  console.log('Selected: Use of Funds');

  await openDropdown(page, 'Business Type');
  await pickVuetifyOption(page, data.businessType || null);
  console.log('Selected: Business Type');

  await openDropdown(page, 'State Of Incorporation');
  await pickVuetifyOption(page, data.stateOfIncorporation || null);
  console.log('Selected: State Of Incorporation');

  // Billing Address
  const billingStreet = await inputByLabel(page, 'Street Address', 0);
  if (billingStreet && data.streetAddress) {
    await billingStreet.click();
    await billingStreet.fill(data.streetAddress);
    await page.waitForTimeout(1500);
    await pickVuetifyOption(page, null);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    console.log('Filled: Billing Street Address');
  }

  const billingLine2 = await inputByLabel(page, 'Street Address Line 2', 0);
  if (billingLine2 && data.streetAddressLine2) { await billingLine2.fill(data.streetAddressLine2); }

  const billingCity = await inputByLabel(page, 'City', 0);
  if (billingCity && data.city) { await billingCity.fill(data.city); console.log('Filled: City'); }

  const billingZip = await inputByLabel(page, 'Zip Code', 0);
  if (billingZip && data.zipCode) { await billingZip.fill(String(data.zipCode)); console.log('Filled: Zip Code'); }

  await openDropdown(page, 'State');
  await pickVuetifyOption(page, data.billingState || null);
  console.log('Selected: Billing State');

  const sameAsBilling = await inputByLabel(page, 'Same as Billing Address');
  if (sameAsBilling) { await sameAsBilling.check(); console.log('Checked: Same as Billing'); }
}

async function submitLoan(businessData, contact1Data, contact2Data) {
  const browser = await chromium.launch({
    headless: true,
    slowMo: 800,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  try {
    const sessionLoaded = await loadSession(context, SESSION_KEY);
    console.log(`Session loaded: ${sessionLoaded}`);
    const page = await context.newPage();

    if (sessionLoaded) {
      await page.goto(`${CHANNEL_PARTNERS_URL}/`);
      await page.waitForLoadState('networkidle');
      const loggedIn = await isLoggedIn(page);
      console.log(`Is logged in: ${loggedIn}, URL: ${page.url()}`);
      if (!loggedIn) {
        clearSession(SESSION_KEY);
        await login(page, context);
      }
    } else {
      await login(page, context);
    }

    await page.waitForLoadState('networkidle');
    console.log(`Page URL after auth: ${page.url()}`);
    await page.screenshot({ path: '/tmp/channel-partners-after-login.png', fullPage: true });
    await saveSession(context, SESSION_KEY);

    await page.getByRole('button', { name: /new application/i }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    const data = businessData.demo ? TEST_DATA : businessData;
    await fillApplicationForm(page, data);

    // Navigate to Contacts tab
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

    await page.screenshot({ path: '/tmp/channel-partners-new-application.png', fullPage: true });
    await page.waitForTimeout(10000);

    return { success: true, message: 'Application form filled' };
  } finally {
    await browser.close();
  }
}

module.exports = { submitLoan };
