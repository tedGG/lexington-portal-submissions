const TEST_DATA = {
  businessName: 'Testing Portal Submissions (Nazar)',
  dba: 'Testing Portal Submissions (Nazar) DBA',
  inBusinessSince: '2022-01-15',
  annualRevenue: '480000',
  website: 'www.acmecorp.com',
  loanAmount: '150000',
};

const TEST_CONTACT = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@acmecorp.com',
  phone: '5559876543',
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
  fieldByLabel,
  mapOperatingTime,
  mapMonthlyRevenue,
  mapLoanRequest,
  TEST_DATA,
  TEST_CONTACT,
  OPERATING_TIME_OPTIONS,
  REVENUE_OPTIONS,
  LOAN_AMOUNT_OPTIONS,
  INDUSTRY_OPTIONS,
  ENTITY_TYPE_OPTIONS,
  LOAN_PURPOSE_OPTIONS,
  TIMELINE_OPTIONS,
};
