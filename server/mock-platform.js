// Мок платформы для локального демо: принимает вебхуки, ведёт балансы зрителей.
// На spin.requested сам решает, платить ли: списывает токены и вызывает /commit с суммой,
// или отказывает через /cancel с сообщением для зрителя.
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
const charged = new Map();  // spin_id → списанная сумма, пока вендор не подтвердил розыгрыш
const seen = new Set();     // event_id — дедупликация повторов
const bal = (v) => balances.get(v) ?? (balances.set(v, 1000), 1000);
function refund(spinId, viewerId) {
  const amt = charged.get(spinId);
  if (amt == null) return;
  charged.delete(spinId);
  balances.set(viewerId, bal(viewerId) + amt);
  console.log(`[platform] вращение ${spinId} не подтверждено вовремя, возврат ${amt}`);
}

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

    res.writeHead(200); res.end('{"ok":true}');

    if (ev.type === 'spin.requested') {
      // правила платформы: баланс, лимиты, акции. Здесь только баланс.
      if (bal(ev.viewer_id) < ev.price) {
        const r = await vendor('POST', `/v1/spins/${ev.spin_id}/cancel`, { message: 'Недостаточно токенов' });
        return console.log(`[platform] отказ ${ev.viewer_id}: мало токенов → cancel ${r.status}`);
      }
      const paid = ev.price;
      balances.set(ev.viewer_id, bal(ev.viewer_id) - paid);
      charged.set(ev.spin_id, paid);
      console.log(`[platform] списано ${paid} у ${ev.viewer_id} (spin ${ev.spin_id})`);
      const r = await vendor('POST', `/v1/spins/${ev.spin_id}/commit`, { paid_amount: paid });
      if (r.status === 200) {
        charged.delete(ev.spin_id);
        return console.log(`[platform] commit → приз: ${r.body.result.item_name}`);
      }
      if (r.body.code === 'spin_expired') refund(ev.spin_id, ev.viewer_id);
      return console.log(`[platform] commit → ${r.status} ${r.body.code}`);
    }
    if (ev.type === 'spin.expired') refund(ev.spin_id, ev.viewer_id);
    if (ev.type === 'spin.result') console.log(`[platform] в ленту чата: ${ev.viewer_id} выиграл «${ev.result.item_name}»`);
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`мок платформы на :${PORT}, балансы по 1000 токенов`));
}
module.exports = { server, balances };
