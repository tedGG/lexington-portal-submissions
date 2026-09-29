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

module.exports = { cleanFileName, normaliseFiles };
