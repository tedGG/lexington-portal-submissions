const TEST_DATA = {
  businessName: 'Lexington Portal Test (not process)',
  dba: 'Lexington Portal Test (not process)',
  inBusinessSince: '2022-01-15',
  annualRevenue: '480000',
  website: 'www.acmecorp.com',
  loanAmount: '150000',
  streetAddress: '123 Main Street',
  city: 'Los Angeles',
  billingState: 'California',
  zipCode: '90001',
  industry: 'Restaurant & Food Services',
  useOfFunds: 'Working Capital',
  timeline: '📅 Within 30 Days',
  businessType: 'LLC',
  stateOfFormation: 'California',
  federalTaxId: '12-3456789',
  businessRegistrationDate: '2020-01-15',
  hasOpenLoans: false,
  ownsInvestmentProperty: false,
};

const TEST_CONTACT = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@acmecorp.com',
  phone: '5559876543',
  dateOfBirth: '1985-04-12',
  ssn: '122-33-1313',
  homeOwnership: 'Own',
  streetAddress: '456 Oak Avenue',
  city: 'Los Angeles',
  state: 'California',
  zipCode: '90001',
  creditScore: 720,
  percentageOwned: 60,
};

const TEST_CONTACT_2 = {
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane.smith@acmecorp.com',
  phone: '5554321987',
  dateOfBirth: '1988-09-22',
  ssn: '987-65-4321',
  homeOwnership: 'Rent',
  streetAddress: '789 Pine Street',
  city: 'San Francisco',
  state: 'California',
  zipCode: '94102',
  creditScore: 680,
  percentageOwned: 40,
};

const OPERATING_TIME_OPTIONS = ['Less than 6 months', '1-2 years', '3-4 years', '5-9 years', '10+ years'];
const REVENUE_OPTIONS = ['Under $10,000', '$10,000 - $20,000', '$20,000 - $30,000', '$30,000 - $50,000', '$50,000 - $100,000', '$100,000 - $200,000', '$200,000+'];
const LOAN_AMOUNT_OPTIONS = ['$10,000', '$25,000', '$50,000', '$75,000', '$100,000', '$150,000', '$200,000', '$250,000', '$500,000+'];

const INDUSTRY_OPTIONS = [
  'Agriculture', 'Automotive', 'Construction', 'Contracting', 'E-commerce', 'Education',
  'Energy and Utilities', 'Financial Services', 'Government & Related', 'Health & Medical Services',
  'Information Technology', 'Lodging', 'Manufacturing', 'Media & Publishing', 'Personal Services',
  'Professional Services', 'Real Estate', 'Recreation', 'Restaurant & Food Services', 'Retail',
  'Salons & Spas', 'Transportation and Logistics', 'Other',
];

const ENTITY_TYPE_OPTIONS = ['Sole Proprietorship', 'LLC', 'Corporation', 'Partnership', 'S-Corp', 'Non-Profit'];

const LOAN_PURPOSE_OPTIONS = [
  'Working Capital', 'Equipment Purchase', 'Inventory', 'Expansion', 'Payroll',
  'Renovations', 'Marketing', 'Debt Consolidation', 'Emergency Expenses', 'Other',
];

const TIMELINE_OPTIONS = ['\u{1F525} ASAP — I need it now', '\u26A1 This Week', '\u{1F4C5} Within 30 Days', '\u{1F50D} Just Exploring'];

function digitsOnly(value) {
  return value ? String(value).replace(/\D/g, '') : null;
}

function isoDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function monthsInBusiness(since) {
  if (!since) return null;
  const start = new Date(since);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
}

function mapOperatingTime(inBusinessSince) {
  const months = monthsInBusiness(inBusinessSince);
  if (months === null || months < 0) return null;
  if (months < 6) return 'Less than 6 months';
  if (months < 36) return '1-2 years';
  if (months < 60) return '3-4 years';
  if (months < 120) return '5-9 years';
  return '10+ years';
}

function mapMonthlyRevenue(annualRevenue) {
  const annual = toNumber(annualRevenue);
  if (annual === null) return null;
  const monthly = annual / 12;
  if (monthly < 10_000) return 'Under $10,000';
  if (monthly < 20_000) return '$10,000 - $20,000';
  if (monthly < 30_000) return '$20,000 - $30,000';
  if (monthly < 50_000) return '$30,000 - $50,000';
  if (monthly < 100_000) return '$50,000 - $100,000';
  if (monthly < 200_000) return '$100,000 - $200,000';
  return '$200,000+';
}

const LOAN_AMOUNT_TIERS = [10_000, 25_000, 50_000, 75_000, 100_000, 150_000, 200_000, 250_000];

