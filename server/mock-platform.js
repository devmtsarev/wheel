// Мок платформы для локального демо: принимает вебхуки, ведёт балансы зрителей,
// после успешного резерва сам подтверждает оплату вызовом /spins/{id}/commit.
// Запуск: node mock-platform.js (порт 8081). Это не часть продукта — только стенд.
'use strict';
const http = require('node:http');
const { sign, verifySignature, issueWidgetToken } = require('./src/sign.js');

const CONFIG = require('./config.json');
const PLATFORM_KEY = Object.keys(CONFIG.platforms)[0];
const PLATFORM = CONFIG.platforms[PLATFORM_KEY];
const VENDOR = process.env.VENDOR_URL || `http://localhost:${CONFIG.port}`;
const PORT = Number(process.env.PORT || new URL(PLATFORM.webhook_url).port || 8081);

const balances = new Map(); // viewer_id → tokens
const reserves = new Map(); // spin_id → amount
const seen = new Set();     // event_id — дедупликация повторов
const bal = (v) => balances.get(v) ?? (balances.set(v, 1000), 1000);

async function vendor(method, path, body) {
  const raw = body ? JSON.stringify(body) : '';
  const { timestamp, signature } = sign(PLATFORM.api_secret, method, path, raw);
  const res = await fetch(VENDOR + path, {
    method,
    headers: {
      authorization: `Bearer ${PLATFORM_KEY}`, 'content-type': 'application/json',
      'x-wheel-timestamp': timestamp, 'x-wheel-signature': signature,
      ...(method === 'POST' ? { 'idempotency-key': `mock_${path}_${Date.now()}_${Math.random()}` } : {}),
    },
    body: raw || undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const raw = Buffer.concat(chunks).toString();
    const u = new URL(req.url, 'http://x');

    // выдача widget_token виджету (в проде это делает бэкенд платформы)
    if (req.method === 'GET' && u.pathname === '/widget-token') {
      const token = issueWidgetToken(PLATFORM.widget_secret, {
        wheel_id: u.searchParams.get('wheel'), viewer_id: u.searchParams.get('viewer') || 'viewer-demo',
      });
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      return res.end(JSON.stringify({ token }));
    }

    if (req.method !== 'POST' || u.pathname !== new URL(PLATFORM.webhook_url).pathname) {
      res.writeHead(404); return res.end();
    }
    const v = verifySignature(PLATFORM.webhook_secret, {
      timestamp: req.headers['x-wheel-timestamp'], signature: req.headers['x-wheel-signature'],
      method: 'POST', path: u.pathname, body: raw,
    });
    if (!v.ok) { res.writeHead(401); return res.end(); }

    const ev = JSON.parse(raw);
    if (seen.has(ev.event_id)) { res.writeHead(200); return res.end('{"ok":true,"dup":true}'); }
    seen.add(ev.event_id);

    if (ev.type === 'charge.reserve') {
      if (bal(ev.viewer_id) < ev.amount) { res.writeHead(402); return res.end('{"ok":false}'); }
      balances.set(ev.viewer_id, bal(ev.viewer_id) - ev.amount);
      reserves.set(ev.spin_id, ev.amount);
      console.log(`[platform] reserve ${ev.amount} у ${ev.viewer_id} (spin ${ev.spin_id})`);
      res.writeHead(200); res.end('{"ok":true}');
      // подтверждаем оплату: в проде платформа делает это после своей проверки
      setTimeout(() => vendor('POST', `/v1/spins/${ev.spin_id}/commit`).then(
        (r) => console.log(`[platform] commit → ${r.status}${r.body.result ? ' приз: ' + r.body.result.item_name : ''}`),
        (e) => console.error('[platform] commit failed', e.message)), 150);
      return;
    }
    if (ev.type === 'charge.commit') { reserves.delete(ev.spin_id); console.log(`[platform] списано ${ev.amount} (spin ${ev.spin_id})`); }
    if (ev.type === 'charge.release') {
      const amt = reserves.get(ev.spin_id) ?? ev.amount;
      reserves.delete(ev.spin_id);
      balances.set(ev.viewer_id, bal(ev.viewer_id) + amt);
      console.log(`[platform] резерв снят, возврат ${amt} (spin ${ev.spin_id})`);
    }
    if (ev.type === 'spin.result') console.log(`[platform] в ленту чата: ${ev.viewer_id} выиграл «${ev.result.item_name}»`);
    res.writeHead(200); res.end('{"ok":true}');
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`мок платформы на :${PORT}, балансы по 1000 токенов`));
}
module.exports = { server, balances };
