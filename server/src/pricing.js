// Обёртка над calc/model.js — единственным источником расчётов цены.
// Здесь только перевод форматов API ↔ модель; формулы не дублируются.
'use strict';
const M = require('../../calc/model.js');
const { PPM } = require('./fair.js');

const DEFAULT_PARAMS = { mu: 0.4, delta: 0.1, alpha: 0.05, n_horizon: 30, w_min: 0 };
const DEFAULT_K = [1.0, 0.8];

// items API ({name, price, weight, role, duration_s}) → меню модели + ppm
function normalizeItems(items) {
  const weights = items.map((i) => i.weight);
  const W = weights.reduce((s, w) => s + w, 0);
  // целые ppm с суммой ровно 1e6: распределяем остаток по наибольшим дробным частям
  const raw = weights.map((w) => (w * PPM) / W);
  const ppm = raw.map(Math.floor);
  let rest = PPM - ppm.reduce((s, v) => s + v, 0);
  raw.map((v, i) => ({ frac: v - Math.floor(v), i }))
    .sort((a, b) => b.frac - a.frac)
    .slice(0, rest)
    .forEach(({ i }) => { ppm[i] += 1; });
  return items.map((it, i) => ({
    name: it.name, price: Math.round(it.price), ppm: ppm[i],
    role: it.role || 'regular', duration_s: it.duration_s ?? 60,
  }));
}

function quote(items, priceK = DEFAULT_K, params = {}) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const modelItems = items.map((it) => ({ p: it.price, w: it.weight, role: it.role === 'regular' ? undefined : it.role }));
  const b = M.base({ items: modelItems, mu: p.mu, delta: p.delta, alpha: p.alpha, Nh: p.n_horizon, wmin: p.w_min });
  const v = M.validate(modelItems, b);
  const first = M.priceForK(b, 1);
  const prices = priceK.map((k) => {
    const r = M.priceForK(b, k);
    return {
      k, price: Number.isFinite(r.S) ? r.S : null,
      clamped: r.bound || '',
      win_chance_ppm: Number.isFinite(r.S) ? Math.round(M.winChance(b.P, b.Q, r.S) * PPM) : null,
      loss_prob: Number.isFinite(r.S) ? M.lossProb(b.tails, r.S, p.n_horizon, p.mu) : null,
    };
  });
  return {
    stats: { ev: b.EV, sd: b.sd, cv: b.CV },
    bounds: { s_min: first.lo, s_max: first.hi, floor_by: first.floorBy },
    prices,
    validator: {
      ok: v.ok && first.feasible,
      violations: [
        ...v.errors.map((rule) => ({ rule, message: ruleMessage(rule, v) })),
        ...(first.feasible ? [] : [{ rule: 'price', message: `S_min ${first.lo} выше потолка ${first.hi}: цены не существует` }]),
      ],
    },
    params: p,
  };
}

function ruleMessage(rule, v) {
  switch (rule) {
    case 'consolation': return `утешительные пункты ${(v.consolation * 100).toFixed(1)}% < 20%`;
    case 'jackpot': return `джекпот ${(v.jackpotShare * 100).toFixed(1)}% EV > 25%`;
    case 'cv': return `CV ${v.cv.toFixed(2)} > 2.0`;
    case 'price': return 'S_min выше EV';
    default: return rule;
  }
}

module.exports = { DEFAULT_PARAMS, DEFAULT_K, normalizeItems, quote };
