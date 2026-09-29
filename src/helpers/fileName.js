const path = require('path');

function cleanFileName(rawName) {
  const name = String(rawName ?? '').trim();
  if (!name) return name;

  const ext = path.extname(name);
  if (!ext) return name;

  const lowerExt = ext.toLowerCase();
  let base = name.slice(0, -ext.length);
  while (base.toLowerCase().endsWith(lowerExt)) {
    base = base.slice(0, -ext.length);
  }

  const cleaned = `${base.trim()}${ext}`;
  if (cleaned !== name) console.log(`Filename normalised: "${name}" -> "${cleaned}"`);
  return cleaned;
}

function normaliseFiles(files) {
  return (files || []).map(file => ({ ...file, fileName: cleanFileName(file.fileName) }));
}

const fs = require('fs');

const SIGNATURES = [
  { ext: '.pdf', matches: b => b.slice(0, 4).toString('latin1') === '%PDF' },
  { ext: '.png', matches: b => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: '.jpg', matches: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.gif', matches: b => b.slice(0, 3).toString('latin1') === 'GIF' },
  { ext: '.webp', matches: b => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' },
  { ext: '.tif', matches: b => ['II*\u0000', 'MM\u0000*'].includes(b.slice(0, 4).toString('latin1')) },
  { ext: '.bmp', matches: b => b.slice(0, 2).toString('latin1') === 'BM' },
  { ext: '.zip', matches: b => b[0] === 0x50 && b[1] === 0x4b },
];

function detectExtension(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    const hit = SIGNATURES.find(s => { try { return s.matches(head); } catch { return false; } });
    return hit ? hit.ext : null;
  } catch {
    return null;
  }
}

function ensureExtension(filePath, fileName) {
  if (path.extname(fileName)) return { filePath, fileName };

  const detected = detectExtension(filePath);
  if (!detected) {
    console.log(`${fileName}: no extension and file type could not be detected from its contents`);
    return { filePath, fileName };
  }

  const fixedName = `${fileName}${detected}`;
  const fixedPath = path.join(path.dirname(filePath), fixedName);
  try {
    fs.renameSync(filePath, fixedPath);
    console.log(`${fileName}: no extension in Salesforce title — detected ${detected} from file contents, using "${fixedName}"`);
    return { filePath: fixedPath, fileName: fixedName };
  } catch {
    return { filePath, fileName };
  }
}

module.exports = { cleanFileName, normaliseFiles, detectExtension, ensureExtension };
