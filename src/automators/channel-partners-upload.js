const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { downloadContentVersion, uploadScreenshot } = require('../helpers/salesforce');
const { dismissCookieBanner } = require('../helpers/vuetify');

const DEMO_PDF = Buffer.from(
  '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n' +
  'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n' +
  '0000000058 00000 n \n0000000115 00000 n \n' +
  'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
);

const TEST_FILES = [
  { fileName: 'test-bank-statement-1.pdf', category: 'Bank Statement' },
  { fileName: 'test-bank-statement-2.pdf', category: 'Bank Statement' },
  { fileName: 'test-bank-statement-3.pdf', category: 'Bank Statement' },
  { fileName: 'test-application.pdf', category: 'Application' },
];

const baseName = fileName => fileName.replace(/\.[^.]+$/, '');
const escapeRegExp = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function visibleDialogText(page) {
  const texts = await page.locator('.v-overlay__content:visible').allInnerTexts().catch(() => []);
  return texts.map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ') || '(no dialog on screen)';
}

function inFileList(pattern) {
  const re = new RegExp(pattern);
  return [...document.querySelectorAll('body *')].some(el =>
    el.childElementCount === 0 &&
    el.offsetParent !== null &&
    !el.closest('.v-overlay-container, .v-overlay') &&
    re.test(el.textContent)
  );
}

const listedPattern = fileName => `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-${escapeRegExp(baseName(fileName))}`;

async function isListed(page, fileName) {
  return page.evaluate(inFileList, listedPattern(fileName)).catch(() => false);
}

async function waitListed(page, fileName, timeout) {
  return page.waitForFunction(inFileList, listedPattern(fileName), { timeout }).then(() => true, () => false);
}

async function attachFailureScreenshot(page, fileName, recordId) {
  if (!recordId) return;
  try {
    const png = await page.screenshot({ fullPage: true });
    await uploadScreenshot(png.toString('base64'), `channel-partners-upload-failed-${baseName(fileName)}`, recordId);
    console.log(`${fileName}: failure screenshot attached to Salesforce record ${recordId}`);
  } catch (err) {
    console.log(`${fileName}: could not attach failure screenshot — ${err.message}`);
  }
}

async function closeDialog(page, dialog) {
  if (!(await dialog.isVisible().catch(() => false))) return;
  const closeBtn = dialog.getByRole('button', { name: /cancel|close/i }).first();
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click().catch(() => {});
  else await page.keyboard.press('Escape').catch(() => {});
  await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => console.log('Add Files dialog is still open'));
}

async function categoryShown(page, field, category) {
  const handle = await field.elementHandle();
  return page.waitForFunction(([el, cat]) =>
    el.innerText.includes(cat) || [...el.querySelectorAll('input')].some(i => i.value.includes(cat)),
  [handle, category], { timeout: 1_500 }).then(() => true, () => false);
}

async function selectCategory(page, dialog, category) {
  const field = dialog.locator('.v-select .v-field');
  const option = page.locator('.v-overlay__content .v-list-item').filter({ hasText: category }).first();
  for (let attempt = 1; attempt <= 2; attempt++) {
    await dismissCookieBanner(page);
    if (!(await option.isVisible().catch(() => false))) await field.click();
    await option.waitFor({ state: 'visible', timeout: 5_000 });
    try {
      await option.click({ timeout: 3_000 });
    } catch {
      console.log(`Option "${category}" is covered by another element, clicking it directly`);
      await option.dispatchEvent('click');
    }
    if (await categoryShown(page, field, category)) return;
    if (attempt === 1) console.log(`Category "${category}" not confirmed in the field, clicking again`);
  }
  console.log(`Category "${category}" still not confirmed, submitting anyway`);
}

const addFilesDialog = page =>
  page.locator('.v-overlay__content').filter({ has: page.locator('.v-card-title', { hasText: 'Add Files' }) });

async function uploadOne(page, file, tmpPath) {
  const name = file.fileName;
  await page.locator('.file-upload-cover__input').setInputFiles(tmpPath);

  const dialog = addFilesDialog(page);
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });

  await selectCategory(page, dialog, file.category);
  await dialog.locator('button[type="submit"]').click();

  const uploading = page.locator('.v-card-text', { hasText: /uploading/i });
  try {
    await uploading.waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    const dialogClosed = !(await dialog.isVisible().catch(() => false));
    if (dialogClosed && await isListed(page, name)) {
      console.log(`${name}: upload finished before the progress dialog was seen`);
      return;
    }
    throw new Error(`upload did not start after submit. On screen: ${await visibleDialogText(page)}`);
  }

  await page.getByRole('button', { name: /^ok$/i }).click();
  await uploading.waitFor({ state: 'detached', timeout: 60_000 });
  console.log(`${name}: uploaded (${file.category})`);

  if (!(await waitListed(page, name, 10_000))) {
    console.log(`${name}: not visible in the file list yet, will re-check at the end`);
  }
}

async function uploadFiles(page, files, demo = false, recordId = null) {
  if (!demo && (!files || files.length === 0)) return { uploaded: [], failed: [] };

  await page.locator('.v-tab', { hasText: /file upload/i }).click();
  await page.locator('.file-upload-cover__input').waitFor({ state: 'attached', timeout: 15_000 });
  await dismissCookieBanner(page);

  const filesToUpload = demo ? TEST_FILES : files;
  console.log(`Uploading ${filesToUpload.length} file(s): ${filesToUpload.map(f => f.fileName).join(', ')}`);

  const failed = [];
  for (const file of filesToUpload) {
    let tmpPath = null;
    try {
      if (demo) {
        tmpPath = path.join('/tmp', `${randomUUID()}-${file.fileName}`);
        fs.writeFileSync(tmpPath, DEMO_PDF);
      } else {
        tmpPath = await downloadContentVersion(file.contentVersionId, file.fileName);
        console.log(`${file.fileName}: downloaded from Salesforce (${file.contentVersionId})`);
      }
      await uploadOne(page, file, tmpPath);
    } catch (err) {
      console.log(`${file.fileName}: FAILED — ${err.message.split('\n')[0]}`);
      failed.push(file.fileName);
      await attachFailureScreenshot(page, file.fileName, recordId);
      await closeDialog(page, addFilesDialog(page));
    } finally {
      if (tmpPath) try { fs.unlinkSync(tmpPath); } catch {}
    }
  }

  const uploaded = [];
  const missing = [];
  for (const file of filesToUpload) {
    (await isListed(page, file.fileName) ? uploaded : missing).push(file.fileName);
  }
  console.log(`File upload summary: ${uploaded.length}/${filesToUpload.length} in portal list` +
    (missing.length ? `. Missing: ${missing.join(', ')}` : ''));

  return { uploaded, failed: [...new Set([...failed, ...missing])] };
}

module.exports = { uploadFiles, TEST_FILES };
