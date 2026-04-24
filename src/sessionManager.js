const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join('/tmp', 'portal-session.json');
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

async function loadSession(context) {
  if (!fs.existsSync(SESSION_FILE)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (Date.now() > data.expiresAt) {
      fs.unlinkSync(SESSION_FILE);
      return false;
    }
    await context.addCookies(data.cookies);
    return true;
  } catch {
    return false;
  }
}

async function saveSession(context) {
  const cookies = await context.cookies();
  const data = { cookies, expiresAt: Date.now() + SESSION_TTL_MS };
  fs.writeFileSync(SESSION_FILE, JSON.stringify(data));
}

function clearSession() {
  if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
}

module.exports = { loadSession, saveSession, clearSession };
