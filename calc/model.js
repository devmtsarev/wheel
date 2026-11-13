/*
 * Модель цены вращения колеса призов. Единственный источник расчётов:
 * калькулятор, тесты и сервис цены используют эти функции.
 * Названия разделов в комментариях соответствуют разделам документа с моделью.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WheelModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EPS = 1e-9;
  // длины серий, для которых хранится распределение суммы призов
  const SERIES = [1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

  // Меню: пункты {p: цена по меню, w: вес} -> цены P и шансы Q (сумма 1)
  function normalize(items) {
    const its = items.filter((i) => i.p >= 1 && i.w > 0);
    const W = its.reduce((s, i) => s + i.w, 0) || 1;
    return { P: its.map((i) => Math.round(i.p)), Q: its.map((i) => i.w / W) };
  }
  // «Меню-пример и стоимость приза»: EV = Σ q_i p_i, σ_p, CV
  function stats(P, Q) {
    const EV = P.reduce((s, p, j) => s + p * Q[j], 0);
    const sd = Math.sqrt(Math.max(0, P.reduce((s, p, j) => s + p * p * Q[j], 0) - EV * EV));
    return { EV, sd, CV: sd / EV, maxP: Math.max(...P) };
  }
  // «Риск серии»: точное распределение суммы призов за N вращений (свёртка).
  // Возвращает для каждой длины серии хвостовые суммы: tail[N][x] = Pr(P_N >= x)
  function buildTails(P, Q) {
    const maxP = Math.max(...P), keep = new Set(SERIES), tails = {};
    let cur = new Float64Array(1); cur[0] = 1;
    for (let n = 1; n <= SERIES[SERIES.length - 1]; n++) {
      const nx = new Float64Array(cur.length + maxP);
      for (let j = 0; j < P.length; j++) {
        const p = P[j], q = Q[j]; if (!q) continue;
        for (let x = 0; x < cur.length; x++) { const c = cur[x]; if (c) nx[x + p] += c * q; }
      }
      cur = nx;
      if (keep.has(n)) {
        const t = new Float64Array(cur.length + 1); let acc = 0;
        for (let x = cur.length - 1; x >= 0; x--) { acc += cur[x]; t[x] = acc; }
        tails[n] = t;
      }
    }
    return tails;
  }
  // «Что считать убытком»: Pr(N·S < μ·P_N) = Pr(P_N > N·S/μ)
  function lossProb(tails, S, N, mu) {
    const t = tails[N]; if (!t) throw new Error('Нет распределения для серии длиной ' + N);
    const x = Math.floor(N * S / mu + EPS) + 1;
    return x >= t.length ? 0 : x <= 0 ? 1 : t[x];
  }
  // «Нижняя граница цены», риск серии: наименьшая S с Pr(убыток за N) <= α
  function riskFloor(tails, N, mu, alpha, maxP) {
    for (let S = 1; S <= maxP; S++) if (lossProb(tails, S, N, mu) <= alpha) return S;
    return maxP;
  }
  // «Нижняя граница цены», плюс в среднем: (μ + δ)·EV
  const avgFloor = (mu, delta, EV) => (mu + delta) * EV;
  // «Нижняя граница цены», защита меню: max q_i p_i
  const menuGuard = (P, Q) => Math.max(...P.map((p, j) => p * Q[j]));
  // «Задача оптимизации», шанс выигрыша: w(S) = Σ q_i по p_i >= S
  const winChance = (P, Q, S) => P.reduce((s, p, j) => s + (p >= S ? Q[j] : 0), 0);
  // наибольшая цена, при которой шанс выигрыша не ниже wmin (Infinity, если ограничения нет)
  function winCeiling(P, Q, wmin) {
    if (!(wmin > 0)) return Infinity;
    let best = 0; for (const p of P) if (winChance(P, Q, p) >= wmin - EPS && p > best) best = p;
    return best;
  }
  // «Каннибализация меню»: c(k) = c0 + φ/k
  const cannibalization = (c0, phi, EV, S) => Math.min(1, c0 + phi * EV / S);
  // «Границы и оптимум»: безубыточность k_be = σφ / (σ(1−c0) − f)
  function breakEvenK(e) { const a = e.sigma * (1 - e.c0) - e.f; return e.phi <= 0 ? 0 : a > 0 ? e.sigma * e.phi / a : Infinity; }
  // «Границы и оптимум»: граница по ROI k_ρ = σφ / (σ(1−c0) − ρf)
  function roiFloorK(e) { const d = e.sigma * (1 - e.c0) - e.rho * e.f; return e.phi <= 0 ? 0 : d > 0 ? e.sigma * e.phi / d : Infinity; }
  // «Границы и оптимум»: оптимум без ограничений k* = ε/(ε−1) · k_be при ε > 1
  function optimumK(e) { return e.eps > 1 ? e.eps / (e.eps - 1) * breakEvenK(e) : Infinity; }
  // спрос V(k) = k^(−ε) в долях V1, но не больше ёмкости модели (load = V1 / V_cap)
  const volume = (S, EV, eps, load) => Math.min(Math.pow(S / EV, -eps), 1 / (load || EPS));
  // «Очередь модели»: цена, при которой спрос равен ёмкости, k_cap = load^(1/ε)
  const capacityPrice = (EV, eps, load) => EV * Math.pow(load, 1 / eps);
  // «Границы и оптимум»: выгода платформы на 100 вращений при цене EV
  function gain(S, EV, e) { return 100 * volume(S, EV, e.eps, e.load) * (S * (e.sigma * (1 - e.c0) - e.f) - e.sigma * e.phi * EV); }
  // ROI платформы: прирост её дохода, делённый на плату вендору
  function roi(S, EV, e) { const k = S / EV; return e.f > 0 ? e.sigma * (k * (1 - e.c0) - e.phi) / (e.f * k) : Infinity; }

  const cache = { key: '', tails: null };
  // всё, что зависит только от меню, затрат и риска
  function base(p) {
    const { P, Q } = normalize(p.items);
    const key = P.join(',') + '|' + Q.map((q) => q.toFixed(9)).join(',');
    if (key !== cache.key) { cache.tails = buildTails(P, Q); cache.key = key; }
    const s = stats(P, Q), tails = cache.tails;
    return { P, Q, tails, EV: s.EV, sd: s.sd, CV: s.CV, maxP: s.maxP,
      bMenu: menuGuard(P, Q), bAvg: avgFloor(p.mu, p.delta, s.EV),
      bRisk: riskFloor(tails, p.Nh, p.mu, p.alpha, s.maxP), Sw: winCeiling(P, Q, p.wmin) };
  }
  // «Задача оптимизации»: коридор [S_lo, S_hi] и цена с наибольшей выгодой платформы в нём
  function solve(b, e) {
    const bRoi = roiFloorK(e) * b.EV;
    const lo0 = Math.ceil(Math.max(b.bMenu, b.bAvg, b.bRisk) - EPS);      // без требования к ROI
    const lo = Math.ceil(Math.max(lo0, bRoi) - EPS), hi = Math.floor(Math.min(b.EV, b.Sw) + EPS);
    const feasible = lo <= hi; let opt = NaN, optG = NaN;
    for (let S = feasible ? lo : lo0; S <= hi; S++) { const g = gain(S, b.EV, e); if (!(g <= optG + EPS)) { opt = S; optG = g; } }
    return { bRoi, lo, hi, lo0, feasible, opt, optG, capS: capacityPrice(b.EV, e.eps, e.load) };
  }
  // полный расчёт. Доли передаются числами от 0 до 1: alpha, f, wmin
  function evaluate(p) {
    const b = base(p), e = { sigma: p.sigma, f: p.f, rho: p.rho, c0: p.c0, phi: p.phi, eps: p.eps, load: p.load };
    return Object.assign({}, b, solve(b, e), { econ: e });
  }

  return { SERIES, normalize, stats, buildTails, lossProb, riskFloor, avgFloor, menuGuard, winChance, winCeiling,
    cannibalization, breakEvenK, roiFloorK, optimumK, volume, capacityPrice, gain, roi, base, solve, evaluate };
});
