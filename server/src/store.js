// Хранилище в памяти. Интерфейс намеренно плоский, чтобы заменить на БД без правки логики.
'use strict';
const crypto = require('node:crypto');

const id = (prefix) => `${prefix}_${crypto.randomBytes(10).toString('hex')}`;

function createStore() {
  const wheels = new Map();           // wheel_id → wheel
  const activeByModel = new Map();    // model_id → wheel_id
  const spins = new Map();            // spin_id → spin
  const queues = new Map();           // model_id → [queue item]
  const queueItems = new Map();       // item_id → {model_id, item}
  const streams = new Map();          // model_id → stream state
  const promos = new Map();           // promo_id → promo
  const promosByCode = new Map();     // code → promo_id
  const idem = new Map();             // `${platform}:${key}` → {at, status, body}
  const events = [];                  // аудит-журнал

  const audit = (type, data) => { events.push({ at: new Date().toISOString(), type, ...data }); };

  return {
    id, wheels, activeByModel, spins, queues, queueItems, streams, promos, promosByCode, events, audit,

    queueOf(modelId) {
      if (!queues.has(modelId)) queues.set(modelId, []);
      return queues.get(modelId);
    },
    pendingQueue(modelId) {
      return this.queueOf(modelId).filter((q) => q.status === 'pending');
    },
    streamOf(modelId) {
      return streams.get(modelId) || { live: false, queue_limit: 5, buffer_s: 60, started_at: null, ends_at: null };
    },

    idemGet(platformId, key) { return idem.get(`${platformId}:${key}`); },
    idemPut(platformId, key, status, body) {
      idem.set(`${platformId}:${key}`, { at: Date.now(), status, body });
    },
    idemSweep(maxAgeMs = 24 * 3600 * 1000) {
      const cut = Date.now() - maxAgeMs;
      for (const [k, v] of idem) if (v.at < cut) idem.delete(k);
    },
  };
}

module.exports = { createStore };
