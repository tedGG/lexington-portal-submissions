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

  await openDropdown(page, 'Use of Funds');
  await pickVuetifyOption(page, data.useOfFunds || null);
  console.log('Selected: Use of Funds');

  await openDropdown(page, 'Business Type');
  await pickVuetifyOption(page, data.businessType || null);
  console.log('Selected: Business Type');

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

module.exports = { fillApplicationForm, fillContactForm, verifyAddress, TEST_DATA, TEST_CONTACTS };
