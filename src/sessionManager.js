const fs = require('fs');
const path = require('path');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function sessionPath(key) {
  return path.join('/tmp', `session-${key}.json`);
}

async function loadSession(context, key) {
  const file = sessionPath(key);
  if (!fs.existsSync(file)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() > data.expiresAt) {
      fs.unlinkSync(file);
      return false;
    }
    await context.addCookies(data.cookies);
    return true;
  } catch {
    return false;
  }
}

async function saveSession(context, key) {
  const cookies = await context.cookies();
  const data = { cookies, expiresAt: Date.now() + SESSION_TTL_MS };
  fs.writeFileSync(sessionPath(key), JSON.stringify(data));
}

function clearSession(key) {
  const file = sessionPath(key);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

module.exports = { loadSession, saveSession, clearSession };
