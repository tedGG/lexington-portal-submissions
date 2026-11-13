const SUBMIT_AS = 'Appio Fragoletti';
const ACTION_TIMEOUT = 10_000;

const TEST_DATA = {
  businessName: 'Lexington Portal Test (not process)',
  dba: 'Lexington Portal Test (not process)',
  inBusinessSince: '2020-01-15',
  federalTaxId: '12-3456789',
  businessType: 'LLC',
  industry: 'Restaurant & Food Services',
  phone: '5551234567',
  streetAddress: '123 Main Street',
  streetAddressLine2: 'Suite 100',
  zipCode: '90001',
  city: 'Los Angeles',
  billingState: 'CA',
  grossAnnualSales: '500000',
  averageBankBalance: '25000',
  separateBusinessBankAccount: true,
  acceptsCreditCards: true,
  hasMerchantCashAdvance: false,
  hasAdditionalManagingPartners: false,
  loanAmount: '150000',
  useOfFunds: 'Working Capital',
  loanDescription: 'Test application — do not process.',
};

const TEST_CONTACT = {
  firstName: 'John',
  lastName: 'Doe',
  ssn: '122-33-1313',
  dateOfBirth: '1985-04-12',
  email: 'john.doe@acmecorp.com',
  phone: '5559876543',
  mobilePhone: '5559876544',
  streetAddress: '456 Oak Avenue',
  zipCode: '90001',
  city: 'Los Angeles',
  state: 'CA',
  percentageOwned: 60,
};

const TEST_CONTACT_2 = {
  firstName: 'Jane',
  lastName: 'Smith',
  ssn: '987-65-4321',
  dateOfBirth: '1988-09-22',
  email: 'jane.smith@acmecorp.com',
  phone: '5554321987',
  mobilePhone: '5554321988',
  streetAddress: '789 Pine Street',
  zipCode: '94102',
  city: 'San Francisco',
  state: 'CA',
  percentageOwned: 40,
};

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AS: 'American Samoa', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  GU: 'Guam', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  VI: 'Virgin Islands', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const COMPANY_TYPES = [
  [/sole|proprietor/i, 'Sole Proprietor'],
  [/\bllp\b|limited liability partnership/i, 'Limited Liability Partnership (LLP)'],
  [/\bllc\b|l\.l\.c|limited liability/i, 'Limited Liability Company (LLC)'],
  [/\blp\b|limited partnership/i, 'Limited Partnership (LP)'],
  [/partnership/i, 'General Partnership'],
  [/corp|\binc\b|incorporated/i, 'Corporation'],
];

const LOAN_PURPOSES = [
  'Business Expansion',
  'Capital / Facilities Improvements',
  'Equipment Purchase',
  'Inventory, Merchandise, or Specified Goods',
  'New Location',
  'Sales Transaction Financing',
  'Services (e.g. training)',
  'Debt Refinancing',
  'Insurance',
  'Payables',
  'Working Capital',
  'Other',
];

