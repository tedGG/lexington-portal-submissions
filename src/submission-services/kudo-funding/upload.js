const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { downloadContentVersion } = require('../../helpers/salesforce');
const { normaliseFiles, ensureExtension } = require('../../helpers/fileName');
const { dismissInterstitial } = require('./modal');

const DEMO_PDF = Buffer.from(
  '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n' +
  'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n' +
  '0000000058 00000 n \n0000000115 00000 n \n' +
  'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
);

const TEST_FILES = [
  { fileName: 'test-bank-statement-1.pdf', fileType: 'Bank Statement' },
  { fileName: 'test-bank-statement-2.pdf', fileType: 'Bank Statement' },
  { fileName: 'test-bank-statement-3.pdf', fileType: 'Bank Statement' },
  { fileName: 'test-signed-application.pdf', fileType: 'Signed Application' },
];

const FILE_INPUT = '#file-input';
const ACCEPTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.tif', '.tiff', '.bmp'];
const MAX_BYTES = 25 * 1024 * 1024;

const baseName = fileName => fileName.replace(/\.[^.]+$/, '');

function isAccepted(fileName) {
  return ACCEPTED_EXTENSIONS.includes(path.extname(fileName).toLowerCase());
}

async function materialize(file, demo, sandbox) {
  if (demo) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lex-'));
    const tmpPath = path.join(tmpDir, file.fileName);
    fs.writeFileSync(tmpPath, DEMO_PDF);
    return tmpPath;
  }
  const tmpPath = await downloadContentVersion(file.contentVersionId, file.fileName, sandbox);
  console.log(`${file.fileName}: downloaded from Salesforce (${file.contentVersionId})`);
  return tmpPath;
}

async function isListed(frame, fileName) {
  return frame.getByText(baseName(fileName), { exact: false }).first()
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
}

async function uploadDocuments(frame, page, files, demo = false, sandbox = false) {
  if (!demo && (!files || files.length === 0)) {
    console.log('No files in payload, skipping document upload');
    return { uploaded: [], failed: [] };
  }

  const requested = demo ? TEST_FILES : normaliseFiles(files);
  const filesToUpload = [...requested];

  await frame.locator(FILE_INPUT).waitFor({ state: 'attached', timeout: 30_000 });
  console.log(`Preparing ${filesToUpload.length} document(s): ${filesToUpload.map(f => f.fileName).join(', ')}`);

  const tmpPaths = [];
  const skipped = [];
  const oversized = [];
  const accepted = [];
  try {
    for (const file of filesToUpload) {
      const downloaded = await materialize(file, demo, sandbox);
      const resolved = ensureExtension(downloaded, file.fileName);
      file.fileName = resolved.fileName;

      if (!isAccepted(resolved.fileName)) {
        const ext = path.extname(resolved.fileName) || 'no extension';
        console.log(`${resolved.fileName}: SKIPPED — Kudo accepts PDF and image files only (${ext})`);
        skipped.push(resolved.fileName);
        fs.rmSync(path.dirname(resolved.filePath), { recursive: true, force: true });
        continue;
      }

      const { size } = fs.statSync(resolved.filePath);
      if (size > MAX_BYTES) {
        console.log(`${resolved.fileName}: SKIPPED — ${(size / 1024 / 1024).toFixed(1)}MB exceeds the 25MB limit`);
        oversized.push(resolved.fileName);
        fs.rmSync(path.dirname(resolved.filePath), { recursive: true, force: true });
        continue;
      }

      tmpPaths.push(resolved.filePath);
      accepted.push(file);
    }

    if (!tmpPaths.length) {
      console.log('No documents left to upload after validation');
      cleanupTempFiles(tmpPaths);
      return { uploaded: [], failed: [...skipped, ...oversized] };
    }
    console.log(`Uploading ${tmpPaths.length} document(s): ${accepted.map(f => f.fileName).join(', ')}`);

    await frame.locator(FILE_INPUT).setInputFiles(tmpPaths);
    await page.waitForTimeout(1_500);
    await dismissInterstitial(frame, page, 'right after selecting files');
    await page.waitForTimeout(2_000);
    console.log(`Attached ${tmpPaths.length} file(s) to the dropzone`);
  } catch (err) {
    console.log(`Document upload FAILED — ${err.message.split('\n')[0]}`);
    cleanupTempFiles(tmpPaths);
    return { uploaded: [], failed: requested.map(f => f.fileName) };
  }

  await dismissInterstitial(frame, page, 'before verifying the file list');

  const uploaded = [];
  const missing = [];
  for (const file of accepted) {
    (await isListed(frame, file.fileName) ? uploaded : missing).push(file.fileName);
  }
  console.log(`Documents attached: ${uploaded.length}/${accepted.length}` +
    (missing.length ? `. Not visible in list: ${missing.join(', ')}` : ''));

  return {
    uploaded,
    failed: [...new Set([...skipped, ...oversized, ...missing])],
    tmpPaths,
  };
}

function cleanupTempFiles(tmpPaths) {
  for (const tmpPath of tmpPaths || []) {
    try { fs.rmSync(path.dirname(tmpPath), { recursive: true, force: true }); } catch { /* best effort */ }
  }
  if (tmpPaths?.length) console.log(`Cleaned up ${tmpPaths.length} temporary file(s)`);
}

module.exports = { uploadDocuments, cleanupTempFiles, TEST_FILES, ACCEPTED_EXTENSIONS };
