// Runs in the browser: find visible <label> elements whose text (minus the
// trailing required-asterisk) matches `text`, and return the nth one's `for`.
function findLabelFor({ text, nth }) {
  const normalize = s => s?.trim().replace(/\s*\*\s*$/, '').trim();
  const labels = [...document.querySelectorAll('label')].filter(
    l => normalize(l.innerText) === normalize(text) && l.offsetParent !== null
  );
  return labels[nth]?.getAttribute('for') || null;
}

// Id of the input for the nth visible label, or null (no logging).
async function inputIdByLabel(page, labelText, nth = 0) {
  return page.evaluate(findLabelFor, { text: labelText, nth });
}

async function inputByLabel(page, labelText, nth = 0) {
  const id = await inputIdByLabel(page, labelText, nth);
  if (!id) { console.log(`Label not found: "${labelText}" [${nth}]`); return null; }
  return page.locator(`#${id}`);
}

// Wait until the nth visible label with this text exists — used instead of a
// fixed sleep after navigating to a tab / adding a contact row.
async function waitForLabel(page, labelText, nth = 0, timeout = 15_000) {
  await page.waitForFunction(findLabelFor, { text: labelText, nth }, { timeout });
}

// Waits for real options to render (autocompletes show a "No data available"
// placeholder item while suggestions load — skip it) and clicks the match, or
// the first option when `text` is null.
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

// Resolve once the input has a value (or give up after `timeout`). Used after
// picking an address suggestion, which asynchronously autofills City/Zip/State —
// without this our explicit values could be overwritten by the late autofill.
async function waitForValue(page, locator, timeout = 2_000) {
  const handle = await locator.elementHandle();
  if (!handle) return;
  await page.waitForFunction(el => !!el.value, handle, { timeout }).catch(() => {});
}

async function openDropdown(page, labelText, nth = 0) {
  const input = await inputByLabel(page, labelText, nth);
  if (!input) { console.log(`Dropdown not found: ${labelText} [${nth}]`); return; }
  await input.locator('xpath=ancestor::div[contains(@class,"v-field")][1]').click();
}

module.exports = { inputByLabel, inputIdByLabel, waitForLabel, waitForValue, pickVuetifyOption, openDropdown };
