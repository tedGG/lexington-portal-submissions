const { chromium } = require('playwright');
const { loadSession, saveSession, clearSession } = require('./sessionManager');

const { PORTAL_URL, PORTAL_USERNAME, PORTAL_PASSWORD } = process.env;

async function login(page) {
  await page.goto(`${PORTAL_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[placeholder="Email Address"]', PORTAL_USERNAME);
  await page.fill('input[placeholder="Account Password"]', PORTAL_PASSWORD);
  await page.getByText('LOG IN').click();
  await page.waitForURL(`${PORTAL_URL}/`, { timeout: 20_000 });
}

async function isLoggedIn(page) {
  return !page.url().includes('/login');
}

async function fillLoanForm(page, loanData) {
  await page.goto(`${PORTAL_URL}/new-submission`);

  await page.fill('#applicant-name', loanData.applicantName);
  await page.fill('#email', loanData.email);
  await page.fill('#loan-amount', String(loanData.loanAmount));
  await page.fill('#loan-term', String(loanData.loanTerm));

  if (loanData.phone)   await page.fill('#phone', loanData.phone);
  if (loanData.address) await page.fill('#address', loanData.address);
  if (loanData.ssn)     await page.fill('#ssn', loanData.ssn);
  if (loanData.income)  await page.fill('#annual-income', String(loanData.income));

  await page.click('#submit-button');
  await page.waitForURL(`${PORTAL_URL}/submission-success**`, { timeout: 30_000 });
}

async function extractConfirmationId(page) {
  return page.locator('#confirmation-id').textContent();
}

async function submitLoan(loanData) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    const sessionLoaded = await loadSession(context);
    const page = await context.newPage();

    if (sessionLoaded) {
      await page.goto(`${PORTAL_URL}/`);
      if (!(await isLoggedIn(page))) {
        clearSession();
        await login(page);
      }
    } else {
      await login(page);
    }

    await saveSession(context);

    return { success: true, message: 'Login successful' };
  } finally {
    await browser.close();
  }
}

module.exports = { submitLoan };
