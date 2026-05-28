async function inputByLabel(page, labelText, nth = 0) {
  const id = await page.evaluate(({ text, nth }) => {
    const normalize = s => s?.trim().replace(/\s*\*\s*$/, '').trim();
    const isVisible = el => el.offsetParent !== null;
    const labels = [...document.querySelectorAll('label')].filter(
      l => normalize(l.innerText) === normalize(text) && isVisible(l)
    );
    return labels[nth]?.getAttribute('for') || null;
  }, { text: labelText, nth });
  if (!id) { console.log(`Label not found: "${labelText}" [${nth}]`); return null; }
  return page.locator(`#${id}`);
}

async function pickVuetifyOption(page, text) {
  await page.waitForTimeout(800);
  const options = page.locator('.v-overlay__content .v-list-item');
  const count = await options.count();
  const texts = [];
  for (let i = 0; i < count; i++) texts.push(await options.nth(i).innerText().catch(() => ''));
  console.log('Dropdown options:', texts);
  if (count === 0) { console.log('No dropdown options found'); return; }
  if (text) {
    const match = options.filter({ hasText: text }).first();
    if (await match.isVisible().catch(() => false)) { await match.click(); return; }
  }
  await options.first().click();
  await page.waitForTimeout(300);
}

async function openDropdown(page, labelText, nth = 0) {
  const input = await inputByLabel(page, labelText, nth);
  if (!input) { console.log(`Dropdown not found: ${labelText} [${nth}]`); return; }
  await input.locator('xpath=ancestor::div[contains(@class,"v-field")][1]').click();
}

module.exports = { inputByLabel, pickVuetifyOption, openDropdown };