function mapLoanRequest(loanAmount) {
  const amount = toNumber(loanAmount);
  if (amount === null) return null;
  if (amount > 250_000) return '$500,000+';
  let best = LOAN_AMOUNT_TIERS[0];
  for (const tier of LOAN_AMOUNT_TIERS) {
    if (Math.abs(tier - amount) <= Math.abs(best - amount)) best = tier;
  }
  return `$${best.toLocaleString('en-US')}`;
}

function fieldByLabel(frame, label) {
  return frame.locator(`xpath=//label[normalize-space()="${label}"]/following::*[self::input or (self::button and @role="combobox")][1]`);
}

async function fillField(frame, label, value) {
  if (value === null || value === undefined || value === '') return false;
  const field = fieldByLabel(frame, label);
  if (!(await field.count())) {
    console.log(`Field not found: "${label}"`);
    return false;
  }
  await field.fill(String(value));
  console.log(`Filled: ${label}`);
  return true;
}

async function selectField(frame, page, label, optionText) {
  if (!optionText) return false;
  const field = fieldByLabel(frame, label);
  if (!(await field.count())) {
    console.log(`Dropdown not found: "${label}"`);
    return false;
  }
  await field.click();
  const exact = optionLocator(frame, optionText);
  if (await exact.count()) {
    await exact.click();
    console.log(`Selected: ${label} = ${optionText}`);
    return true;
  }

  const other = optionLocator(frame, 'Other');
  if (await other.count()) {
    await other.click();
    console.log(`Option "${optionText}" not found for "${label}" — selected "Other" instead`);
    return true;
  }

  const available = await frame.locator('[role="option"]').allInnerTexts();
  await page.keyboard.press('Escape');
  console.log(`Option "${optionText}" not found for "${label}" and no "Other" option. Available: ${available.map(s => s.trim()).join(' | ')}`);
  return false;
}

function optionLocator(frame, text) {
  return frame.locator('[role="option"]')
    .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`) })
    .first();
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fillText(frame, label, value) {
  return fillField(frame, label, value);
}

async function selectYesNo(frame, idPrefix, value) {
  if (value === null || value === undefined) return false;
  const id = `${idPrefix}-${value ? 'yes' : 'no'}`;
  const control = frame.locator(`#${id}`).or(frame.locator(`label[for="${id}"]`)).first();
  if (!(await control.count())) {
    console.log(`Yes/No control not found: ${id}`);
    return false;
  }
  await control.click();
  console.log(`Selected: ${idPrefix} = ${value ? 'Yes' : 'No'}`);
  return true;
}

async function setSlider(frame, page, index, target, label) {
  if (target === null || target === undefined || target === '') return false;
  const slider = frame.locator('[role="slider"]').nth(index);
  if (!(await slider.count())) {
    console.log(`Slider not found: ${label}`);
    return false;
  }
  const read = async () => Number(await slider.getAttribute('aria-valuenow'));
  const min = Number(await slider.getAttribute('aria-valuemin'));
  const max = Number(await slider.getAttribute('aria-valuemax'));
  const goal = Math.min(max, Math.max(min, Number(target)));

  await slider.focus();
  await page.keyboard.press('Home');
  let current = await read();

  for (let i = 0; i < 40 && current < goal; i++) {
    await page.keyboard.press('PageUp');
    const next = await read();
    if (next > goal) { await page.keyboard.press('PageDown'); break; }
    if (next === current) break;
    current = next;
  }
  for (let i = 0; i < 200 && current < goal; i++) {
    await page.keyboard.press('ArrowRight');
    const next = await read();
    if (next === current) break;
    if (next > goal) { await page.keyboard.press('ArrowLeft'); break; }
    current = next;
  }

  const final = await read();
  console.log(`Slider ${label}: requested ${target}, set to ${final}`);
  return true;
}

async function selectRadio(frame, id, label) {
  const control = frame.locator(`#${id}`);
  if (!(await control.count())) {
    console.log(`Radio not found: ${id}`);
    return false;
  }
  await control.click();
  console.log(`Selected: ${label} = ${id}`);
  return true;
}

async function expandOwner(frame, page, index) {
  const header = frame.locator(`text=/^Owner ${index + 1}\\b/`).first();
  if (!(await header.count())) return false;
  await header.click();
  await page.waitForTimeout(800);
  return true;
}

