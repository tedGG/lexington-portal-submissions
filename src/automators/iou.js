const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { IOU_URL } = process.env;

// Diagnostic-only automator: opens the iou portal from the server (US West)
// and reports what loads, so the page can be inspected from a geo-blocked location.
async function inspect() {
  if (!IOU_URL) throw new Error('IOU_URL is not set');

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const consoleLogs = [];
  const failedRequests = [];

  try {
    const page = await context.newPage();

    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => consoleLogs.push(`[pageerror] ${err.message}`));
    page.on('requestfailed', req =>
      failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText || 'failed'}`));
    page.on('response', res => {
      if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    });

    console.log(`Navigating to iou portal: ${IOU_URL}`);
    const response = await page.goto(IOU_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const status = response ? response.status() : null;
    console.log(`Initial response status: ${status}. URL: ${page.url()}`);

    // give SPAs a moment to render
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
      console.log('networkidle not reached within 30s (continuing).');
    });

    const finalUrl = page.url();
    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) || '');
    const html = await page.content();

    console.log(`Final URL: ${finalUrl}`);
    console.log(`Title: ${title}`);

    return {
      success: true,
      status,
      finalUrl,
      title,
      bodyText,
      htmlSnippet: html.slice(0, 8000),
      consoleLogs,
      failedRequests,
    };
  } finally {
    await browser.close();
  }
}

module.exports = { inspect };
