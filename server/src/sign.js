// Подпись запросов и вебхуков, widget_token (api/README.md, раздел «Доступ и подпись»).
'use strict';
const crypto = require('node:crypto');

const WINDOW_S = 300;

const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmacHex = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex');

function signaturePayload(timestamp, method, path, body) {
  return `${timestamp}.${method.toUpperCase()}.${path}.${sha256hex(body || '')}`;
}

function sign(secret, method, path, body, timestamp = Math.floor(Date.now() / 1000)) {
  return { timestamp: String(timestamp), signature: hmacHex(secret, signaturePayload(timestamp, method, path, body)) };
}

function verifySignature(secret, { timestamp, signature, method, path, body, now = Date.now() }) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, code: 'invalid_signature' };
  if (Math.abs(now / 1000 - ts) > WINDOW_S) return { ok: false, code: 'stale_timestamp' };
  const expect = hmacHex(secret, signaturePayload(timestamp, method, path, body));
  const a = Buffer.from(expect), b = Buffer.from(String(signature || ''));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, code: 'invalid_signature' };
  return { ok: true };
}

// --- widget_token: компактный JWT HS256, выдаёт платформа своим widget_secret ---
const b64u = (buf) => Buffer.from(buf).toString('base64url');

function issueWidgetToken(secret, { wheel_id, viewer_id, ttl_s = 900 }) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify({ wheel_id, viewer_id, exp: Math.floor(Date.now() / 1000) + ttl_s }));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function verifyWidgetToken(secret, token, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expect = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  const a = Buffer.from(expect), b = Buffer.from(s);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (!payload.exp || payload.exp * 1000 < now) return null;
    return payload;
  } catch { return null; }
}

module.exports = { WINDOW_S, sign, verifySignature, issueWidgetToken, verifyWidgetToken, sha256hex };
