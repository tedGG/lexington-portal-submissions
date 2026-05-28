const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { URLSearchParams } = require('url');

const {
  SF_LOGIN_URL = 'https://test.salesforce.com',
  SF_CLIENT_ID,
  SF_CLIENT_SECRET,
} = process.env;

let cachedToken = null;

function post(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, body: JSON.parse(text) });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function authenticate() {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
  });

  const { status, body } = await post(`${SF_LOGIN_URL}/services/oauth2/token`, params.toString());
  if (status !== 200) throw new Error(`Salesforce auth failed: ${body.error_description || body.error}`);

  console.log('Salesforce authenticated');
  return body; // { access_token, instance_url, ... }
}

async function getToken() {
  if (!cachedToken) cachedToken = await authenticate();
  return cachedToken;
}

function fetchFile(url, accessToken) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.get(url, { headers: { Authorization: `Bearer ${accessToken}` } }, (res) => {
      if (res.statusCode === 401) { reject(new Error('UNAUTHORIZED')); res.resume(); return; }
      if (res.statusCode !== 200) { reject(new Error(`SF download failed: HTTP ${res.statusCode}`)); res.resume(); return; }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
  });
}

async function downloadContentVersion(contentVersionId, fileName) {
  let token = await getToken();

  const download = async () => {
    const url = `${token.instance_url}/services/data/v59.0/sobjects/ContentVersion/${contentVersionId}/VersionData`;
    const buf = await fetchFile(url, token.access_token);
    const tmpPath = path.join('/tmp', `${randomUUID()}-${fileName}`);
    fs.writeFileSync(tmpPath, buf);
    return tmpPath;
  };

  try {
    return await download();
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') {
      // Token expired — re-authenticate once and retry
      cachedToken = null;
      token = await getToken();
      return await download();
    }
    throw err;
  }
}

module.exports = { downloadContentVersion };
