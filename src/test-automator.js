const { chromium } = require('playwright');

const TEST_URL = 'https://demoqa.com/automation-practice-form';

async function submitTestForm(data) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(TEST_URL);

    await page.fill('#firstName', data.firstName);
    await page.fill('#lastName', data.lastName);
    await page.fill('#userEmail', data.email);
    await page.fill('#userNumber', data.phone);
    await page.fill('#currentAddress', data.address);

    // Gender radio — click the label (direct radio click is blocked by CSS)
    await page.locator('label[for="gender-radio-1"]').click();

    // Scroll submit into view and click (page has sticky ads that block it)
    await page.locator('#submit').scrollIntoViewIfNeeded();
    await page.locator('#submit').click();

    // Wait for success modal
    await page.waitForSelector('#example-modal-sizes-title-lg', { timeout: 10_000 });
    const modalTitle = await page.locator('#example-modal-sizes-title-lg').textContent();

    return { success: true, confirmation: modalTitle.trim() };
  } finally {
    await browser.close();
  }
}

module.exports = { submitTestForm };
