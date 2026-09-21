const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { downloadContentVersion } = require('../helpers/salesforce');

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

async function visibleDialogText(page) {
  const texts = await page.locator('.v-overlay__content:visible').allInnerTexts().catch(() => []);
  return texts.map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ') || '(no dialog on screen)';
}

async function isListed(page, fileName) {
  return page.getByText(baseName(fileName)).first().isVisible().catch(() => false);
}

async function selectCategory(page, dialog, category) {
  const field = dialog.locator('.v-select .v-field');
  const option = page.locator('.v-overlay__content .v-list-item').filter({ hasText: category }).first();
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!(await option.isVisible().catch(() => false))) await field.click();
    await option.waitFor({ state: 'visible', timeout: 5_000 });
    await option.click({ force: true });
    try {
      await dialog.locator('.v-select .v-field', { hasText: category }).waitFor({ timeout: 1_500 });
      return;
    } catch {
      console.log(`Category "${category}" did not register (attempt ${attempt}), retrying`);
    }
  }
  throw new Error(`Could not select category "${category}"`);
}

async function uploadOne(page, file, tmpPath) {
  const name = file.fileName;
  await page.locator('.file-upload-cover__input').setInputFiles(tmpPath);

  const dialog = page.locator('.v-overlay__content').filter({ has: page.locator('.v-card-title', { hasText: 'Add Files' }) });
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

  await page.getByText(baseName(name)).first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
    console.log(`${name}: not visible in the file list yet, will re-check at the end`);
  });
}

async function uploadFiles(page, files, demo = false) {
  if (!demo && (!files || files.length === 0)) return { uploaded: [], failed: [] };

  await page.locator('.v-tab', { hasText: /file upload/i }).click();
  await page.locator('.file-upload-cover__input').waitFor({ state: 'attached', timeout: 15_000 });

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
      await page.keyboard.press('Escape').catch(() => {});
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
