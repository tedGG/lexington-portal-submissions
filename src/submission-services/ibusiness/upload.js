const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { downloadContentVersion, uploadScreenshot } = require('../../helpers/salesforce');

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
  { fileName: 'test-application.pdf', fileType: 'Application' },
];

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.gif', '.png', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.svg', '.zip'];

const ADD_FILES_BUTTON = 'button:has-text("Add Files")';
const UPLOAD_MODAL = 'section.slds-modal';
const FILE_INPUT = 'lightning-file-upload input[type="file"]';
const SAVE_AND_CLOSE = 'button:has-text("Save and Close")';
const EDIT_DETAILS = 'button:has-text("Edit Details")';
const DONE_BUTTON = 'button.ok';

const baseName = fileName => fileName.replace(/\.[^.]+$/, '');
const escapeRegExp = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isAccepted(fileName) {
  return ACCEPTED_EXTENSIONS.includes(path.extname(fileName).toLowerCase());
}

async function fileCount(page) {
  const header = await page.locator('text=/^Files \\(\\d+\\)$/').first().innerText().catch(() => '');
  const match = header.match(/\((\d+)\)/);
  return match ? Number(match[1]) : null;
}

async function isListed(page, fileName) {
  return page.getByText(baseName(fileName), { exact: false }).first().isVisible().catch(() => false);
}

