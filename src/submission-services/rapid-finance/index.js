const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { RAPID_FINANCE_URL, RAPID_FINANCE_USERNAME, RAPID_FINANCE_PASSWORD } = process.env;

const LOGIN_FORM = 'form[action*="/Account/Login"]';
const USERNAME_INPUT = '#UserNameOrEmail';
const PASSWORD_INPUT = '#Password';
const SIGN_IN_BUTTON = `${LOGIN_FORM} input[type="submit"]`;
const LOGIN_ERROR = '.validation-summary-errors, .field-validation-error, .alert-danger, .error-message';

function assertConfigured() {
  if (!RAPID_FINANCE_URL) throw new Error('RAPID_FINANCE_URL is not set');
  if (!RAPID_FINANCE_USERNAME || !RAPID_FINANCE_PASSWORD) throw new Error('RAPID_FINANCE_USERNAME / RAPID_FINANCE_PASSWORD are not set');
}

function startUrl() {
  return /^https?:\/\//i.test(RAPID_FINANCE_URL) ? RAPID_FINANCE_URL : `https://${RAPID_FINANCE_URL}`;
}

function isLoginUrl(url) {
  return /\/Account\/Login/i.test(url);
}

async function launch() {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  return { browser, context };
}

async function readLoginError(page) {
  const texts = await page.locator(LOGIN_ERROR).allInnerTexts().catch(() => []);
  return texts.map(text => text.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ');
}

async function login(page) {
  try {
    await page.goto(startUrl(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
  } catch (err) {
    throw new Error(`Rapid Finance portal did not load (${err.message.split('\n')[0]})`);
  }

  await page.locator(USERNAME_INPUT).waitFor({ timeout: 45_000 });
  console.log(`Rapid Finance login page loaded. URL: ${page.url()}`);

  await page.fill(USERNAME_INPUT, RAPID_FINANCE_USERNAME);
  await page.fill(PASSWORD_INPUT, RAPID_FINANCE_PASSWORD);
  await Promise.all([
    page.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch(() => {}),
    page.click(SIGN_IN_BUTTON),
  ]);

  await page.waitForFunction(
    ({ errorSelector }) => {
      if (!/\/Account\/Login/i.test(window.location.href)) return true;
      return [...document.querySelectorAll(errorSelector)].some(el => (el.innerText || '').trim());
    },
    { errorSelector: LOGIN_ERROR },
    { timeout: 45_000 }
  ).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

  if (isLoginUrl(page.url())) {
    const error = await readLoginError(page);
    throw new Error(`Rapid Finance login failed${error ? `: ${error}` : ' (still on the login page)'} (on ${page.url()})`);
  }

  console.log(`Rapid Finance: logged in. URL: ${page.url()}`);
  return { url: page.url(), title: await page.title() };
}

async function screenshot() {
  assertConfigured();
  const { browser, context } = await launch();

  try {
    const page = await context.newPage();
    let outcome;
    try {
      const landed = await login(page);
      outcome = `logged-in: ${landed.title || 'no title'} — ${landed.url}`;
    } catch (err) {
      outcome = `failed: ${err.message.split('\n')[0]}`;
      console.log(`Rapid Finance screenshot — capturing the page as-is after: ${err.message}`);
    }
    const png = await page.screenshot({ fullPage: true });
    return { png, outcome };
  } finally {
    await browser.close();
  }
}

module.exports = { screenshot };
