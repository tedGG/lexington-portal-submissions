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


async function uploadFiles(page, files, demo = false) {
  if (!demo && (!files || files.length === 0)) return;

  await page.locator('.v-tab', { hasText: /file upload/i }).click();
  await page.waitForTimeout(1500);
  console.log('Navigated to File Upload tab');

  const filesToUpload = demo ? TEST_FILES : files;

  for (const file of filesToUpload) {
    let tmpPath = null;
    try {
      if (demo) {
        tmpPath = path.join('/tmp', `${randomUUID()}-${file.fileName}`);
        fs.writeFileSync(tmpPath, DEMO_PDF);
        console.log(`Created demo file: ${file.fileName}`);
      } else {
        console.log(`Downloading from Salesforce: ${file.fileName} (${file.contentVersionId})`);
        tmpPath = await downloadContentVersion(file.contentVersionId, file.fileName);
        console.log(`Downloaded: ${file.fileName}`);
      }

      await page.locator('.file-upload-cover__input').setInputFiles(tmpPath);
      try {
        await page.locator('.v-card-title', { hasText: 'Add Files' }).waitFor({ state: 'visible', timeout: 10_000 });
      } catch {
        console.log(`Dialog did not open for ${file.fileName}, skipping`);
        continue;
      }
      console.log(`Add Files dialog opened for: ${file.fileName}`);

      const dialog = page.locator('.v-overlay__content').filter({ has: page.locator('.v-card-title', { hasText: 'Add Files' }) });
      await dialog.locator('.v-select .v-field').click();
      await page.waitForTimeout(800);
      await page.locator('.v-list-item').filter({ hasText: file.category }).first().click({ force: true });
      await page.waitForTimeout(500);
      console.log(`Selected category: ${file.category}`);

      await dialog.locator('button[type="submit"]').click();
      await page.locator('.v-card-text', { hasText: /uploading/i }).waitFor({ state: 'visible', timeout: 10_000 });
      console.log(`Upload initiated for: ${file.fileName}`);

      await page.getByRole('button', { name: /^ok$/i }).click();
      await page.locator('.v-card-text', { hasText: /uploading/i }).waitFor({ state: 'detached', timeout: 10_000 });

      await page.locator('.v-list-item', { hasText: file.fileName.replace(/\.pdf$/i, '') }).waitFor({ state: 'visible', timeout: 30_000 });
      console.log(`File confirmed in list: ${file.fileName}`);
      await page.waitForTimeout(500);
    } catch (err) {
      console.log(`Error uploading ${file.fileName}: ${err.message}`);
      try { await page.keyboard.press('Escape'); } catch {}
    } finally {
      if (tmpPath) try { fs.unlinkSync(tmpPath); } catch {}
    }
  }
}

module.exports = { uploadFiles, TEST_FILES };
