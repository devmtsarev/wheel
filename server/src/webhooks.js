// Отправка подписанных вебхуков платформе (api/README.md, раздел «Вебхуки»).
// Все события асинхронные, с повторами; вендор никогда не ждёт ответа платформы.
'use strict';
const crypto = require('node:crypto');
const { sign } = require('./sign.js');

const RETRY_DELAYS_S = [1, 10, 60, 300, 1800, 3600];
const MAX_AGE_MS = 24 * 3600 * 1000;

// transport({url, headers, body}) → {status} — подменяется в тестах
async function httpTransport({ url, headers, body, timeoutMs = 5000 }) {
  const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
  return { status: res.status };
}

function createWebhooks(platform, { transport = httpTransport, log = () => {} } = {}) {
  const pending = new Map(); // event_id → timeout handle (для graceful stop)

  function payloadFor(event) {
    const body = JSON.stringify(event);
    const path = new URL(platform.webhook_url).pathname;
    const { timestamp, signature } = sign(platform.webhook_secret, 'POST', path, body);
    return {
      url: platform.webhook_url, body,
      headers: {
        'content-type': 'application/json',
        'x-wheel-event-id': event.event_id,
        'x-wheel-timestamp': timestamp,
        'x-wheel-signature': signature,
      },
    };
  }

  // Доставка с повторами; порядок между событиями не гарантируется
  function deliver(event, attempt = 0, firstAt = Date.now()) {
    transport(payloadFor(event)).then(({ status }) => {
      if (status === 200) { pending.delete(event.event_id); return; }
      throw new Error(`status ${status}`);
    }).catch((err) => {
      log('webhook retry', event.type, event.event_id, String(err));
      if (Date.now() - firstAt > MAX_AGE_MS) { pending.delete(event.event_id); return; }
      const delayS = RETRY_DELAYS_S[Math.min(attempt, RETRY_DELAYS_S.length - 1)];
      const h = setTimeout(() => deliver(event, attempt + 1, firstAt), delayS * 1000);
      if (h.unref) h.unref();
      pending.set(event.event_id, h);
    });
  }

  const newEvent = (type, data) => ({ event_id: `evt_${crypto.randomBytes(10).toString('hex')}`, type, created_at: new Date().toISOString(), ...data });

  return { newEvent, deliver, stop() { for (const h of pending.values()) clearTimeout(h); pending.clear(); } };
}

module.exports = { createWebhooks, RETRY_DELAYS_S };
