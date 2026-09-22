function inputByName(page, name) {
  return page.locator(`input[name="${name}"], textarea[name="${name}"]`).first();
}

async function fillInput(page, name, value) {
  if (value === null || value === undefined || value === '') return false;
  const input = inputByName(page, name);
  if (!(await input.count())) {
    console.log(`Input not found: "${name}"`);
    return false;
  }
  await input.click();
  await input.fill(String(value));
  await input.press('Tab');
  console.log(`Filled: ${name}`);
  return true;
}

async function selectCombobox(page, name, optionText) {
  if (!optionText) return false;
  const input = inputByName(page, name);
  if (!(await input.count())) {
    console.log(`Combobox not found: "${name}"`);
    return false;
  }
  await input.click();
  const options = page.locator('lightning-base-combobox-item');
  await options.first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
  const match = page.getByRole('option', { name: optionText, exact: true }).first();
  if (!(await match.isVisible().catch(() => false))) {
    const available = (await options.allInnerTexts()).map(s => s.trim()).filter(Boolean);
    await page.keyboard.press('Escape');
    console.log(`Option "${optionText}" not found for "${name}". Available: ${available.join(' | ')}`);
    return false;
  }
  await match.click();
  await page.waitForTimeout(200);
  console.log(`Selected: ${name} = ${optionText}`);
  return true;
}

async function setToggle(page, name, checked) {
  const input = inputByName(page, name);
  if (!(await input.count())) {
    console.log(`Toggle not found: "${name}"`);
    return false;
  }
  if ((await input.isChecked()) === checked) return true;
  await input.click({ force: true });
  await page.waitForTimeout(200);
  console.log(`Toggle: ${name} = ${checked}`);
  return true;
}

async function selectDualListbox(page, values) {
  const listbox = page.locator('lightning-dual-listbox').first();
  if (!(await listbox.count())) {
    console.log('Dual listbox not found');
    return [];
  }
  const selected = [];
  for (const value of values.filter(Boolean)) {
    const option = listbox.locator(`[data-source-list] [role="option"][data-value="${value}"]`);
    if (!(await option.count())) {
      console.log(`Dual listbox option not found: "${value}"`);
      continue;
    }
    await option.click();
    await listbox.locator('button[title="Move selection to Selected"], button[title*="Selected"]').first().click();
    await page.waitForTimeout(200);
    selected.push(value);
    console.log(`Dual listbox: moved "${value}" to Selected`);
  }
  return selected;
}

async function searchLookup(page, placeholder, query, pickOption) {
  const input = page.locator(`input[placeholder="${placeholder}"]`).first();
  if (!(await input.count())) {
    console.log(`Lookup not found: "${placeholder}"`);
    return null;
  }
  await input.click();
  await input.fill('');
  await input.type(String(query), { delay: 40 });
  const results = page.locator('[data-key="dropdownresult"] [role="option"]');
  await results.first().waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  const count = await results.count();
  if (!count) {
    await page.keyboard.press('Escape');
    console.log(`Lookup "${placeholder}": no results for "${query}"`);
    return null;
  }
  const names = await results.evaluateAll(els => els.map(el => el.getAttribute('data-name')));
  const idx = pickOption ? names.findIndex(pickOption) : 0;
  if (idx < 0) {
    await page.keyboard.press('Escape');
    console.log(`Lookup "${placeholder}": no matching result for "${query}" among ${names.join(', ')}`);
    return null;
  }
  await results.nth(idx).click();
  await page.waitForTimeout(300);
  console.log(`Lookup "${placeholder}": picked ${names[idx]}`);
  return names[idx];
}

module.exports = { inputByName, fillInput, selectCombobox, setToggle, selectDualListbox, searchLookup };
