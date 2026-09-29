const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { URLSearchParams } = require('url');

const tokenCache = { production: null, sandbox: null };

function orgConfig(sandbox) {
  if (sandbox) {
    return {
      name: 'sandbox',
      loginUrl: process.env.SF_SANDBOX_LOGIN_URL || 'https://test.salesforce.com',
      clientId: process.env.SF_SANDBOX_CLIENT_ID,
      clientSecret: process.env.SF_SANDBOX_CLIENT_SECRET,
    };
  }
  return {
    name: 'production',
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET,
  };
}

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

async function authenticate(sandbox) {
  const org = orgConfig(sandbox);
  if (!org.clientId || !org.clientSecret) {
    throw new Error(`Salesforce ${org.name} credentials are not set (${sandbox ? 'SF_SANDBOX_CLIENT_ID / SF_SANDBOX_CLIENT_SECRET' : 'SF_CLIENT_ID / SF_CLIENT_SECRET'})`);
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: org.clientId,
    client_secret: org.clientSecret,
  });

  const { status, body } = await post(`${org.loginUrl}/services/oauth2/token`, params.toString());
  if (status !== 200) throw new Error(`Salesforce ${org.name} auth failed: ${body.error_description || body.error}`);

  console.log(`Salesforce authenticated (${org.name}: ${org.loginUrl})`);
  return body;
}

async function getToken(sandbox = false) {
  const key = sandbox ? 'sandbox' : 'production';
  if (!tokenCache[key]) tokenCache[key] = await authenticate(sandbox);
  return tokenCache[key];
}

function jsonRequest(method, url, accessToken, payload) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = payload === undefined ? null : JSON.stringify(payload);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function sfRequest(method, apiPath, payload, sandbox = false) {
  let token = await getToken(sandbox);
  let res = await jsonRequest(method, `${token.instance_url}${apiPath}`, token.access_token, payload);
  if (res.status === 401) {
    tokenCache[sandbox ? 'sandbox' : 'production'] = null;
    token = await getToken(sandbox);
    res = await jsonRequest(method, `${token.instance_url}${apiPath}`, token.access_token, payload);
  }
  if (res.status >= 400) {
    throw new Error(`Salesforce ${method} ${apiPath} failed (HTTP ${res.status}): ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

const objectByKeyPrefix = { production: null, sandbox: null };

async function objectNameForId(recordId, sandbox = false) {
  const key = sandbox ? 'sandbox' : 'production';
  if (!objectByKeyPrefix[key]) {
    const { sobjects } = await sfRequest('GET', '/services/data/v59.0/sobjects/', undefined, sandbox);
    objectByKeyPrefix[key] = Object.fromEntries(sobjects.filter(o => o.keyPrefix).map(o => [o.keyPrefix, o.name]));
  }
  const name = objectByKeyPrefix[key][recordId.slice(0, 3)];
  if (!name) throw new Error(`No Salesforce object matches id prefix "${recordId.slice(0, 3)}" in the ${key} org`);
  return name;
}

async function updateRecord(recordId, fields, sandbox = false) {
  const objectName = await objectNameForId(recordId, sandbox);
  await sfRequest('PATCH', `/services/data/v59.0/sobjects/${objectName}/${recordId}`, fields, sandbox);
  return objectName;
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

async function downloadContentVersion(contentVersionId, fileName, sandbox = false) {
  if (!contentVersionId) throw new Error(`No contentVersionId supplied for "${fileName}"`);
  let token = await getToken(sandbox);

  const download = async () => {
    const url = `${token.instance_url}/services/data/v59.0/sobjects/ContentVersion/${contentVersionId}/VersionData`;
    const buf = await fetchFile(url, token.access_token);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lex-'));
    const tmpPath = path.join(tmpDir, path.basename(fileName));
    fs.writeFileSync(tmpPath, buf);
    return tmpPath;
  };

  try {
    return await download();
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') {
      tokenCache[sandbox ? 'sandbox' : 'production'] = null;
      token = await getToken(sandbox);
      return await download();
    }
    throw err;
  }
}

function isScreenshotUploadEnabled() {
  const value = process.env.UPLOAD_SCREENSHOTS;
  return !(typeof value === 'string' && value.trim().toLowerCase() === 'false');
}

async function uploadScreenshot(base64Data, title, recordId, sandbox = false) {
  const token = await getToken(sandbox);

  const body = JSON.stringify({
    Title: title,
    PathOnClient: `${title}.png`,
    VersionData: base64Data,
    ...(recordId ? { FirstPublishLocationId: recordId } : {}),
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${token.instance_url}/services/data/v59.0/sobjects/ContentVersion`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const result = JSON.parse(Buffer.concat(chunks).toString());
        if (res.statusCode >= 400) reject(new Error(`SF upload failed: ${JSON.stringify(result)}`));
        else resolve(result);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { downloadContentVersion, uploadScreenshot, updateRecord, isScreenshotUploadEnabled };
