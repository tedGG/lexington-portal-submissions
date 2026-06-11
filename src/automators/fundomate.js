const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { fillBusinessInformation, fillOwners, fillFinancialInformation, TEST_DATA } = require('./fundomate-forms');
const { uploadFiles } = require('./fundomate-upload');
const { uploadScreenshot } = require('../helpers/salesforce');
const { FUNDOMATE_URL, FUNDOMATE_USERNAME, FUNDOMATE_PASSWORD } = process.env;

async function login(page, context) {
  await context.clearCookies();
  console.log('Navigating to login...');
  await page.goto(`${FUNDOMATE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  console.log(`Login page loaded. URL: ${page.url()}`);

  await page.waitForSelector('#username', { timeout: 30_000 });
  console.log('Login form ready.');

  await page.click('#username');
  await page.type('#username', FUNDOMATE_USERNAME, { delay: 80 });
  await page.click('#password');
  await page.type('#password', FUNDOMATE_PASSWORD, { delay: 80 });

  // wait for button to be enabled by React after input
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 10_000 });
  console.log('Submit button enabled.');

  await page.click('button[type="submit"]');
  console.log('Credentials submitted.');


  await page.waitForFunction(
    () => window.location.hostname.includes('partner.fundomate.com'),
    { timeout: 60_000 }
  );
  console.log(`Logged in. URL: ${page.url()}`);
}

async function submitLoan(businessData_, contact1Data, contact2Data, files) {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    slowMo: 800,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  try {
    const page = await context.newPage();
    await login(page, context);

    await page.goto(`${FUNDOMATE_URL}/merchants/create`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    console.log(`Navigated to create merchant page. URL: ${page.url()}`);

    let businessData, owners, financial;

    if (businessData_?.demo) {
      businessData = TEST_DATA.business;
      owners = TEST_DATA.owners;
      financial = TEST_DATA.financial;
    } else {
      const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const [inceptionYear, inceptionMonthNum] = (businessData_.inBusinessSince || '').split('-');
      console.log(businessData_);
      
      businessData = {
        companyName: businessData_.businessName,
        dba: businessData_.dba,
        industryCategory: businessData_.industryCategory || null,
        taxId: businessData_.federalTaxId,
        legalStructure: businessData_.businessType || null,
        inceptionMonth: MONTHS[parseInt(inceptionMonthNum) - 1] || null,
        inceptionYear: inceptionYear || null,
        companyPhone: businessData_.phone,
        companyEmail: businessData_.email,
        websitePresent: !!businessData_.website,
        address: businessData_.streetAddress,
        city: businessData_.city,
        state: businessData_.billingState || null,
        zip: businessData_.zipCode,
      };

      owners = [contact1Data, contact2Data].filter(Boolean).map(c => ({
        ownership: c.percentageOwned,
        firstName: c.firstName,
        lastName: c.lastName,
        dateOfBirth: c.dateOfBirth,
        ssn: c.ssn,
        address: c.streetAddress,
        city: c.city,
        state: c.state || null,
        zip: c.zipCode,
        phone: c.phone || null,
        email: c.email,
      }));

      financial = {
        monthlyRevenue: businessData_.grossAnnualSales || null,
        hasRequestedAmount: false,
      };
    }

    await fillBusinessInformation(page, businessData);
    await fillOwners(page, owners);
    await fillFinancialInformation(page, financial);
    await uploadFiles(page, files, businessData_?.demo === true);

    const screenshot = await page.screenshot({ fullPage: true });
    console.log('Screenshot taken.');

    if (businessData_?.salesforceRecordId) {
      const title = `Fundomate Submission - ${businessData_.businessName || 'Demo'}`;
      const result = await uploadScreenshot(screenshot.toString('base64'), title, businessData_.salesforceRecordId);
      console.log(`Screenshot uploaded to Salesforce: ${JSON.stringify(result)}`);
    }

    return { success: true, message: 'Application form filled' };
  } finally {
    await browser.close();
  }
}

module.exports = { submitLoan };
