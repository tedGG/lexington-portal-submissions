async function selectReactSelect(page, fieldId, optionText) {
  await page.click(`[data-testid="${fieldId}-control"]`);
  await page.waitForTimeout(400);
  await page.getByRole('option', { name: optionText, exact: true }).click();
  console.log(`Selected "${optionText}" for ${fieldId}`);
}

function esc(id) {
  return id.replace(/\./g, '\\.');
}

async function fillMasked(page, id, value) {
  await page.click(`#${esc(id)}`);
  await page.keyboard.type(value.replace(/\D/g, ''), { delay: 80 });
  console.log(`Filled masked: ${id}`);
}

// readonly masked inputs (taxId, ssn) — remove readonly, click, type digits
async function fillReadonly(page, id, value) {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (el) el.removeAttribute('readonly');
  }, id);
  await page.click(`#${esc(id)}`);
  await page.keyboard.type(value.replace(/\D/g, ''), { delay: 80 });
  console.log(`Filled readonly: ${id}`);
}

async function fillBusinessInformation(page, data) {
  await page.fill('#businessInformation\\.companyName', data.companyName);
  console.log('Filled: companyName');

  if (data.dba) {
    await page.fill('#businessInformation\\.dba', data.dba);
    console.log('Filled: dba');
  }

  if (data.industryCategory) {
    await selectReactSelect(page, 'businessInformation.industryCategory', data.industryCategory);
  }

  if (data.taxId) {
    await fillReadonly(page, 'businessInformation.taxId', data.taxId);
  }

  if (data.legalStructure) {
    await selectReactSelect(page, 'businessInformation.legalStructure', data.legalStructure);
  }

  if (data.inceptionMonth) {
    await selectReactSelect(page, 'businessInformation.inceptionMonth', data.inceptionMonth);
  }

  if (data.inceptionYear) {
    await selectReactSelect(page, 'businessInformation.inceptionYear', data.inceptionYear);
  }

  await fillMasked(page, 'businessInformation.companyPhone', data.companyPhone);

  await page.fill('#businessInformation\\.companyEmail', data.companyEmail);
  console.log('Filled: companyEmail');

  if (data.websitePresent !== undefined) {
    await selectReactSelect(page, 'businessInformation.websitePresent', data.websitePresent ? 'Yes' : 'No');
  }

  await page.fill('#businessInformation\\.address', data.address);
  console.log('Filled: address');

  await page.fill('#businessInformation\\.city', data.city);
  console.log('Filled: city');

  if (data.state) {
    await selectReactSelect(page, 'businessInformation.state', data.state);
  }

  await fillMasked(page, 'businessInformation.zip', data.zip);
}

async function fillOwner(page, owner, index) {
  const p = (field) => `owners.${index}.${field}`;

  if (owner.ownership) {
    await page.fill(`#${esc(p('ownership'))}`, String(owner.ownership));
    console.log(`Filled owner[${index}]: ownership`);
  }

  await page.fill(`#${esc(p('firstName'))}`, owner.firstName);
  console.log(`Filled owner[${index}]: firstName`);

  await page.fill(`#${esc(p('lastName'))}`, owner.lastName);
  console.log(`Filled owner[${index}]: lastName`);

  if (owner.dateOfBirth) {
    await page.fill(`#${esc(p('dateOfBirth'))}`, owner.dateOfBirth);
    await page.keyboard.press('Escape');
    console.log(`Filled owner[${index}]: dateOfBirth`);
  }

  if (owner.ssn) {
    await fillReadonly(page, p('ssn'), owner.ssn);
  }

  await page.fill(`#${esc(p('address'))}`, owner.address);
  console.log(`Filled owner[${index}]: address`);

  await page.fill(`#${esc(p('city'))}`, owner.city);
  console.log(`Filled owner[${index}]: city`);

  if (owner.state) {
    await selectReactSelect(page, p('state'), owner.state);
  }

  await fillMasked(page, p('zip'), owner.zip);

  if (owner.phone) {
    await fillMasked(page, p('phone'), owner.phone);
  }

  if (owner.email) {
    await page.fill(`#${esc(p('email'))}`, owner.email);
    console.log(`Filled owner[${index}]: email`);
  }
}

async function fillOwners(page, owners) {
  for (let i = 0; i < owners.length; i++) {
    if (i > 0) {
      await page.getByRole('button', { name: /add owner/i }).click();
      await page.waitForTimeout(1000);
      console.log(`Added owner ${i + 1}`);
    }
    await fillOwner(page, owners[i], i);
  }
}

async function fillFinancialInformation(page, data) {
  if (data.monthlyRevenue) {
    await page.fill('#financialInformation\\.monthlyRevenue', String(data.monthlyRevenue));
    console.log('Filled: monthlyRevenue');
  }

  if (data.hasRequestedAmount !== undefined) {
    await selectReactSelect(page, 'financialInformation.hasRequestedAmount', data.hasRequestedAmount ? 'Yes' : 'No');
  }
}

const TEST_DATA = {
  business: {
    companyName: 'Testing Portal Submissions (Nazar)',
    dba: 'Test DBA',
    industryCategory: 'Retail',
    taxId: '12-3456789',
    legalStructure: 'Corporation',
    inceptionMonth: 'January',
    inceptionYear: '2020',
    companyPhone: '5551234567',
    companyEmail: 'test@example.com',
    websitePresent: false,
    address: '123 Test Street',
    city: 'New York',
    state: 'New York',
    zip: '10001',
  },
  owners: [
    {
      ownership: 50,
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '01/15/1985',
      ssn: '123-45-6789',
      address: '123 Test Street',
      city: 'New York',
      state: 'New York',
      zip: '10001',
      phone: '5559876543',
      email: 'john.doe@example.com',
    },
    {
      ownership: 50,
      firstName: 'Teo',
      lastName: 'Smith',
      dateOfBirth: '01/15/1985',
      ssn: '123-45-6789',
      address: '123 Test Street',
      city: 'New York',
      state: 'New York',
      zip: '10001',
      phone: '5559876543',
      email: 'john.doe@example.com',
    },
  ],
  financial: {
    monthlyRevenue: '50000',
    hasRequestedAmount: true,
  },
};

module.exports = { fillBusinessInformation, fillOwners, fillFinancialInformation, TEST_DATA };
