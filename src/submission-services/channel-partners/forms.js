const { inputByLabel, inputIdByLabel, waitForLabel, waitForValue, pickVuetifyOption, openDropdown, dismissCookieBanner } = require('../../helpers/vuetify');

const TEST_DATA = {
  businessName: 'Testing Portal Submissions (Nazar)',
  dba: 'Testing Portal Submissions (Nazar) DBA',
  federalTaxId: '12-3456789',
  useOfFunds: 'Advertising',
  businessType: null,
  industry: 'Retail',
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

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STATE_NAMES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'District Of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah',
  'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];

const STATE_ABBREVIATIONS = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District Of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

function mapState(value, label = 'State') {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^[A-Za-z]{2}$/.test(raw)) {
    const name = STATE_ABBREVIATIONS[raw.toUpperCase()];
    if (name) return name;
  }
  const match = STATE_NAMES.find(n => n.toLowerCase() === raw.toLowerCase());
  if (match) return match;

  console.log(`${label}: "${raw}" is not a state this portal offers — leaving it empty`);
  return null;
}

const USE_OF_FUNDS_OPTIONS = [
  'Advertising', 'Business Expansion', 'Cash Flow', 'Debt',
  'Equipment', 'General Working Capital', 'Growth Oriented', 'Inventory',
];

const USE_OF_FUNDS_DEFAULT = 'General Working Capital';

const USE_OF_FUNDS_KEYWORDS = [
  [/advertis|marketing/i, 'Advertising'],
  [/expansion|expand/i, 'Business Expansion'],
  [/cash ?flow/i, 'Cash Flow'],
  [/debt|refinanc|consolidat/i, 'Debt'],
  [/equipment|machinery|vehicle/i, 'Equipment'],
  [/growth/i, 'Growth Oriented'],
  [/inventory/i, 'Inventory'],
  [/working capital|payroll|operating/i, 'General Working Capital'],
];

