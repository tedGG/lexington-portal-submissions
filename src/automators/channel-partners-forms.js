const { inputByLabel, inputIdByLabel, waitForLabel, waitForValue, pickVuetifyOption, openDropdown, dismissCookieBanner } = require('../helpers/vuetify');

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

    await openDropdown(page, 'State', n);
    await pickVuetifyOption(page, contactData.state || null);
    console.log(`Selected contact[${contactIndex}]: State`);
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

  await openDropdown(page, 'Use of Funds');
  await pickVuetifyOption(page, data.useOfFunds || null);
  console.log('Selected: Use of Funds');

  await openDropdown(page, 'Business Type');
  await pickVuetifyOption(page, data.businessType || null);
  console.log('Selected: Business Type');

  if (data.industry) {
    await openDropdown(page, 'Industry');
    if (await pickVuetifyOption(page, data.industry, 5_000, false)) {
      console.log(`Selected: Industry (${data.industry})`);
    } else {
      await page.keyboard.press('Escape');
      console.log(`Industry "${data.industry}" not found in portal options, left empty`);
    }
  }

  await openDropdown(page, 'State Of Incorporation');
  await pickVuetifyOption(page, data.stateOfIncorporation || null);
  console.log('Selected: State Of Incorporation');

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

  await openDropdown(page, 'State');
  await pickVuetifyOption(page, data.billingState || null);
  console.log('Selected: Billing State');

  const sameAsBilling = await inputByLabel(page, 'Same as Billing Address');
  if (sameAsBilling) { await sameAsBilling.check(); console.log('Checked: Same as Billing'); }
}

module.exports = { fillApplicationForm, fillContactForm, TEST_DATA, TEST_CONTACTS };
