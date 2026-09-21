function findLabelFor({ text, nth }) {
  const normalize = s => s?.trim().replace(/\s*\*\s*$/, '').trim();
  const labels = [...document.querySelectorAll('label')].filter(
    l => normalize(l.innerText) === normalize(text) && l.offsetParent !== null
  );
  return labels[nth]?.getAttribute('for') || null;
}

async function inputIdByLabel(page, labelText, nth = 0) {
  return page.evaluate(findLabelFor, { text: labelText, nth });
}

async function inputByLabel(page, labelText, nth = 0) {
  const id = await inputIdByLabel(page, labelText, nth);
  if (!id) { console.log(`Label not found: "${labelText}" [${nth}]`); return null; }
  return page.locator(`#${id}`);
}

async function waitForLabel(page, labelText, nth = 0, timeout = 15_000) {
  await page.waitForFunction(findLabelFor, { text: labelText, nth }, { timeout });
}

async function pickVuetifyOption(page, text, timeout = 5_000) {
  const options = page.locator('.v-overlay__content .v-list-item', { hasNotText: /no data/i });
  try {
    await options.first().waitFor({ state: 'visible', timeout });
  } catch {
    console.log('No dropdown options found');
    return;
  }
  const texts = await options.allInnerTexts();
  console.log('Dropdown options:', texts);
  if (text) {
    const match = options.filter({ hasText: text }).first();
    if (await match.isVisible().catch(() => false)) { await match.click(); return; }
  }
  await options.first().click();
}

async function waitForValue(page, locator, timeout = 2_000) {
  const handle = await locator.elementHandle();
  if (!handle) return;
  await page.waitForFunction(el => !!el.value, handle, { timeout }).catch(() => {});
}

async function dismissCookieBanner(page) {
  const btn = page.getByRole('button', { name: /allow cookies/i });
  if (!(await btn.isVisible().catch(() => false))) return;
  await btn.click().catch(() => {});
  await btn.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  console.log('Cookie banner dismissed');
}

async function openDropdown(page, labelText, nth = 0) {
  const input = await inputByLabel(page, labelText, nth);
  if (!input) { console.log(`Dropdown not found: ${labelText} [${nth}]`); return; }
  await input.locator('xpath=ancestor::div[contains(@class,"v-field")][1]').click();
}

module.exports = { inputByLabel, inputIdByLabel, waitForLabel, waitForValue, pickVuetifyOption, openDropdown, dismissCookieBanner };