function mapUseOfFunds(value) {
  const first = Array.isArray(value) ? value[0] : String(value ?? '').split(/;|,/)[0];
  const raw = String(first ?? '').trim();
  if (!raw) return USE_OF_FUNDS_DEFAULT;

  const exact = USE_OF_FUNDS_OPTIONS.find(o => o.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;

  const keyword = USE_OF_FUNDS_KEYWORDS.find(([re]) => re.test(raw));
  if (keyword) {
    console.log(`Use of Funds: "${raw}" -> "${keyword[1]}"`);
    return keyword[1];
  }

  console.log(`Use of Funds: "${raw}" is not a portal option — using "${USE_OF_FUNDS_DEFAULT}"`);
  return USE_OF_FUNDS_DEFAULT;
}

async function selectExact(page, label, value, nth = 0) {
  if (!value) {
    console.log(`${label}: no value to select — leaving it empty`);
    return false;
  }
  await openDropdown(page, label, nth);
  const options = page.locator('.v-overlay__content .v-list-item', { hasNotText: /no data/i });
  await options.first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});

  const match = options.filter({ hasText: new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`) }).first();
  if (!(await match.count())) {
    const available = (await options.allInnerTexts()).map(s => s.trim()).filter(Boolean);
    await page.keyboard.press('Escape').catch(() => {});
    console.log(`${label}: "${value}" not found — leaving it empty. Options: ${available.join(' | ')}`);
    return false;
  }
  await match.click();
  console.log(`Selected: ${label} = ${value}`);
  return true;
}

const VERIFIED_ICON = '.mdi-check-circle';
const VERIFICATION_DIALOG = '.v-overlay__content:has-text("Address Verification")';

function hasBlockingScrim(page) {
  return page.evaluate(() => [...document.querySelectorAll('.v-overlay__scrim')].some(scrim => {
    const style = getComputedStyle(scrim);
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0.01;
  })).catch(() => false);
}

async function waitForOverlayGone(page, context) {
  for (let waited = 0; waited < 10; waited += 1) {
    if (!(await hasBlockingScrim(page))) return true;
    await page.waitForTimeout(1_000);
  }

  console.log(`${context}: overlay still blocking after 10s — pressing Escape`);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(1_000);

  const stuck = await hasBlockingScrim(page);
  if (stuck) console.log(`${context}: WARNING — an overlay is still covering the page`);
  return !stuck;
}

async function verifyAddress(page, sectionLabel, nth = 0) {
  const button = page.getByRole('button', { name: /^verify$/i }).nth(nth);
  if (!(await button.count())) {
    console.log(`${sectionLabel}: no VERIFY button found`);
    return false;
  }
  if (!(await button.isVisible().catch(() => false))) {
    console.log(`${sectionLabel}: VERIFY button is not visible, skipping`);
    return false;
  }

  await button.click();
  console.log(`${sectionLabel}: clicked VERIFY`);

  const dialog = page.locator(VERIFICATION_DIALOG);
  const errorDialog = page.locator('.v-overlay__content').filter({ hasText: /could not be found|invalid address/i });

  let outcome = 'none';
  for (let waited = 0; waited < 25; waited += 1) {
    if (await dialog.isVisible().catch(() => false)) { outcome = 'verification'; break; }
    if (await errorDialog.isVisible().catch(() => false)) { outcome = 'error'; break; }
    await page.waitForTimeout(1_000);
    if (waited >= 4 && !(await hasBlockingScrim(page))) break;
  }

  if (outcome === 'verification') {
    const useVerified = dialog.getByRole('button', { name: /use verified address/i }).first();
    if (await useVerified.isVisible().catch(() => false)) {
      await useVerified.click();
      console.log(`${sectionLabel}: Address Verification dialog — chose "Use Verified Address"`);
    } else {
      const keep = dialog.getByRole('button', { name: /keep current address/i }).first();
      if (await keep.isVisible().catch(() => false)) {
        await keep.click();
        console.log(`${sectionLabel}: no verified option offered — kept the current address`);
      }
    }
    await dialog.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  } else if (outcome === 'error') {
    const text = (await errorDialog.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 120);
    console.log(`${sectionLabel}: portal could not verify this address — "${text}". Keeping the address as entered.`);
    const ok = errorDialog.getByRole('button', { name: /^ok$/i }).first();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await errorDialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  } else {
    console.log(`${sectionLabel}: no verification dialog (address accepted as entered)`);
  }

  const verified = await page.locator(`${VERIFIED_ICON}:visible`).first()
    .waitFor({ state: 'visible', timeout: outcome === 'error' ? 3_000 : 10_000 }).then(() => true, () => false);
  if (verified) console.log(`${sectionLabel}: address verified`);
  else if (outcome !== 'error') console.log(`${sectionLabel}: WARNING — no green check after verifying`);

  await waitForOverlayGone(page, sectionLabel);
  return verified;
}

async function fillStreetAutocomplete(page, input, value, nth) {
  await input.click();
  await input.fill(value);
  await pickVuetifyOption(page, null);
  await page.keyboard.press('Escape');
  const city = await inputByLabel(page, 'City', nth);
  if (city) await waitForValue(page, city);
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
    if (!el) {
      console.log(`contact[${contactIndex}]: WARNING — "${label}" not found, value NOT set`);
      continue;
    }
    await el.fill(String(value));
    const written = await el.inputValue().catch(() => '');
    if (!written) console.log(`contact[${contactIndex}]: WARNING — "${label}" is still empty after filling`);
    else console.log(`Filled contact[${contactIndex}]: ${label}`);
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
    const staleStreetId = await inputIdByLabel(page, 'Street Address', n);

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
    console.log(`Cleared contact[${contactIndex}]: Same as Billing or Shipping Address`);
    if (staleStreetId) {
      await page.locator(`#${staleStreetId}`).waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
    }
    await waitForLabel(page, 'Street Address', n, 5_000).catch(() => {});

    const streetEl = await inputByLabel(page, 'Street Address', n);
    if (streetEl) {
      await fillStreetAutocomplete(page, streetEl, contactData.streetAddress, n);
      console.log(`Filled contact[${contactIndex}]: Street Address`);
    }

    const line2 = await inputByLabel(page, 'Street Address Line 2', n);
    if (line2 && contactData.streetAddressLine2) { await line2.fill(contactData.streetAddressLine2); }

    const city = await inputByLabel(page, 'City', n);
    if (city && contactData.city) { await city.fill(contactData.city); }

    const zip = await inputByLabel(page, 'Zip Code', n);
    if (zip && contactData.zipCode) { await zip.fill(String(contactData.zipCode)); }

    await selectExact(page, 'State', mapState(contactData.state, `contact[${contactIndex}] State`), n);

    await verifyAddress(page, `contact[${contactIndex}] Address`, n);
  }
}

