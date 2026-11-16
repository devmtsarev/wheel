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
    const n0 = normalize(p.items), z = p.z > 0 ? Math.min(p.z, 0.99) : 0;
    // пустой сектор: пункт с ценой 0 и шансом z, остальные шансы сжимаются в (1 − z)
    const P = z > 0 ? n0.P.concat(0) : n0.P, Q = z > 0 ? n0.Q.map((q) => q * (1 - z)).concat(z) : n0.Q;
    const key = P.join(',') + '|' + Q.map((q) => q.toFixed(9)).join(',');
    if (key !== cache.key) { cache.tails = buildTails(P, Q); cache.key = key; }
    const s = stats(P, Q), tails = cache.tails;
    return { P, Q, z, tails, EV: s.EV, sd: s.sd, CV: s.CV, maxP: s.maxP,
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
  // «Расчёт цены для любой модели»: S(k) = min(S_max, max(S_min, round(k·EV)))
  // b — результат base(); возвращает цену, границы и то, какая граница сработала
  // kmax — потолок цены в долях EV: 1 значит «не дороже меню»; больше 1 — маржа поверх меню-стоимости
  function priceForK(b, k, kmax) {
    const cap = kmax > 0 ? kmax : 1;
    const lo = Math.ceil(Math.max(b.bMenu, b.bAvg, b.bRisk) - EPS), hi = Math.floor(Math.min(cap * b.EV, b.Sw) + EPS);
    const raw = Math.round(k * b.EV), feasible = lo <= hi;
    const S = feasible ? Math.min(hi, Math.max(lo, raw)) : NaN;
    const floorBy = b.bRisk >= b.bAvg - EPS && b.bRisk >= b.bMenu - EPS ? 'risk' : b.bAvg >= b.bMenu ? 'avg' : 'menu';
    return { S, raw, lo, hi, feasible, floorBy, bound: !feasible ? 'none' : raw < lo ? 'min' : raw > hi ? 'max' : '', kEff: S / b.EV };
  }
  // «Валидатор колеса»: правила, которые проверяются по меню и шансам.
  // Роль пункта задаётся полем role ('consolation' | 'jackpot'); без него
  // утешительным считается самый дешёвый пункт, джекпотом самый дорогой.
  const LIMITS = { consolationMin: 0.20, jackpotShareMax: 0.25, cvMax: 2.0, emptyMax: 0, kMax: 1 };
  function validate(items, b, lim) {
    const L = Object.assign({}, LIMITS, lim), its = items.filter((i) => i.p >= 1 && i.w > 0);
    const W = its.reduce((s, i) => s + i.w, 0) || 1, ps = its.map((i) => Math.round(i.p));
    const pMin = Math.min(...ps), pMax = Math.max(...ps);
    const hasC = its.some((i) => i.role === 'consolation'), hasJ = its.some((i) => i.role === 'jackpot');
    let consolation = 0, jackpot = 0;
    const live = 1 - (b.z || 0); // доля вращений с призом; шансы пунктов считаются с учётом пустого сектора
    its.forEach((i, j) => {
      if (hasC ? i.role === 'consolation' : ps[j] === pMin) consolation += live * i.w / W;
      if (hasJ ? i.role === 'jackpot' : ps[j] === pMax) jackpot += live * ps[j] * i.w / W;
    });
    const jackpotShare = jackpot / b.EV, errors = [];
    if (consolation < L.consolationMin - EPS) errors.push('consolation');
    if (jackpotShare > L.jackpotShareMax + EPS) errors.push('jackpot');
    if (b.CV > L.cvMax + EPS) errors.push('cv');
    if ((b.z || 0) > L.emptyMax + EPS) errors.push('empty');
    if (!priceForK(b, 1, L.kMax).feasible) errors.push('price');
    return { ok: errors.length === 0, consolation, jackpotShare, cv: b.CV, empty: b.z || 0, errors };
  }
  // ---------- «Политика шансов»: шансы из цен ----------
  // q_i ∝ C_i^(−γ). γ = 0 — равные шансы; γ = 1 — шанс обратно пропорционален цене
  // (равный вклад пунктов в EV); γ > 1 — дорогие пункты ещё реже. Возвращает веса с суммой 1.
  function chancePolicy(prices, gamma) {
    const w = prices.map((c) => Math.pow(c, -gamma)), W = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / W);
  }
  // меню для base()/validate(): цены + политика шансов (веса в миллионных долях)
  const policyItems = (prices, gamma) => chancePolicy(prices, gamma).map((q, i) => ({ p: prices[i], w: q * 1e6 }));

  // ---------- «Маржа поверх себестоимости» ----------
  // Себестоимость пункта μ_i·C_i, маржа m_i поверх неё. Цена вращения с гарантированной в среднем
  // маржой: S = Σ q_i·μ_i·C_i·(1 + m_i). Пустой сектор (цена 0) затрат не несёт.
  // mu и margin — число (одно на всё меню) или массив по пунктам в порядке P.
  const at = (v, i) => (Array.isArray(v) ? v[i] : v);
  function marginPrice(P, Q, mu, margin) {
    let cost = 0, S = 0, EV = 0;
    P.forEach((p, i) => { const c = Q[i] * at(mu, i) * p; cost += c; S += c * (1 + at(margin, i)); EV += Q[i] * p; });
    return { cost, S, EV, k: S / EV, margin: S / cost - 1, muAvg: cost / EV };
  }
  // при одном μ и одной марже на всё меню связь прямая: k = μ·(1 + m), m = k/μ − 1
  const kOfMargin = (mu, m) => mu * (1 + m);
  const marginOfK = (mu, k) => k / mu - 1;
  // Подбор γ под целевую лояльность k при марже по пунктам: k(γ) = Σ q_i r_i / Σ q_i C_i,
  // где r_i = μ_i C_i (1 + m_i). Возвращает null, если цель недостижима на [gLo, gHi].
  function gammaForK(prices, mu, margin, kTarget, gLo, gHi) {
    const f = (g) => marginPrice(prices, chancePolicy(prices, g), mu, margin).k - kTarget;
    let a = gLo == null ? 0 : gLo, b = gHi == null ? 3 : gHi, fa = f(a), fb = f(b);
    if (Math.abs(fa) < 1e-9) return a; if (Math.abs(fb) < 1e-9) return b;
    if (fa * fb > 0) return null;
    for (let i = 0; i < 60; i++) { const m = (a + b) / 2, fm = f(m); if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; } }
    return (a + b) / 2;
  }
  // «Риск серии» при себестоимости по пунктам: распределение суммы затрат (в десятых долях токена)
  function costTails(P, Q, mu) { return buildTails(P.map((p, i) => Math.round(at(mu, i) * p * 10)), Q); }
  const lossProbCost = (tails, S, N) => lossProb(tails, S, N, 0.1); // убыток: N·S < Σ затрат

  // ---------- «Динамическая цена по кривой спроса» ----------
  // Оценка спроса по наблюдениям [{S, rate}] (цена, вращений в час): ln rate = a − ε·ln S
  function fitDemand(obs) {
    const pts = obs.filter((o) => o.S > 0 && o.rate > 0);
    if (new Set(pts.map((o) => o.S)).size < 2) return null; // одна цена наклон не определяет
    const x = pts.map((o) => Math.log(o.S)), y = pts.map((o) => Math.log(o.rate)), n = pts.length;
    const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
    const sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0), sxy = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0);
    const eps = -sxy / sxx;
    return { eps, a: my + eps * mx, n };
  }
  const demandAt = (fit, S) => Math.exp(fit.a) * Math.pow(S, -fit.eps);
  // предложение: сколько вращений в час модель успевает исполнить; share — доля эфира под призы
  const capacityPerHour = (Q, durations, share) => (share == null ? 1 : share) * 3600 / Q.reduce((s, q, i) => s + q * (durations[i] || 0), 0);
  // цена, при которой спрос равен предложению (Infinity/0, если спрос от цены не зависит)
  function clearingPrice(fit, capacity) {
    if (!fit || !(fit.eps > 0)) return fit && demandAt(fit, 1) > capacity ? Infinity : 0;
    return Math.pow(Math.exp(fit.a) / capacity, 1 / fit.eps);
  }
  // один шаг динамической цены: к цене равновесия, но только по объявленным ступеням
  // и только внутри коридора [lo, hi]; за вызов — не больше одной ступени
  function dynamicStep(o) {
    const steps = o.steps.filter((s) => s >= o.lo && s <= o.hi).sort((a, b) => a - b);
    if (!steps.length) return o.current;
    const target = Math.min(o.hi, Math.max(o.lo, clearingPrice(o.fit, o.capacity)));
    let i = steps.indexOf(o.current);
    if (i < 0) i = steps.reduce((bi, s, j) => (Math.abs(s - o.current) < Math.abs(steps[bi] - o.current) ? j : bi), 0);
    // гистерезис: вверх — когда равновесная цена дошла до следующей ступени, вниз — когда опустилась до предыдущей
    if (i < steps.length - 1 && target >= steps[i + 1]) return steps[i + 1];
    if (i > 0 && target <= steps[i - 1]) return steps[i - 1];
    return steps[i];
  }
  // полный расчёт. Доли передаются числами от 0 до 1: alpha, f, wmin
  function evaluate(p) {
    const b = base(p), e = { sigma: p.sigma, f: p.f, rho: p.rho, c0: p.c0, phi: p.phi, eps: p.eps, load: p.load };
    return Object.assign({}, b, solve(b, e), { econ: e });
  }

  return { SERIES, normalize, stats, buildTails, lossProb, riskFloor, avgFloor, menuGuard, winChance, winCeiling,
    cannibalization, breakEvenK, roiFloorK, optimumK, volume, capacityPrice, gain, roi, base, solve, evaluate, priceForK, validate, LIMITS,
    chancePolicy, policyItems, marginPrice, kOfMargin, marginOfK, gammaForK, costTails, lossProbCost,
    fitDemand, demandAt, capacityPerHour, clearingPrice, dynamicStep };
});