const LOAN_PURPOSE_KEYWORDS = [
  [/expan/i, 'Business Expansion'],
  [/improve|renovat|facilit|leasehold|construct/i, 'Capital / Facilities Improvements'],
  [/equip|machin|vehicle|truck/i, 'Equipment Purchase'],
  [/inventory|merchandise|goods/i, 'Inventory, Merchandise, or Specified Goods'],
  [/location/i, 'New Location'],
  [/refinanc|debt|consolidat/i, 'Debt Refinancing'],
  [/insur/i, 'Insurance'],
  [/payable/i, 'Payables'],
  [/working capital|payroll|cash flow|operating/i, 'Working Capital'],
];

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function digitsOf(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function wholeDollars(value) {
  if (isBlank(value)) return null;
  const amount = Number(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(amount) ? String(Math.round(amount)) : null;
}

function formatPhone(value) {
  let digits = digitsOf(value);
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits || null;
}

function formatZip(value) {
  return digitsOf(value).slice(0, 5) || null;
}

function formatDate(value) {
  if (isBlank(value)) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}-${match[3]}-${match[1]}` : String(value);
}

function joinStreet(street, line2) {
  return [street, line2].filter(part => !isBlank(part)).join(', ') || null;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (/^(true|yes|y)$/i.test(String(value ?? '').trim())) return true;
  if (/^(false|no|n)$/i.test(String(value ?? '').trim())) return false;
  return null;
}

function mapState(value) {
  if (isBlank(value)) return null;
  const text = String(value).trim();
  const byCode = STATES[text.toUpperCase()];
  if (byCode) return byCode;
  return Object.values(STATES).find(name => name.toLowerCase() === text.toLowerCase()) || text;
}

function mapCompanyType(value) {
  if (isBlank(value)) return null;
  const hit = COMPANY_TYPES.find(([pattern]) => pattern.test(String(value)));
  return hit ? hit[1] : String(value);
}

function mapLoanPurpose(value) {
  if (isBlank(value)) return null;
  const first = (Array.isArray(value) ? value : String(value).split(/;|,/)).map(v => String(v).trim()).find(Boolean);
  if (!first) return null;
  const exact = LOAN_PURPOSES.find(option => option.toLowerCase() === first.toLowerCase());
  if (exact) return exact;
  const keyword = LOAN_PURPOSE_KEYWORDS.find(([pattern]) => pattern.test(first));
  return keyword ? keyword[1] : 'Other';
}

function byId(page, id) {
  return page.locator(`[id="${id}"]`);
}

function createReport() {
  return { filled: [], skipped: [], problems: [] };
}

async function attempt(report, label, value, work) {
  if (isBlank(value)) {
    report.skipped.push(label);
    return;
  }
  try {
    const problem = await work();
    if (problem) {
      report.problems.push(`${label}: ${problem}`);
      console.log(`OnDeck field problem — ${label}: ${problem}`);
    } else {
      report.filled.push(label);
    }
  } catch (err) {
    const reason = err.message.split('\n')[0];
    report.problems.push(`${label}: ${reason}`);
    console.log(`OnDeck field problem — ${label}: ${reason}`);
  }
}

async function invalidReason(locator) {
  const invalid = await locator.evaluate(el => el.classList.contains('ng-invalid'));
  return invalid ? 'the portal marks the value as invalid' : null;
}

async function fillText(page, report, id, label, value) {
  await attempt(report, label, value, async () => {
    const input = byId(page, id);
    const expected = String(value).trim();
    await input.fill(expected, { timeout: ACTION_TIMEOUT });
    await input.blur();
    const actual = await input.inputValue();
    if (actual.trim() !== expected) return `the field shows "${actual}" instead of the value sent`;
    return invalidReason(input);
  });
}

async function fillDigits(page, report, id, label, value) {
  await attempt(report, label, value, async () => {
    const input = byId(page, id);
    const expected = digitsOf(value);
    await input.click({ timeout: ACTION_TIMEOUT });
    await input.pressSequentially(expected, { delay: 40 });
    if (digitsOf(await input.inputValue()) !== expected) {
      await input.fill('');
      await input.fill(expected);
    }
    await input.blur();
    const shown = digitsOf(await input.inputValue());
    if (shown !== expected) return `the field kept ${shown.length} of ${expected.length} digits`;
    return invalidReason(input);
  });
}

async function chooseOption(page, report, id, label, optionLabel) {
  await attempt(report, label, optionLabel, async () => {
    const select = byId(page, id);
    await select.selectOption({ label: optionLabel }, { timeout: ACTION_TIMEOUT });
    const selected = await select.evaluate(el => el.options[el.selectedIndex]?.text.trim() || '');
    if (selected !== optionLabel) return `"${selected}" is selected instead of "${optionLabel}"`;
    return invalidReason(select);
  });
}

async function chooseYesNo(page, report, name, label, value) {
  const answer = toBoolean(value);
  const buttons = page.locator(`a[name="${name}"]`);
  const shown = await buttons.first().isVisible().catch(() => false);
  if (!shown) return;

  await attempt(report, label, answer === null ? null : String(answer), async () => {
    const button = buttons.filter({ hasText: answer ? /^\s*Yes\s*$/ : /^\s*No\s*$/ }).first();
    await button.click({ timeout: ACTION_TIMEOUT });
    const active = await button.evaluate(el => el.classList.contains('active'));
    return active ? null : `"${answer ? 'Yes' : 'No'}" did not stay selected`;
  });
}

async function fillBusiness(page, report, data) {
  await fillText(page, report, 'business.name', 'Exact Legal Company Name', data.businessName);
  await fillText(page, report, 'business.doingBusinessAs', 'Doing Business As (DBA)', data.dba || data.businessName);
  await fillText(page, report, 'business.businessInceptionDate', 'Business Inception Date', formatDate(data.inBusinessSince));
  await fillDigits(page, report, 'taxID', 'Tax ID', data.federalTaxId);
  await chooseOption(page, report, 'legalEntity', 'Company Type', mapCompanyType(data.businessType));
  await fillText(page, report, 'business.natureOfBusiness', 'Nature of Business', data.industry || data.natureOfBusiness);
  await fillDigits(page, report, 'business.phone', 'Business Phone', formatPhone(data.phone));
  await fillText(page, report, 'business.address.addressLine1', 'Business Address', joinStreet(data.streetAddress, data.streetAddressLine2));
  await fillDigits(page, report, 'address.zipCode', 'Business Zip Code', formatZip(data.zipCode));
  await page.waitForTimeout(800);
  await fillText(page, report, 'business.address.city', 'Business City', data.city);
  await chooseOption(page, report, 'address.state', 'Business State', mapState(data.billingState || data.state));
  console.log('Filled: Business Information');
}

async function fillFinancial(page, report, data) {
  await fillDigits(page, report, 'selfReported.revenue', 'Annual Business Revenue', wholeDollars(data.grossAnnualSales ?? data.annualRevenue));
  await fillDigits(page, report, 'selfReported.averageBalance', 'Average Bank Balance', wholeDollars(data.averageBankBalance));
  await chooseYesNo(page, report, 'selfReported.separateBusinessBankAccount', 'Separate business bank account?', data.separateBusinessBankAccount);
  await chooseYesNo(page, report, 'selfReported.creditCardMoreThan3months', 'Accepted credit cards for 3+ months?', data.acceptsCreditCards);
  await chooseYesNo(page, report, 'showBalance', 'Has a merchant cash advance?', data.hasMerchantCashAdvance);
  if (toBoolean(data.hasMerchantCashAdvance)) {
    await fillDigits(page, report, 'selfReported.mcaBalance', 'Cash Advance Balance', wholeDollars(data.cashAdvanceBalance));
  }
  console.log('Filled: Financial Information');
}

async function addSecondOwner(page, report) {
  try {
    await page.locator('a[ng-click="addOwner()"]').first().click({ timeout: ACTION_TIMEOUT });
    await byId(page, 'owner1.firstName').waitFor({ timeout: ACTION_TIMEOUT });
    console.log('Added Owner 2');
    return true;
  } catch (err) {
    const reason = err.message.split('\n')[0];
    report.problems.push(`Owner 2: could not add the second owner (${reason})`);
    console.log(`OnDeck field problem — Owner 2 could not be added: ${reason}`);
    return false;
  }
}

async function fillOwner(page, report, index, contact) {
  const owner = `owner${index}`;
  const address = `address${index}`;
  const tag = `Owner ${index + 1}`;
  const homePhone = formatPhone(contact.phone || contact.mobilePhone || contact.phoneMobile);
  const cellPhone = formatPhone(contact.mobilePhone || contact.phoneMobile || contact.phone);

  await fillText(page, report, `${owner}.firstName`, `${tag} First Name`, contact.firstName);
  await fillText(page, report, `${owner}.lastName`, `${tag} Last Name`, contact.lastName);
  await fillDigits(page, report, `${owner}.ssn`, `${tag} SSN`, contact.ssn);
  await fillText(page, report, `${owner}.dateOfBirth`, `${tag} Date of Birth`, formatDate(contact.dateOfBirth));
  await fillText(page, report, `${owner}.email`, `${tag} Email`, contact.email);
  await fillDigits(page, report, `${owner}.homePhone`, `${tag} Home Phone`, homePhone);
  await fillDigits(page, report, `${owner}.cellPhoneNumber`, `${tag} Cell Phone`, cellPhone);
  await fillText(page, report, `${owner}.homeAddress.addressLine1`, `${tag} Home Address`, joinStreet(contact.streetAddress, contact.streetAddressLine2));
  await fillDigits(page, report, `${address}.zipCode`, `${tag} Zip Code`, formatZip(contact.zipCode));
  await page.waitForTimeout(800);
  await fillText(page, report, `${owner}.homeAddress.city`, `${tag} City`, contact.city);
  await chooseOption(page, report, `${address}.state`, `${tag} State`, mapState(contact.state));
  await fillText(page, report, `${owner}.ownershipPercentage`, `${tag} Ownership %`, isBlank(contact.percentageOwned) ? null : digitsOf(Math.round(Number(contact.percentageOwned))));
  console.log(`Filled: ${tag}`);
}

async function fillOwners(page, report, data, owners) {
  if (owners[0]) await fillOwner(page, report, 0, owners[0]);
  if (owners[1] && await addSecondOwner(page, report)) await fillOwner(page, report, 1, owners[1]);

  await chooseYesNo(page, report, 'selfReported.hasAdditionalManagingPartners', 'Another individual with significant responsibility?', data.hasAdditionalManagingPartners);
  await chooseYesNo(page, report, 'selfReported.hasAdditionalOwnersMoreThan25', 'Additional owners with 25% or more?', data.hasAdditionalOwnersMoreThan25);
}

async function fillLoan(page, report, data) {
  await fillDigits(page, report, 'selfReported.desiredLoanAmount', 'Desired Loan Amount', wholeDollars(data.loanAmount));
  await chooseOption(page, report, 'business.loanPurpose', 'Purpose of Loan', mapLoanPurpose(data.useOfFunds || data.loanPurpose));
  await fillText(page, report, 'additionalInfo.partnerDealNotes', 'Partner Deal Notes', data.loanDescription || data.partnerDealNotes);
  console.log('Filled: Loan Requested');
}

async function selectSubmitAs(page, report) {
  const label = `Continue as "${SUBMIT_AS}"`;
  await attempt(report, label, SUBMIT_AS, async () => {
    const select = page.locator('od-managed-users-select select').first();
    const offered = await select.locator('option', { hasText: SUBMIT_AS }).first()
      .waitFor({ state: 'attached', timeout: 20_000 })
      .then(() => true, () => false);
    if (!offered) {
      const options = await select.locator('option').allInnerTexts().catch(() => []);
      return `the user list never offered that name (options: ${options.map(o => o.trim()).filter(Boolean).join(', ') || 'none'})`;
    }
    await select.selectOption({ label: SUBMIT_AS }, { timeout: ACTION_TIMEOUT });
    const selected = await select.evaluate(el => el.options[el.selectedIndex]?.text.trim() || '');
    return selected === SUBMIT_AS ? null : `"${selected}" is selected instead`;
  });
}

async function auditForm(page) {
  return page.evaluate(() => {
    const form = document.querySelector('form[name="newApplication"]');
    if (!form) return { formValid: false, invalidFields: ['form not found'], portalMessages: [] };
    const visible = el => el.offsetParent !== null;
    const clean = text => (text || '').replace(/\s+/g, ' ').trim();
    const invalidFields = [...form.querySelectorAll('input.ng-invalid, select.ng-invalid, textarea.ng-invalid, a.ng-invalid')]
      .filter(visible)
      .map(el => el.getAttribute('name') || el.id || el.tagName.toLowerCase());
    const portalMessages = [...form.querySelectorAll('.help-block')]
      .filter(visible)
      .map(el => clean(el.innerText))
      .filter(Boolean);
    return {
      formValid: !form.classList.contains('ng-invalid'),
      invalidFields: [...new Set(invalidFields)],
      portalMessages: [...new Set(portalMessages)],
    };
  });
}

async function fillApplicationForm(page, data, owners) {
  const report = createReport();

  await fillBusiness(page, report, data);
  await fillFinancial(page, report, data);
  await fillOwners(page, report, data, owners);
  await fillLoan(page, report, data);
  await selectSubmitAs(page, report);

  const audit = await auditForm(page);
  console.log(`OnDeck form populated — ${report.filled.length} filled, ${report.skipped.length} skipped (no value), ${report.problems.length} problem(s). Continue was NOT clicked.`);
  if (report.skipped.length) console.log(`Skipped (no value in payload): ${report.skipped.join(', ')}`);
  if (audit.invalidFields.length) console.log(`Portal still marks as invalid: ${audit.invalidFields.join(', ')}`);

  return { ...report, ...audit };
}

module.exports = { fillApplicationForm, TEST_DATA, TEST_CONTACT, TEST_CONTACT_2, SUBMIT_AS };
