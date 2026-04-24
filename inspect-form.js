const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://partners-fe.headwaycapital.com/login');
  await page.waitForLoadState('networkidle');

  const fields = await page.evaluate(() =>
    [...document.querySelectorAll('input, button, select, textarea')].map(el => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      name: el.name || null,
      type: el.type || null,
      placeholder: el.placeholder || null,
      class: el.className || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      text: el.innerText?.trim() || null,
    }))
  );

  console.log(JSON.stringify(fields, null, 2));
  await page.screenshot({ path: 'login-screenshot.png', fullPage: true });
  console.log('Screenshot saved to login-screenshot.png');
  await browser.close();
})();