async function fillApplicationForm(page, data) {
  await dismissCookieBanner(page);

  const bizSearch = await inputByLabel(page, 'Search businesses');
  if (bizSearch && data.businessName) {
    await bizSearch.fill(data.businessName);
    console.log('Business search filled');
  }

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

  if (data.inBusinessSince) {
    const dateEl = await inputByLabel(page, 'In Business Since');
    if (dateEl) { await dateEl.fill(data.inBusinessSince); console.log('Filled: In Business Since'); }
  }

  await selectExact(page, 'Use of Funds', mapUseOfFunds(data.useOfFunds));

  await selectExact(page, 'Business Type', data.businessType);

  if (data.industry) {
    const industry = await inputByLabel(page, 'Industry');
    if (industry) {
      await industry.click();
      await industry.fill(data.industry);
      if (await pickVuetifyOption(page, data.industry, 5_000, false)) {
        console.log(`Selected: Industry (${data.industry})`);
      } else {
        await page.keyboard.press('Escape');
        await industry.fill('');
        console.log(`Industry "${data.industry}" not found in portal options, left empty`);
      }
    }
  }

  const incorporationState = mapState(data.billingState, 'State Of Incorporation');
  console.log(`State Of Incorporation derived from billingState "${data.billingState}" -> "${incorporationState || 'none'}"`);
  await selectExact(page, 'State Of Incorporation', incorporationState);

  const billingStreet = await inputByLabel(page, 'Street Address', 0);
  if (billingStreet && data.streetAddress) {
    await fillStreetAutocomplete(page, billingStreet, data.streetAddress, 0);
    console.log('Filled: Billing Street Address');
  }

  const billingLine2 = await inputByLabel(page, 'Street Address Line 2', 0);
  if (billingLine2 && data.streetAddressLine2) { await billingLine2.fill(data.streetAddressLine2); }

  const billingCity = await inputByLabel(page, 'City', 0);
  if (billingCity && data.city) { await billingCity.fill(data.city); console.log('Filled: City'); }

  const billingZip = await inputByLabel(page, 'Zip Code', 0);
  if (billingZip && data.zipCode) { await billingZip.fill(String(data.zipCode)); console.log('Filled: Zip Code'); }

  await selectExact(page, 'State', mapState(data.billingState, 'Billing State'), 0);

  await verifyAddress(page, 'Billing Address', 0);

  const sameAsBilling = await inputByLabel(page, 'Same as Billing Address');
  if (sameAsBilling) {
    await waitForOverlayGone(page, 'Same as Billing Address');
    await sameAsBilling.check({ timeout: 20_000 }).catch(async err => {
      console.log(`Same as Billing checkbox blocked (${err.message.split('\n')[0]}) — retrying with a forced click`);
      await sameAsBilling.click({ force: true });
    });
    console.log('Checked: Same as Billing');
  }
}

module.exports = { fillApplicationForm, fillContactForm, verifyAddress, mapState, mapUseOfFunds, TEST_DATA, TEST_CONTACTS };
