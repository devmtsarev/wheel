// Правило допуска и динамическая цена (документ: «Очередь модели и динамика эфира»).
// Вращение не продаётся, если версия не активна, очередь полна или до конца эфира
// не хватает времени на очередь + худший приз + буфер. Отклонённых призов нет по построению.
'use strict';

function admissionCheck(store, wheel, now = Date.now()) {
  if (!wheel || wheel.status !== 'active') return { ok: false, reason: 'wheel_inactive', retry_after_s: null };
  const modelId = wheel.model_id;
  const stream = store.streamOf(modelId);
  const pending = store.pendingQueue(modelId);
  const limit = stream.queue_limit ?? 5;
  if (pending.length >= limit) return { ok: false, reason: 'queue_full', retry_after_s: 60 };
  if (stream.live && stream.ends_at) {
    const leftS = (new Date(stream.ends_at).getTime() - now) / 1000;
    const queueS = pending.reduce((s, q) => s + (q.duration_s || 60), 0);
    const worstS = Math.max(...wheel.items.map((it) => it.duration_s || 60));
    const bufferS = stream.buffer_s ?? 60;
    if (leftS < queueS + worstS + bufferS) return { ok: false, reason: 'stream_ending', retry_after_s: null };
  }
  return { ok: true };
}

// Шаг динамической цены между вращениями: вверх при длинной очереди, вниз при пустой,
// не чаще одного шага за min_step_interval_s. Вероятности не трогаются никогда.
function dynamicPrice(store, wheel, now = Date.now()) {
  const cfg = wheel.dynamic_price;
  const steps = (cfg && cfg.enabled && cfg.steps && cfg.steps.length)
    ? cfg.steps : wheel.prices.map((p) => p.price).filter((p) => p != null);
  const sorted = [...new Set(steps)].sort((a, b) => a - b);
  if (!cfg || !cfg.enabled || sorted.length < 2) return wheel.current_price;

  const last = wheel._last_price_step_at || 0;
  if (now - last < (cfg.min_step_interval_s ?? 300) * 1000) return wheel.current_price;

  const stream = store.streamOf(wheel.model_id);
  const fill = store.pendingQueue(wheel.model_id).length / (stream.queue_limit ?? 5);
  const i = sorted.indexOf(wheel.current_price);
  let next = i;
  if (fill >= (cfg.up_when_queue_above ?? 0.6) && i < sorted.length - 1) next = i + 1;
  else if (fill <= (cfg.down_when_queue_below ?? 0.2) && i > 0) next = i - 1;
  if (next !== i) {
    wheel.current_price = sorted[next];
    wheel._last_price_step_at = now;
    store.audit('price.step', { wheel_id: wheel.id, price: wheel.current_price, fill });
    return wheel.current_price;
  }
  return null; // без изменений
}

module.exports = { admissionCheck, dynamicPrice };
