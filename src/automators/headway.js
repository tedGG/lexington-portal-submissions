const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const { loadSession, saveSession, clearSession } = require('../sessionManager');

const SESSION_KEY = 'headway';
const { HEADWAY_URL, HEADWAY_USERNAME, HEADWAY_PASSWORD } = process.env;

async function login(page) {
  await page.goto(`${HEADWAY_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[placeholder="Email Address"]', HEADWAY_USERNAME);
  await page.fill('input[placeholder="Account Password"]', HEADWAY_PASSWORD);
  await page.getByText('LOG IN').click();
  await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 20_000 });
}

async function isLoggedIn(page) {
  return !page.url().includes('/login');
}

async function submitLoan(loanData) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  try {
    const sessionLoaded = await loadSession(context, SESSION_KEY);
    const page = await context.newPage();

    if (sessionLoaded) {
      await page.goto(`${HEADWAY_URL}/`);
      if (!(await isLoggedIn(page))) {
        clearSession(SESSION_KEY);
        await login(page);
      }
    } else {
      await login(page);
    }

    await saveSession(context, SESSION_KEY);

    return { success: true, message: 'Login successful' };
  } finally {
    await browser.close();
  }
}

module.exports = { submitLoan };