async function fillOwner(frame, page, contact, index) {
  await fillField(frame, 'First Name', contact.firstName);
  await fillField(frame, 'Last Name', contact.lastName);
  await fillField(frame, 'Email Address', contact.email);
  await fillField(frame, 'Mobile Phone', contact.phone || contact.mobilePhone);
  await fillField(frame, 'Date of Birth', isoDate(contact.dateOfBirth));
  await fillField(frame, 'Social Security Number', digitsOnly(contact.ssn));

  if (contact.homeOwnership) {
    await selectRadio(frame, `home-${/own/i.test(contact.homeOwnership) ? 'own' : 'rent'}-${index}`, `Home Ownership (owner ${index + 1})`);
  }

  await fillField(frame, 'Street Address', contact.streetAddress);
  await fillField(frame, 'City', contact.city);
  await selectField(frame, page, 'State', contact.state);
  await fillField(frame, 'ZIP', contact.zipCode);

  await setSlider(frame, page, 0, contact.creditScore, `Personal Credit Score (owner ${index + 1})`);
  await setSlider(frame, page, 1, contact.percentageOwned, `Ownership Percentage (owner ${index + 1})`);
  console.log(`Filled: Owner ${index + 1} (${contact.firstName || ''} ${contact.lastName || ''})`.trim());
}

async function fillStepThree(frame, page, data, contacts) {
  const owners = (Array.isArray(contacts) ? contacts : [contacts]).filter(Boolean);
  if (!owners.length) return;

  for (let i = 0; i < owners.length; i++) {
    if (i > 0) {
      await frame.locator('button:has-text("Add Another Owner")').first().click();
      await frame.locator(`#home-own-${i}`).waitFor({ timeout: 20_000 });
      await page.waitForTimeout(800);
      console.log(`Clicked "Add Another Owner" — owner ${i + 1} form ready`);
    }
    await fillOwner(frame, page, owners[i], i);
  }

  if (owners.length > 1 && owners[0].percentageOwned) {
    if (await expandOwner(frame, page, 0)) {
      await setSlider(frame, page, 1, owners[0].percentageOwned, 'Ownership Percentage (owner 1, re-applied)');
    }
  }
}

function mapLoanPurposeValue(value) {
  if (!value) return null;
  return String(Array.isArray(value) ? value[0] : value).split(/;|,/)[0].trim() || null;
}

async function fillStepTwo(frame, page, data) {
  await fillField(frame, 'Street Address', data.streetAddress);
  await fillField(frame, 'City', data.city);
  await selectField(frame, page, 'State', data.state || data.billingState);
  await fillField(frame, 'ZIP', data.zipCode);
  console.log('Filled: Business Address');

  await selectField(frame, page, 'Business Industry', data.industry);
  await selectField(frame, page, 'What do you need the money for?', data.loanPurpose || mapLoanPurposeValue(data.useOfFunds));
  await selectField(frame, page, 'When do you need the money?', data.timeline);
  console.log('Filled: Industry & Purpose');

  await selectField(frame, page, 'Business Entity Type', data.entityType || data.businessType);
  await selectField(frame, page, 'State of Formation', data.stateOfFormation);
  await fillField(frame, 'Federal Tax ID (EIN)', digitsOnly(data.federalTaxId));
  await fillField(frame, 'Business Registration Date', isoDate(data.businessRegistrationDate));
  console.log('Filled: Entity & Registration');

  await selectYesNo(frame, 'loans', data.hasOpenLoans);
  await selectYesNo(frame, 'props', data.ownsInvestmentProperty);
  console.log('Filled: Additional Information');
}

async function fillStepOne(frame, page, data, contact) {
  await fillField(frame, 'Business Legal Name', data.businessName);
  await fillField(frame, 'Business DBA Name', data.dba);
  await selectField(frame, page, 'Business Operating Time', data.businessOperatingTime || mapOperatingTime(data.inBusinessSince));
  await selectField(frame, page, 'Gross Monthly Revenue', data.grossMonthlyRevenue || mapMonthlyRevenue(data.annualRevenue));
  await fillField(frame, 'Website', data.website);
  await selectField(frame, page, 'Loan Request', data.loanRequest || mapLoanRequest(data.loanAmount));
  console.log('Filled: Business Information');

  if (contact) {
    await fillField(frame, 'First Name', contact.firstName);
    await fillField(frame, 'Last Name', contact.lastName);
    await fillField(frame, 'Email Address', contact.email);
    await fillField(frame, 'Mobile Phone Number', contact.phone || contact.mobilePhone);
    console.log('Filled: Personal Information');
  }
}

module.exports = {
  fillStepOne,
  fillStepTwo,
  fillStepThree,
  fillOwner,
  selectYesNo,
  setSlider,
  fieldByLabel,
  mapOperatingTime,
  mapMonthlyRevenue,
  mapLoanRequest,
  TEST_DATA,
  TEST_CONTACT,
  TEST_CONTACT_2,
  OPERATING_TIME_OPTIONS,
  REVENUE_OPTIONS,
  LOAN_AMOUNT_OPTIONS,
  INDUSTRY_OPTIONS,
  ENTITY_TYPE_OPTIONS,
  LOAN_PURPOSE_OPTIONS,
  TIMELINE_OPTIONS,
};
