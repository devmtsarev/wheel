// Сквозное демо: вендор + мок платформы + WebSocket. Запуск: npm run demo
'use strict';
const { createApp } = require('./src/app.js');
const { sign, issueWidgetToken } = require('./src/sign.js');
const fair = require('./src/fair.js');
const WebSocket = require('ws');

const config = require('./config.json');
const KEY = Object.keys(config.platforms)[0];
const PL = config.platforms[KEY];

async function main() {
  // мок платформы на порту вебхуков
  process.env.VENDOR_URL = '';
  const mock = require('./mock-platform.js');
  const whPort = Number(new URL(PL.webhook_url).port);
  await new Promise((r) => mock.server.listen(whPort, r));

  const app = createApp({ ...config, log: () => {} });
  await new Promise((r) => app.server.listen(config.port, r));
  const base = `http://localhost:${config.port}`;
  process.env.VENDOR_URL = base;

  let n = 0;
  const call = async (method, path, body) => {
    const raw = body ? JSON.stringify(body) : '';
    const { timestamp, signature } = sign(PL.api_secret, method, path, raw);
    const res = await fetch(base + path, {
      method,
      headers: {
        authorization: `Bearer ${KEY}`, 'content-type': 'application/json',
        'x-wheel-timestamp': timestamp, 'x-wheel-signature': signature,
        ...(method !== 'GET' ? { 'idempotency-key': `demo-${++n}` } : {}),
      },
      body: raw || undefined,
    });
    return { status: res.status, body: await res.json() };
  };

  const MENU = [
    { name: 'Спасибо в чат', price: 5, weight: 22, role: 'consolation', duration_s: 5 },
    { name: 'Воздушный поцелуй', price: 15, weight: 20 }, { name: 'Комплимент зрителю', price: 20, weight: 17 },
    { name: 'Ответ на любой вопрос', price: 40, weight: 13 }, { name: 'Песня (куплет)', price: 60, weight: 11 },
    { name: 'Танец, 1 минута', price: 100, weight: 9 }, { name: 'Смена образа', price: 200, weight: 6 },
    { name: 'Особый номер (джекпот)', price: 500, weight: 2, role: 'jackpot', duration_s: 600 },
  ];

  console.log('1. Создаём колесо…');
  const wheel = (await call('POST', '/v1/wheels', { model_id: 'model-demo', items: MENU, compliance_ack: true })).body;
  console.log(`   версия ${wheel.id}, цена ${wheel.current_price}, EV ${wheel.stats.ev.toFixed(1)}, hash ${wheel.content_hash.slice(0, 16)}…`);

  await call('PUT', '/v1/models/model-demo/stream', { live: true, queue_limit: 5, ends_at: new Date(Date.now() + 3600e3).toISOString() });

  console.log('2. Виджет подключается к WS…');
  const token = issueWidgetToken(PL.widget_secret, { wheel_id: wheel.id, viewer_id: 'viewer-demo' });
  const ws = new WebSocket(`ws://localhost:${config.port}/v1/ws?wheel=${wheel.id}&token=${token}`);
  ws.on('message', (d) => console.log(`   [ws] ${d}`));
  await new Promise((r) => ws.on('open', r));

  console.log('3. Зритель крутит (запрос → платформа списывает и подтверждает сумму → розыгрыш)…');
  const spin = (await call('POST', '/v1/spins', { wheel_id: wheel.id, viewer_id: 'viewer-demo', client_seed: 'demo-client-seed' })).body;
  console.log(`   spin ${spin.id}: ${spin.status}, цена ${spin.price}, commit сида ${spin.server_seed_hash.slice(0, 16)}…`);
  await new Promise((r) => setTimeout(r, 600)); // мок платформы сам списывает и вызывает commit

  const done = (await call('GET', `/v1/spins/${spin.id}`)).body;
  console.log(`   результат: «${done.result.item_name}» (${done.result.item_price} ток.), оплачено ${done.paid_price}, roll ${done.result.roll_ppm}`);

  console.log('4. Независимая проверка честности…');
  const f = (await call('GET', `/v1/spins/${spin.id}/fairness`)).body;
  const v = fair.verify({
    serverSeed: f.server_seed, serverSeedHash: f.server_seed_hash, clientSeed: f.client_seed,
    nonce: f.nonce, rollPpm: f.roll_ppm, ppms: f.items.map((i) => i.ppm), itemIndex: done.result.item_index,
  });
  console.log(`   verify: ${JSON.stringify(v)}`);

  console.log('5. Очередь модели…');
  const q = (await call('GET', '/v1/models/model-demo/queue')).body;
  console.log(`   призов в очереди: ${q.items.length}, первый: «${q.items[0].item_name}»`);
  await call('POST', `/v1/queue/${q.items[0].id}/complete`);
  console.log('   приз отмечен выполненным');

  ws.close(); app.stop(); mock.server.close();
  console.log('\nГотово: полный цикл прошёл.');
}

main().catch((e) => { console.error(e); process.exit(1); });
