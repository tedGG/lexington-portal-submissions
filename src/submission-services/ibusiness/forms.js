const { fillInput, selectCombobox, setToggle, selectDualListbox, searchLookup } = require('../../helpers/lightning');

const TEST_DATA = {
  loanType: 'SBA',
  businessName: 'Lexington Portal Test (not process)',
  dba: 'Lexington Portal Test (not process)',
  federalTaxId: '12-3456789',
  naicsCode: '722511',
  useOfFunds: 'Working Capital',
  businessType: 'Limited Liability Company',
  stateOfIncorporation: 'CA',
  officeSpace: 'Rent',
  businessLocationType: 'Commercial',
  phone: '5551234567',
  email: 'test@acmecorp.com',
  grossAnnualSales: '500000',
  loanAmount: '150000',
  loanDescription: 'Test application — do not process.',
  inBusinessSince: '2020-01-15',
  website: 'https://acmecorp.com',
  streetAddress: '123 Main Street',
  streetAddressLine2: 'Suite 100',
  city: 'Los Angeles',
  zipCode: '90001',
  billingState: 'CA',
};

const TEST_CONTACT = {
  firstName: 'John',
  lastName: 'Doe',
  phone: '5559876543',
  email: 'john.doe@acmecorp.com',
  ssn: '122-33-1313',
  streetAddress: '456 Oak Avenue',
  city: 'Los Angeles',
  zipCode: '90001',
  state: 'CA',
  guarantee: 'Full Unsecured',
};

const USE_OF_FUNDS_OPTIONS = [
  'Acquiring a Business',
  'Business Equipment',
  'Business Expansion',
  'Buy Out a Partner',
  'Construction',
  'Debt Refinance',
  'Inventory',
  'Leasehold / Capital Improvements',
  'Other',
  'Purchase a New/Used Business Automobile',
  'Purchase or Refinance Commercial Real Estate',
  'Start a Business',
  'Working Capital',
];

const USE_OF_FUNDS_KEYWORDS = [
  [/acqui/i, 'Acquiring a Business'],
  [/equipment|machinery/i, 'Business Equipment'],
  [/expan/i, 'Business Expansion'],
  [/partner/i, 'Buy Out a Partner'],
  [/construct/i, 'Construction'],
  [/refinanc|debt|consolidat/i, 'Debt Refinance'],
  [/inventory/i, 'Inventory'],
  [/leasehold|improvement|renovat/i, 'Leasehold / Capital Improvements'],
  [/vehicle|automobile|truck|car\b/i, 'Purchase a New/Used Business Automobile'],
  [/real estate|property|commercial/i, 'Purchase or Refinance Commercial Real Estate'],
  [/start/i, 'Start a Business'],
  [/working capital|payroll|cash flow|operating/i, 'Working Capital'],
];

function mapUseOfFunds(value) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : String(value).split(/;|,/);
  const mapped = values.map(v => v.trim()).filter(Boolean).map(v => {
    const exact = USE_OF_FUNDS_OPTIONS.find(o => o.toLowerCase() === v.toLowerCase());
    if (exact) return exact;
    const keyword = USE_OF_FUNDS_KEYWORDS.find(([re]) => re.test(v));
    return keyword ? keyword[1] : 'Other';
  });
  return [...new Set(mapped)];
}

function mapLoanType(value) {
  if (!value) return 'SBA';
  return /sba/i.test(String(value)) ? 'SBA' : 'Conventional';
}

function formatDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    console.log(`Business Start Date: unexpected format "${value}" — leaving it empty`);
    return null;
  }
  const [, year, month, day] = match;
  return `${month}/${day}/${year}`;
}

function joinStreet(street, line2) {
  return [street, line2].filter(Boolean).join(', ') || null;
}

function digits(value) {
  return value ? String(value).replace(/[^\d.]/g, '') : null;
}

function formatPhone(value) {
  if (!value) return null;
  let digits = String(value).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) {
    console.log(`Phone "${value}" is not 10 digits (got ${digits.length}) — portal will reject it`);
    return digits || null;
  }
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
    console.log(`Phone "${value}" is not a valid US number (area code and exchange must start with 2-9) — portal will reject it`);
  }
  return digits;
}

function digitsOnly(value) {
  return value ? String(value).replace(/\D/g, '') : null;
}

async function fillApplicationForm(page, data, contact) {
  await selectCombobox(page, 'Referral Contact', data.referralContact);
  await selectCombobox(page, 'Loan Type', mapLoanType(data.loanType));
  console.log('Filled: Loan Type');

  if (contact) {
    await fillInput(page, 'FirstName', contact.firstName);
    await fillInput(page, 'LastName', contact.lastName);
    await fillInput(page, 'Email', contact.email);
    await fillInput(page, 'Phone', formatPhone(contact.phone || contact.mobilePhone));
    await fillInput(page, 'Primary Contact Street', joinStreet(contact.streetAddress, contact.streetAddressLine2));
    await fillInput(page, 'Primary Contact City', contact.city);
    await selectCombobox(page, 'Primary Contact State', contact.state);
    await fillInput(page, 'Primary Contact Zipcode', contact.zipCode);
    await fillInput(page, 'Primary Contact SSN', digitsOnly(contact.ssn));
    await selectCombobox(page, 'Guaranty', contact.guarantee);
    console.log('Filled: Primary Contact Information');
  }

  await fillInput(page, 'Legal/Corporate Name', data.businessName);
  await fillInput(page, 'Company Name (DBA)', data.dba || data.businessName);
  if (data.naicsCode) {
    await searchLookup(page, 'Search here...', data.naicsCode, name => name === `NAICS-${data.naicsCode}`);
  }
  await selectCombobox(page, 'Office Space', data.officeSpace);
  await selectCombobox(page, 'Business Type', data.businessType);
  await selectCombobox(page, 'Business Location Type', data.businessLocationType);
  await selectCombobox(page, 'State of Incorporation', data.stateOfIncorporation);
  await fillInput(page, 'Business Start Date', formatDate(data.inBusinessSince));
  await fillInput(page, 'Federal Tax Id', digitsOnly(data.federalTaxId));
  await fillInput(page, 'Website', data.website);
  console.log('Filled: Business Information');

  await fillInput(page, 'Street', joinStreet(data.streetAddress, data.streetAddressLine2));
  await fillInput(page, 'City', data.city);
  await selectCombobox(page, 'State', data.billingState);
  await fillInput(page, 'Zipcode', data.zipCode);
  await setToggle(page, 'Same as Physical Address?', true);
  console.log('Filled: Address Information');

  await fillInput(page, 'Gross Annual Sales', digits(data.grossAnnualSales));
  await fillInput(page, 'Use of Funds Description', data.loanDescription);
  await fillInput(page, 'Borrower Requested Amount', digits(data.loanAmount));
  await selectDualListbox(page, mapUseOfFunds(data.useOfFunds));
  console.log('Filled: Financial Information');
}

module.exports = { fillApplicationForm, TEST_DATA, TEST_CONTACT, mapUseOfFunds, mapLoanType, formatPhone };
