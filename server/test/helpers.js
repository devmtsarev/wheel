'use strict';
const { createApp } = require('../src/app.js');
const { sign } = require('../src/sign.js');

const KEY = 'wl_test_key';
const PLATFORM = {
  id: 'platform-test', api_secret: 'test-api-secret',
  webhook_url: 'http://platform.test/webhooks', webhook_secret: 'test-webhook-secret',
  widget_secret: 'test-widget-secret',
};

const MENU = [
  { name: 'Спасибо в чат', price: 5, weight: 22, role: 'consolation', duration_s: 5 },
  { name: 'Воздушный поцелуй', price: 15, weight: 20, duration_s: 15 },
  { name: 'Комплимент зрителю', price: 20, weight: 17, duration_s: 20 },
  { name: 'Ответ на любой вопрос', price: 40, weight: 13, duration_s: 45 },
  { name: 'Песня (куплет)', price: 60, weight: 11, duration_s: 90 },
  { name: 'Танец, 1 минута', price: 100, weight: 9, duration_s: 60 },
  { name: 'Смена образа', price: 200, weight: 6, duration_s: 240 },
  { name: 'Особый номер (джекпот)', price: 500, weight: 2, role: 'jackpot', duration_s: 600 },
];

// транспорт вебхуков в памяти: собирает события, всегда отвечает 200
function memoryTransport() {
  const events = [];
  return {
    events,
    async transport({ body }) {
      events.push(JSON.parse(body));
      return { status: 200 };
    },
  };
}

async function startApp() {
  const tp = memoryTransport();
  const app = createApp({ platforms: { [KEY]: { ...PLATFORM } }, transport: tp.transport.bind(tp), log: () => {} });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://localhost:${app.server.address().port}`;
  let n = 0;
  async function call(method, path, body, { idem, auth = true, headers = {} } = {}) {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const h = { 'content-type': 'application/json', ...headers };
    if (auth === true) {
      const { timestamp, signature } = sign(PLATFORM.api_secret, method, path, raw);
      h.authorization = `Bearer ${KEY}`;
      h['x-wheel-timestamp'] = timestamp;
      h['x-wheel-signature'] = signature;
      if (method === 'POST') h['idempotency-key'] = idem || `t${++n}`;
    } else if (typeof auth === 'string') {
      h.authorization = `Bearer ${auth}`; // widget_token
    }
    const res = await fetch(base + path, { method, headers: h, body: raw || undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
  return { app, base, call, tp, PLATFORM, KEY };
}

module.exports = { startApp, MENU, PLATFORM, KEY };
