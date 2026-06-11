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
  { fileName: 'test-application.pdf', category: 'Application' },
];

function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const map = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.heic': 'image/heic', '.heif': 'image/heic', '.csv': 'text/csv' };
  return map[ext] || 'application/octet-stream';
}

function getTabId(category) {
  const cat = (category || '').toLowerCase();
  if (cat.includes('bank')) return 'bank-statements';
  if (cat.includes('application')) return 'merchant-application';
  return 'other';
}

async function uploadFiles(page, files, demo = false) {
  if (!demo && (!files || files.length === 0)) return;

  const filesToUpload = demo ? TEST_FILES : files;

  await page.locator('#files').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  console.log('Scrolled to Files section.');

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

      const tabId = getTabId(file.category);
      await page.click(`[data-tab-id="${tabId}"]`);
      await page.waitForTimeout(400);
      console.log(`Selected tab "${tabId}" for: ${file.fileName}`);

      await page.locator('input[data-testid="upload_file"]').setInputFiles({
        name: file.fileName,
        mimeType: getMimeType(file.fileName),
        buffer: fs.readFileSync(tmpPath),
      });
      console.log(`File input set: ${file.fileName}`);

      // wait for the file to appear in the list
      await page.waitForTimeout(3000);
      console.log(`Uploaded: ${file.fileName}`);
    } catch (err) {
      console.log(`Error uploading ${file.fileName}: ${err.message}`);
    } finally {
      if (tmpPath) try { fs.unlinkSync(tmpPath); } catch {}
    }
  }
}

module.exports = { uploadFiles, TEST_FILES };