async function pickComboboxOption(page, combobox, optionText) {
  await combobox.locator('input, button').first().click();
  const option = combobox.locator('lightning-base-combobox-item')
    .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(optionText)}\\s*$`) })
    .first();
  if (!(await option.count())) {
    await page.keyboard.press('Escape');
    return false;
  }
  await option.scrollIntoViewIfNeeded().catch(() => {});
  await option.click();
  return true;
}

async function setFileDetails(page, filesToUpload) {
  const wanted = filesToUpload.filter(f => f.fileType || f.category);
  if (!wanted.length) return { tagged: [], untagged: [] };

  await page.locator(EDIT_DETAILS).first().click();
  const saveButton = page.locator('button:text-is("Save")').first();
  await saveButton.waitFor({ state: 'visible', timeout: 30_000 });
  console.log('Opened "Edit Details" — setting file types');

  const rows = page.locator('tr').filter({ has: page.locator('lightning-combobox') });
  const rowCount = await rows.count();

  const tagged = [];
  const untagged = [];

  for (const file of wanted) {
    let matched = false;
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const title = await row.locator('lightning-input input').first().inputValue().catch(() => '');
      if (!title.includes(baseName(file.fileName))) continue;

      const combos = row.locator('lightning-combobox');
      if (file.category) {
        const ok = await pickComboboxOption(page, combos.nth(0), file.category);
        console.log(`${file.fileName}: category "${file.category}" ${ok ? 'set' : 'NOT FOUND'}`);
      }
      if (file.fileType) {
        const ok = await pickComboboxOption(page, combos.nth(1), file.fileType);
        console.log(`${file.fileName}: file type "${file.fileType}" ${ok ? 'set' : 'NOT FOUND'}`);
        if (!ok) { untagged.push(file.fileName); matched = true; break; }
      }
      tagged.push(file.fileName);
      matched = true;
      break;
    }
    if (!matched) {
      console.log(`${file.fileName}: no matching row found in Edit Details`);
      untagged.push(file.fileName);
    }
  }

  await saveButton.click();
  await saveButton.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => console.log('Edit Details still open after Save'));
  console.log(`Saved file details (${tagged.length}/${wanted.length} tagged)`);
  return { tagged, untagged };
}

async function attachFailureScreenshot(page, label, recordId) {
  if (!recordId) return;
  try {
    const png = await page.screenshot({ fullPage: true });
    await uploadScreenshot(png.toString('base64'), `ibusiness-upload-failed-${label}`, recordId);
    console.log(`Failure screenshot attached to Salesforce record ${recordId}`);
  } catch (err) {
    console.log(`Could not attach failure screenshot — ${err.message}`);
  }
}

async function closeModal(page) {
  const modal = page.locator(UPLOAD_MODAL);
  if (!(await modal.isVisible().catch(() => false))) return;
  const cancel = modal.locator('button:has-text("Cancel")').first();
  if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {});
  else await page.keyboard.press('Escape').catch(() => {});
  await modal.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => console.log('Upload modal is still open'));
}

async function materialize(file, demo) {
  if (demo) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lex-'));
    const tmpPath = path.join(tmpDir, file.fileName);
    fs.writeFileSync(tmpPath, DEMO_PDF);
    return tmpPath;
  }
  const tmpPath = await downloadContentVersion(file.contentVersionId, file.fileName);
  console.log(`${file.fileName}: downloaded from Salesforce (${file.contentVersionId})`);
  return tmpPath;
}

async function uploadFiles(page, files, demo = false, recordId = null) {
  if (!demo && (!files || files.length === 0)) {
    console.log('No files in payload, skipping upload');
    return { uploaded: [], failed: [] };
  }

  const requested = demo ? TEST_FILES : files;
  const skipped = requested.filter(f => !isAccepted(f.fileName));
  const filesToUpload = requested.filter(f => isAccepted(f.fileName));

  for (const file of skipped) {
    console.log(`${file.fileName}: SKIPPED — extension not accepted by portal (${ACCEPTED_EXTENSIONS.join(' ')})`);
  }
  if (!filesToUpload.length) return { uploaded: [], failed: skipped.map(f => f.fileName) };

  await page.locator(ADD_FILES_BUTTON).first().waitFor({ timeout: 30_000 });
  const before = await fileCount(page);
  console.log(`Files section ready (currently ${before ?? '?'} file(s)). Uploading ${filesToUpload.length}: ${filesToUpload.map(f => f.fileName).join(', ')}`);

  const tmpPaths = [];
  try {
    for (const file of filesToUpload) tmpPaths.push(await materialize(file, demo));

    await page.locator(ADD_FILES_BUTTON).first().click();
    await page.locator(UPLOAD_MODAL).waitFor({ state: 'visible', timeout: 15_000 });

    const input = page.locator(FILE_INPUT).first();
    await input.waitFor({ state: 'attached', timeout: 15_000 });
    await input.setInputFiles(tmpPaths);
    console.log(`Selected ${tmpPaths.length} file(s) in upload dialog`);

    const done = page.locator(DONE_BUTTON).or(page.locator('button:has-text("Done")')).first();
    await done.waitFor({ state: 'visible', timeout: 120_000 });
    console.log('Upload finished in dialog — clicking "Done"');
    await done.click();
    await done.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});

    await page.locator(SAVE_AND_CLOSE).first().click();
    await page.locator(UPLOAD_MODAL).waitFor({ state: 'hidden', timeout: 60_000 });
    console.log('Clicked "Save and Close" — upload committed');

    if (typeof before === 'number') {
      const target = before + filesToUpload.length;
      const deadline = Date.now() + 30_000;
      let now = await fileCount(page);
      while (now !== null && now < target && Date.now() < deadline) {
        await page.waitForTimeout(1_000);
        now = await fileCount(page);
      }
      if (now !== null && now < target) {
        console.log(`File count reached ${now}, expected ${target}`);
      }
    }
  } catch (err) {
    console.log(`Upload FAILED — ${err.message.split('\n')[0]}`);
    await attachFailureScreenshot(page, 'batch', recordId);
    await closeModal(page);
    return { uploaded: [], failed: [...skipped, ...filesToUpload].map(f => f.fileName) };
  } finally {
    for (const tmpPath of tmpPaths) { try { fs.rmSync(path.dirname(tmpPath), { recursive: true, force: true }); } catch {} }
  }

  try {
    await setFileDetails(page, filesToUpload);
  } catch (err) {
    console.log(`Setting file types FAILED — ${err.message.split('\n')[0]}`);
    await attachFailureScreenshot(page, 'file-details', recordId);
  }

  const uploaded = [];
  const missing = [];
  for (const file of filesToUpload) {
    (await isListed(page, file.fileName) ? uploaded : missing).push(file.fileName);
  }
  console.log(`File upload summary: ${uploaded.length}/${filesToUpload.length} listed in portal (now ${await fileCount(page) ?? '?'} total)` +
    (missing.length ? `. Missing: ${missing.join(', ')}` : ''));

  return { uploaded, failed: [...new Set([...skipped.map(f => f.fileName), ...missing])] };
}

module.exports = { uploadFiles, TEST_FILES, ACCEPTED_EXTENSIONS };
