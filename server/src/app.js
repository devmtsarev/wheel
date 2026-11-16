// HTTP API по api/openapi.yaml. Деньги не хранятся: списание — через вебхуки charge.* платформе.
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

const { createStore } = require('./store.js');
const { createWebhooks } = require('./webhooks.js');
const { verifySignature, verifyWidgetToken } = require('./sign.js');
const { newServerSeed, rollPpm, pickIndex, contentHash } = require('./fair.js');
const { normalizeItems, quote, DEFAULT_K, DEFAULT_PARAMS } = require('./pricing.js');
const { admissionCheck, dynamicPrice } = require('./admission.js');

const PRICE_VALID_FOR_S = 30;
const RESERVE_TTL_S = 60;

const FAIR_ALGORITHM =
  'HMAC-SHA256(server_seed, client_seed + ":" + nonce) -> первые непревышающие 4 байта по модулю 1000000 ' +
  '(отбор без смещения; при отклонении всех четвёрок байт сообщение расширяется ":counter"). ' +
  'Число попадает в интервал пункта по кумулятивным ppm. Проверка: SHA-256(server_seed) == server_seed_hash.';

function createApp(config) {
  const store = createStore();
  const hooks = new Map(); // platform_id → webhooks
  for (const [key, pl] of Object.entries(config.platforms)) {
    pl.key = key;
    hooks.set(pl.id, createWebhooks(pl, { transport: config.transport, log: config.log || (() => {}) }));
  }

  // ---------- WebSocket ----------
  const rooms = new Map(); // wheel_id → Set<ws>
  const wss = new WebSocketServer({ noServer: true });
  function broadcast(wheelId, msg) {
    const set = rooms.get(wheelId);
    if (!set) return;
    const s = JSON.stringify(msg);
    for (const ws of set) if (ws.readyState === 1) ws.send(s);
  }

  // ---------- хелперы ----------
  const err = (res, status, code, message, extra = {}) => {
    send(res, status, { code, message, request_id: res.req._rid, ...extra });
  };
  const send = (res, status, body) => {
    const s = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
    res.end(s);
  };

  function platformByKey(auth) {
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return config.platforms[auth.slice(7)] || null;
  }

  function widgetAuth(req, platformless) {
    // widget_token (JWT HS256 секретом платформы) в Authorization: Bearer
    const token = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    if (!token || !token.includes('.')) return null;
    for (const pl of Object.values(config.platforms)) {
      const payload = verifyWidgetToken(pl.widget_secret, token);
      if (payload) return { platform: pl, widget: payload };
    }
    return null;
  }

  function spinView(spin) {
    const out = { ...spin };
    delete out._server_seed;
    out.server_seed = spin.status === 'committed' ? spin._server_seed : null;
    return out;
  }

  function wheelView(w) {
    const out = { ...w };
    delete out._last_price_step_at;
    return out;
  }

  // ---------- операции ----------
  function createWheel(pl, body) {
    const q = quote(body.items, body.price_k || DEFAULT_K, body.params || {});
    if (!q.validator.ok) {
      return { status: 422, body: { code: 'validation_failed', message: 'колесо отклонено валидатором', violations: q.validator.violations } };
    }
    const items = normalizeItems(body.items);
    const wheel = {
      id: store.id('whl'), platform_id: pl.id, model_id: body.model_id, status: 'active',
      items, stats: q.stats, bounds: q.bounds, prices: q.prices,
      current_price: q.prices[0].price,
      dynamic_price: { enabled: false, ...body.dynamic_price },
      params: q.params, compliance_ack: !!body.compliance_ack,
      content_hash: contentHash(items), created_at: new Date().toISOString(),
    };
    const prevId = store.activeByModel.get(wheel.model_id);
    if (prevId && store.wheels.has(prevId)) store.wheels.get(prevId).status = 'retired';
    store.wheels.set(wheel.id, wheel);
    store.activeByModel.set(wheel.model_id, wheel.id);
    store.audit('wheel.created', { wheel_id: wheel.id, model_id: wheel.model_id, content_hash: wheel.content_hash });
    return { status: 201, body: wheelView(wheel) };
  }

  async function createSpin(pl, body, widget) {
    const wheel = store.wheels.get(body.wheel_id);
    if (!wheel || wheel.platform_id !== pl.id) return { status: 404, body: { code: 'not_found', message: 'нет такой версии колеса' } };
    if (widget && widget.wheel_id !== wheel.id) return { status: 403, body: { code: 'forbidden', message: 'токен выдан на другое колесо' } };
    const viewerId = widget ? widget.viewer_id : body.viewer_id;

    const adm = admissionCheck(store, wheel);
    if (!adm.ok) return { status: 409, body: { code: adm.reason, message: 'вращение сейчас не продаётся', reason: adm.reason, retry_after_s: adm.retry_after_s } };

    const price = wheel.current_price;
    if (body.shown_price != null && body.shown_price !== price) {
      return { status: 409, body: { code: 'price_changed', message: `цена изменилась: сейчас ${price}`, price } };
    }

    // акция: paid_price из глубины скидки; фриспин — 0; не ниже S_min (кроме фриспина)
    let promo = null, paid = price;
    if (body.promo_code) {
      const pid = store.promosByCode.get(body.promo_code);
      promo = pid ? store.promos.get(pid) : null;
      const now = Date.now();
      const inWindow = promo && (!promo.starts_at || now >= +new Date(promo.starts_at)) && (!promo.ends_at || now <= +new Date(promo.ends_at));
      if (!promo || !promo.active || !inWindow || promo.used_spins >= promo.budget_spins || promo.model_id !== wheel.model_id) {
        return { status: 409, body: { code: 'promo_invalid', message: 'акция не действует' } };
      }
      paid = promo.kind === 'freespin' ? 0 : Math.round(price * (1 - promo.discount));
      if (promo.kind !== 'freespin' && paid < wheel.bounds.s_min) {
        return { status: 409, body: { code: 'promo_invalid', message: `цена со скидкой ${paid} ниже S_min ${wheel.bounds.s_min}` } };
      }
    }

    const { seed, hash } = newServerSeed();
    const nonce = [...store.spins.values()].filter((s) => s.viewer_id === viewerId && s.wheel_id === wheel.id).length;
    const spin = {
      id: store.id('spn'), wheel_id: wheel.id, model_id: wheel.model_id, viewer_id: viewerId,
      status: 'reserved', price, paid_price: paid, promo_id: promo ? promo.id : null,
      reserve_expires_at: new Date(Date.now() + RESERVE_TTL_S * 1000).toISOString(),
      server_seed_hash: hash, _server_seed: seed,
      client_seed: body.client_seed, nonce,
      content_hash: wheel.content_hash,
      created_at: new Date().toISOString(), committed_at: null, result: null,
    };

    const wh = hooks.get(pl.id);
    const ok = await wh.sendReserve(wh.newEvent('charge.reserve', {
      spin_id: spin.id, model_id: spin.model_id, viewer_id: viewerId, amount: paid, promo_id: spin.promo_id,
    }));
    if (!ok) return { status: 502, body: { code: 'reserve_failed', message: 'платформа не подтвердила резерв' } };

    if (promo) promo.used_spins += 1;
    store.spins.set(spin.id, spin);
    store.audit('spin.reserved', { spin_id: spin.id, wheel_id: wheel.id, price, paid });
    broadcast(wheel.id, { type: 'spin.created', spin_id: spin.id, viewer_id: viewerId });
    return { status: 201, body: spinView(spin) };
  }

  function commitSpin(pl, spin) {
    if (spin.status === 'committed') return { status: 200, body: spinView(spin) }; // идемпотентно по смыслу
    if (spin.status !== 'reserved') return { status: 409, body: { code: 'spin_not_reserved', message: `статус ${spin.status}` } };
    const wheel = store.wheels.get(spin.wheel_id);

    const roll = rollPpm(spin._server_seed, spin.client_seed, spin.nonce);
    const idx = pickIndex(wheel.items.map((i) => i.ppm), roll);
    const item = wheel.items[idx];
    const queueItem = {
      id: store.id('qit'), spin_id: spin.id, viewer_id: spin.viewer_id,
      item_name: item.name, item_price: item.price, duration_s: item.duration_s,
      status: 'pending', created_at: new Date().toISOString(), done_at: null,
    };
    store.queueOf(spin.model_id).push(queueItem);
    store.queueItems.set(queueItem.id, { model_id: spin.model_id, item: queueItem });

    spin.status = 'committed';
    spin.committed_at = new Date().toISOString();
    spin.result = { item_index: idx, item_name: item.name, item_price: item.price, roll_ppm: roll, queue_item_id: queueItem.id };
    store.audit('spin.committed', { spin_id: spin.id, roll_ppm: roll, item: item.name });

    const wh = hooks.get(pl.id);
    wh.deliver(wh.newEvent('charge.commit', { spin_id: spin.id, model_id: spin.model_id, viewer_id: spin.viewer_id, amount: spin.paid_price, promo_id: spin.promo_id }));
    wh.deliver(wh.newEvent('spin.result', {
      spin_id: spin.id, model_id: spin.model_id, viewer_id: spin.viewer_id,
      result: { item_name: item.name, item_price: item.price, queue_item_id: queueItem.id },
      fairness: { server_seed_hash: spin.server_seed_hash, roll_ppm: roll },
    }));

    broadcast(wheel.id, { type: 'spin.result', spin_id: spin.id, item_name: item.name, item_price: item.price, roll_ppm: roll, server_seed_hash: spin.server_seed_hash });
    notifyQueue(wheel);
    return { status: 200, body: spinView(spin) };
  }

  function cancelSpin(pl, spin, reason = 'cancelled') {
    if (spin.status !== 'reserved') return { status: 409, body: { code: 'spin_not_reserved', message: `статус ${spin.status}` } };
    spin.status = reason;
    const wh = hooks.get(pl.id);
    wh.deliver(wh.newEvent('charge.release', { spin_id: spin.id, model_id: spin.model_id, viewer_id: spin.viewer_id, amount: spin.paid_price, promo_id: spin.promo_id }));
    if (spin.promo_id && store.promos.has(spin.promo_id)) store.promos.get(spin.promo_id).used_spins -= 1;
    store.audit('spin.' + reason, { spin_id: spin.id });
    return { status: 200, body: spinView(spin) };
  }

  function notifyQueue(wheel) {
    const stream = store.streamOf(wheel.model_id);
    const pending = store.pendingQueue(wheel.model_id);
    broadcast(wheel.id, { type: 'queue.updated', length: pending.length, limit: stream.queue_limit ?? 5 });
    const adm = admissionCheck(store, wheel);
    const paused = !adm.ok && (adm.reason === 'queue_full' || adm.reason === 'stream_ending');
    if (paused !== !!wheel._paused) {
      wheel._paused = paused;
      broadcast(wheel.id, paused ? { type: 'wheel.paused', reason: adm.reason } : { type: 'wheel.resumed' });
    }
    const np = dynamicPrice(store, wheel);
    if (np != null && np !== undefined && np !== null) {
      broadcast(wheel.id, { type: 'price.changed', price: wheel.current_price, valid_for_s: PRICE_VALID_FOR_S });
    }
  }

  // просроченные резервы: каждые 5 секунд
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const spin of store.spins.values()) {
      if (spin.status === 'reserved' && +new Date(spin.reserve_expires_at) < now) {
        const pl = Object.values(config.platforms).find((p) => p.id === store.wheels.get(spin.wheel_id).platform_id);
        cancelSpin(pl, spin, 'expired');
      }
    }
    store.idemSweep();
  }, 5000);
  if (sweeper.unref) sweeper.unref();

  // ---------- маршрутизация ----------
  const server = http.createServer((req, res) => {
    req._rid = 'req_' + crypto.randomBytes(8).toString('hex');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      let json = {};
      if (body) { try { json = JSON.parse(body); } catch { return err(res, 400, 'bad_json', 'тело не JSON'); } }
      route(req, res, body, json).catch((e) => {
        (config.log || console.error)('unhandled', e);
        err(res, 500, 'internal', 'внутренняя ошибка');
      });
    });
  });

  async function route(req, res, rawBody, body) {
    const u = new URL(req.url, 'http://x');
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const m = (re) => path.match(re);
    const method = req.method;

    // --- аутентификация: ключ платформы (с подписью) или widget_token ---
    const pl = platformByKey(req.headers.authorization);
    let widget = null;
    if (pl) {
      if (config.require_signature !== false) {
        const v = verifySignature(pl.api_secret, {
          timestamp: req.headers['x-wheel-timestamp'], signature: req.headers['x-wheel-signature'],
          method, path, body: rawBody,
        });
        if (!v.ok) return err(res, 401, v.code, 'подпись не прошла проверку');
      }
    } else {
      const wa = widgetAuth(req);
      if (wa) widget = wa;
      else return err(res, 401, 'unauthorized', 'нужен лицензионный ключ или widget_token');
    }
    const platform = pl || widget.platform;
    const w = widget ? widget.widget : null;

    // виджету доступно только своё
    const widgetAllowed = () =>
      (method === 'GET' && m(/^\/v1\/wheels\/[^/]+\/public$/)) ||
      (method === 'POST' && path === '/v1/spins') ||
      (method === 'GET' && m(/^\/v1\/spins\/[^/]+(\/fairness)?$/));
    if (w && !widgetAllowed()) return err(res, 403, 'forbidden', 'widget_token не даёт доступ к этому методу');

    // --- идемпотентность POST ---
    if (method === 'POST' && pl) {
      const key = req.headers['idempotency-key'];
      if (!key) return err(res, 400, 'idempotency_required', 'нет Idempotency-Key');
      const prev = store.idemGet(platform.id, key);
      if (prev) return send(res, prev.status, prev.body);
      res._idemSave = (status, out) => store.idemPut(platform.id, key, status, out);
    }

    const reply = ({ status, body: out }) => {
      if (res._idemSave) res._idemSave(status, out);
      send(res, status, out);
    };

    let g;
    if (method === 'POST' && path === '/v1/wheels') return reply(createWheel(platform, body));
    if (method === 'GET' && path === '/v1/wheels') {
      const items = [...store.wheels.values()].filter((x) =>
        x.platform_id === platform.id && x.model_id === u.searchParams.get('model_id') &&
        ((u.searchParams.get('status') || 'all') === 'all' || x.status === u.searchParams.get('status')));
      return send(res, 200, { items: items.map(wheelView), next_cursor: null });
    }
    if ((g = m(/^\/v1\/wheels\/([^/]+)\/public$/)) && method === 'GET') {
      const wheel = store.wheels.get(g[1]);
      if (!wheel || wheel.platform_id !== platform.id) return err(res, 404, 'not_found', 'нет такой версии');
      const adm = admissionCheck(store, wheel);
      const k = wheel.current_price && wheel.stats.ev ? wheel.current_price / wheel.stats.ev : 1;
      const win = wheel.items.reduce((s, it) => s + (it.price >= wheel.current_price ? it.ppm : 0), 0);
      return send(res, 200, {
        wheel_id: wheel.id,
        items: wheel.items.map((it) => ({ name: it.name, price: it.price, ppm: it.ppm })),
        current_price: wheel.current_price, price_valid_for_s: PRICE_VALID_FOR_S,
        win_chance_ppm: win, content_hash: wheel.content_hash, paused: !adm.ok,
      });
    }
    if ((g = m(/^\/v1\/wheels\/([^/]+)$/))) {
      const wheel = store.wheels.get(g[1]);
      if (!wheel || wheel.platform_id !== platform.id) return err(res, 404, 'not_found', 'нет такой версии');
      if (method === 'GET') return send(res, 200, wheelView(wheel));
      if (method === 'PATCH') {
        if (body.status === 'active') { const prev = store.activeByModel.get(wheel.model_id); if (prev && prev !== wheel.id && store.wheels.has(prev)) store.wheels.get(prev).status = 'retired'; store.activeByModel.set(wheel.model_id, wheel.id); wheel.status = 'active'; }
        if (body.status === 'retired') wheel.status = 'retired';
        if (body.dynamic_price) wheel.dynamic_price = { ...wheel.dynamic_price, ...body.dynamic_price };
        return send(res, 200, wheelView(wheel));
      }
    }
    if (method === 'POST' && path === '/v1/pricing/quote') {
      return send(res, 200, quote(body.items, body.price_k || DEFAULT_K, body.params || {}));
    }
    if (method === 'POST' && path === '/v1/spins') return reply(await createSpin(platform, body, w));
    if (method === 'GET' && path === '/v1/spins') {
      let items = [...store.spins.values()].filter((s) => store.wheels.get(s.wheel_id)?.platform_id === platform.id);
      for (const [q, f] of [['model_id', 'model_id'], ['wheel_id', 'wheel_id'], ['viewer_id', 'viewer_id'], ['status', 'status']]) {
        const vq = u.searchParams.get(q); if (vq) items = items.filter((s) => s[f] === vq);
      }
      return send(res, 200, { items: items.map(spinView), next_cursor: null });
    }
    if ((g = m(/^\/v1\/spins\/([^/]+)(\/(commit|cancel|fairness))?$/))) {
      const spin = store.spins.get(g[1]);
      if (!spin || store.wheels.get(spin.wheel_id)?.platform_id !== platform.id) return err(res, 404, 'not_found', 'нет такого вращения');
      if (w && spin.viewer_id !== w.viewer_id) return err(res, 403, 'forbidden', 'чужое вращение');
      const sub = g[3];
      if (!sub && method === 'GET') return send(res, 200, spinView(spin));
      if (sub === 'fairness' && method === 'GET') {
        const wheel = store.wheels.get(spin.wheel_id);
        let from = 0;
        return send(res, 200, {
          spin_id: spin.id, server_seed_hash: spin.server_seed_hash,
          server_seed: spin.status === 'committed' ? spin._server_seed : null,
          client_seed: spin.client_seed, nonce: spin.nonce,
          roll_ppm: spin.result ? spin.result.roll_ppm : null,
          content_hash: spin.content_hash,
          items: wheel.items.map((it) => ({ name: it.name, ppm: it.ppm, ppm_from: (from += it.ppm) - it.ppm })),
          algorithm: FAIR_ALGORITHM,
        });
      }
      if (sub === 'commit' && method === 'POST' && pl) return reply(commitSpin(platform, spin));
      if (sub === 'cancel' && method === 'POST' && pl) return reply(cancelSpin(platform, spin));
    }
    if ((g = m(/^\/v1\/models\/([^/]+)\/stream$/)) && method === 'PUT') {
      const prev = store.streamOf(g[1]);
      const st = { ...prev, ...body };
      store.streams.set(g[1], st);
      const wid = store.activeByModel.get(g[1]);
      if (wid) notifyQueue(store.wheels.get(wid));
      return send(res, 200, st);
    }
    if ((g = m(/^\/v1\/models\/([^/]+)\/queue$/)) && method === 'GET') {
      const stream = store.streamOf(g[1]);
      const wid = store.activeByModel.get(g[1]);
      const wheel = wid ? store.wheels.get(wid) : null;
      const adm = wheel ? admissionCheck(store, wheel) : { ok: false };
      return send(res, 200, {
        model_id: g[1], items: store.queueOf(g[1]),
        paused: !adm.ok, current_price: wheel ? wheel.current_price : null,
        time_left_s: stream.live && stream.ends_at ? Math.max(0, Math.round((+new Date(stream.ends_at) - Date.now()) / 1000)) : null,
      });
    }
    if ((g = m(/^\/v1\/queue\/([^/]+)\/complete$/)) && method === 'POST') {
      const rec = store.queueItems.get(g[1]);
      if (!rec) return err(res, 404, 'not_found', 'нет такого приза');
      if (rec.item.status !== 'done') {
        rec.item.status = 'done';
        rec.item.done_at = new Date().toISOString();
        store.audit('queue.done', { item_id: rec.item.id, spin_id: rec.item.spin_id });
        const wid = store.activeByModel.get(rec.model_id);
        if (wid) notifyQueue(store.wheels.get(wid));
      }
      return reply({ status: 200, body: rec.item });
    }
    if (method === 'POST' && path === '/v1/promos') {
      if (body.kind === 'coupon' && !body.code) return err(res, 422, 'validation_failed', 'для купона нужен code');
      const promo = {
        id: store.id('prm'), model_id: body.model_id, kind: body.kind,
        discount: body.kind === 'freespin' ? 1 : body.discount,
        budget_spins: body.budget_spins || 1, used_spins: 0, active: true,
        starts_at: body.starts_at || null, ends_at: body.ends_at || null,
        code: body.code || store.id('promo'),
      };
      if (promo.kind !== 'freespin' && !(promo.discount > 0 && promo.discount < 1)) return err(res, 422, 'validation_failed', 'discount должен быть в (0, 1)');
      store.promos.set(promo.id, promo);
      store.promosByCode.set(promo.code, promo.id);
      return reply({ status: 201, body: promo });
    }
    return err(res, 404, 'not_found', 'нет такого метода');
  }

  // ---------- WS upgrade ----------
  server.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/v1/ws') { socket.destroy(); return; }
    const wheelId = u.searchParams.get('wheel');
    const token = u.searchParams.get('token');
    const ok = Object.values(config.platforms).some((pl) => {
      const p = verifyWidgetToken(pl.widget_secret, token);
      return p && p.wheel_id === wheelId;
    });
    if (!ok || !store.wheels.has(wheelId)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!rooms.has(wheelId)) rooms.set(wheelId, new Set());
      rooms.get(wheelId).add(ws);
      ws.on('close', () => rooms.get(wheelId)?.delete(ws));
      ws.on('message', (d) => { if (String(d) === 'ping') ws.send('{"type":"pong"}'); });
    });
  });

  return {
    server, store, broadcast,
    stop() { clearInterval(sweeper); for (const h of hooks.values()) h.stop(); wss.close(); server.close(); },
  };
}

module.exports = { createApp, PRICE_VALID_FOR_S, RESERVE_TTL_S };
