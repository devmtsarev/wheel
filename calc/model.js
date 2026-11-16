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
  // maxN ограничивает длину серии (для кривых по γ, где нужна только одна длина)
  function buildTails(P, Q, maxN) {
    const maxP = Math.max(...P), keep = new Set(SERIES), tails = {};
    let cur = new Float64Array(1); cur[0] = 1;
    for (let n = 1; n <= (maxN || SERIES[SERIES.length - 1]); n++) {
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
    const lo = Math.ceil(Math.max(lo0, bRoi) - EPS), hi = Math.floor(Math.min((e.kmax > 0 ? e.kmax : 1) * b.EV, b.Sw) + EPS);
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
  // adj — необязательные поправки по пунктам a_i (1 — по правилу, меньше 1 — пункт «прижат»):
  // q_i = a_i·C_i^(−γ) / Σ_j a_j·C_j^(−γ). Деление на сумму и есть условие Σ q_i = 1.
  function chancePolicy(prices, gamma, adj) {
    const w = prices.map((c, i) => (adj ? adj[i] : 1) * Math.pow(c, -gamma)), W = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / W);
  }
  // какому γ ближе всего заданные шансы: наклон ln q по ln C (метод наименьших квадратов)
  function fitGamma(P, Q) {
    const pts = P.map((p, i) => [p, Q[i]]).filter(([p, q]) => p > 0 && q > 0);
    if (new Set(pts.map((x) => x[0])).size < 2) return NaN;
    const x = pts.map((v) => Math.log(v[0])), y = pts.map((v) => Math.log(v[1])), n = pts.length;
    const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
    return -x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0) / x.reduce((a, v) => a + (v - mx) ** 2, 0);
  }
  // кривые по γ для графиков «коридор цены» и «горб CV»: EV, CV и S_min при шансах из цен.
  // o: {z, mu, delta, alpha, Nh, floorAt} — floorAt: значения γ, где считать S_min (расчёт дорогой)
  function policyCurve(prices, gammas, o) {
    const z = o.z > 0 ? Math.min(o.z, 0.99) : 0, need = o.floorAt ? new Set(o.floorAt.map((g) => g.toFixed(3))) : null;
    return gammas.map((g) => {
      const q = chancePolicy(prices, g, o.adj), P = z > 0 ? prices.concat(0) : prices, Q = z > 0 ? q.map((v) => v * (1 - z)).concat(z) : q;
      const s = stats(P, Q), row = { g, EV: s.EV, CV: s.CV, qTop: Q[prices.indexOf(Math.max(...prices))] };
      if (!need || need.has(g.toFixed(3))) {
        const t = buildTails(P, Q, o.Nh);
        row.smin = Math.ceil(Math.max(riskFloor(t, o.Nh, o.mu, o.alpha, s.maxP), avgFloor(o.mu, o.delta, s.EV), menuGuard(P, Q)) - EPS);
      }
      return row;
    });
  }
  // меню для base()/validate(): цены + политика шансов (веса в миллионных долях)
  const policyItems = (prices, gamma) => chancePolicy(prices, gamma).map((q, i) => ({ p: prices[i], w: q * 1e6 }));

  // ---------- «Стартовая конфигурация колеса» ----------
  // Шансы для меню без ручной настройки: правило q ∝ C^(−γ), затем минимальные поправки a_i,
  // чтобы колесо прошло валидатор. Это точка старта для A/B-тестов, а не оптимум.
  // o: { gamma | targetPrice, k, z, limits, minTop } — если задана targetPrice (цена вращения в токенах),
  // γ подбирается так, чтобы round(k·EV) попала в неё; minTop — нижний предел шанса самого дорогого пункта.
  function shapeStats(prices, q, z) {
    const live = 1 - z, pMin = Math.min(...prices), pMax = Math.max(...prices);
    let EV = 0, m2 = 0, cons = 0, top = 0, qTop = 0;
    prices.forEach((p, i) => { const qi = live * q[i]; EV += qi * p; m2 += qi * p * p; if (p === pMin) cons += qi; if (p === pMax) { top += qi * p; qTop += qi; } });
    return { EV, CV: Math.sqrt(Math.max(0, m2 - EV * EV)) / EV, consolation: cons, jackpotShare: top / EV, qTop };
  }
  function repairChances(prices, gamma, z, L, minTop) {
    const adj = prices.map(() => 1), notes = [], order = prices.map((p, i) => i).sort((x, y) => prices[y] - prices[x]); // order[0] — самый дорогой пункт
    const pMin = Math.min(...prices), q = () => chancePolicy(prices, gamma, adj), st = () => shapeStats(prices, q(), z);
    // Keep a tiny margin inside the limits so normalization and URL round trips
    // cannot push a repaired distribution over a boundary through floating-point error.
    const bad = (s) => s.jackpotShare > L.jackpotShareMax - EPS || s.CV > L.cvMax - EPS;
    for (let round = 0; round < 6; round++) {
      let s = st(), changed = false;
      if (s.consolation < L.consolationMin - EPS) {                 // приподнять самый дешёвый пункт ровно до порога
        const w = chancePolicy(prices, gamma, adj), t = L.consolationMin / (1 - z);
        const wc = prices.reduce((a, p, i) => a + (p === pMin ? w[i] : 0), 0), f = t * (1 - wc) / ((1 - t) * wc);
        prices.forEach((p, i) => { if (p === pMin) adj[i] *= f; }); notes.push('consolation'); changed = true; s = st();
      }
      if (bad(s)) {                                                  // прижать самый дорогой пункт ровно до прохождения порогов
        const i = order[0], a0 = adj[i], qTopAt = (v) => { adj[i] = v; return shapeStats(prices, q(), z).qTop; };
        let lo = 1e-9;
        if (minTop > 0 && qTopAt(a0) > minTop) { let x = 1e-9, y = a0; for (let j = 0; j < 50; j++) { const m = (x + y) / 2; if (qTopAt(m) < minTop) x = m; else y = m; } lo = y; }
        else if (minTop > 0) lo = a0;                                // шанс уже не выше предела — прижимать нельзя
        adj[i] = lo;
        if (bad(st())) { notes.push('unfixable'); break; }           // даже на пределе пороги не проходят: менять нужно меню
        let hi = a0; for (let j = 0; j < 50; j++) { const m = (lo + hi) / 2; adj[i] = m; if (bad(st())) hi = m; else lo = m; }
        adj[i] = lo; notes.push('press'); changed = true;
      }
      if (!changed) break;
    }
    return { adj, q: q(), stats: st(), notes };
  }
  function suggestChances(prices, o) {
    o = o || {}; const z = o.z > 0 ? o.z : 0, L = Object.assign({}, LIMITS, o.limits), k = o.k > 0 ? o.k : 0.8;
    let gamma = o.gamma == null ? 0.5 : o.gamma, r;
    if (o.targetPrice > 0) {                                         // EV падает с γ: бисекция по γ под цену клика
      const f = (g) => k * repairChances(prices, g, z, L, o.minTop).stats.EV - o.targetPrice;
      let a = 0, b = 3;
      if (f(a) <= 0) gamma = a; else if (f(b) >= 0) gamma = b;
      else { for (let j = 0; j < 40; j++) { const m = (a + b) / 2; if (f(m) > 0) a = m; else b = m; } gamma = (a + b) / 2; }
    }
    r = repairChances(prices, gamma, z, L, o.minTop);
    const s = r.stats, ok = s.consolation >= L.consolationMin - 1e-6 && s.jackpotShare <= L.jackpotShareMax + 1e-6 && s.CV <= L.cvMax + 1e-6 && z <= L.emptyMax + EPS;
    return { gamma, adj: r.adj, q: r.q, items: r.q.map((x, i) => ({ p: prices[i], w: x * 1e6 })), z, k, EV: s.EV, CV: s.CV,
      consolation: s.consolation, jackpotShare: s.jackpotShare, qTop: s.qTop, price: Math.round(k * s.EV), ok, notes: r.notes };
  }
  // варианты для A/B-теста: сетка по k и γ вокруг стартовой точки; каждый вариант — готовое колесо
  function variants(prices, o, grid) {
    const out = [];
    for (const gamma of (grid && grid.gamma) || [o && o.gamma != null ? o.gamma : 0.5])
      for (const k of (grid && grid.k) || [(o && o.k) || 0.8]) out.push(suggestChances(prices, Object.assign({}, o, { gamma, k, targetPrice: 0 })));
    return out;
  }

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
  // Основная запись — лояльность по пунктам k_i (доля цены по меню, которую колесо выручает за пункт):
  // S = Σ q_i·k_i·C_i, общий k = S/EV. Маржа — тот же k, выраженный от затрат: m_i = k_i/μ_i − 1
  // (отрицательна только при k_i < μ_i). k и mu — число или массив по пунктам.
  function loyaltyPrice(P, Q, k, mu) {
    let S = 0, EV = 0, cost = 0;
    P.forEach((p, i) => { S += Q[i] * at(k, i) * p; EV += Q[i] * p; cost += Q[i] * at(mu, i) * p; });
    return { S, EV, cost, k: S / EV, margin: S / cost - 1, marginItems: P.map((p, i) => at(k, i) / at(mu, i) - 1) };
  }
  // при одном μ и одной марже на всё меню связь прямая: k = μ·(1 + m), m = k/μ − 1
  const kOfMargin = (mu, m) => mu * (1 + m);
  const marginOfK = (mu, k) => k / mu - 1;
  // Подбор γ под целевую лояльность k при марже по пунктам: k(γ) = Σ q_i r_i / Σ q_i C_i,
  // где r_i = μ_i C_i (1 + m_i). Возвращает null, если цель недостижима на [gLo, gHi].
  function gammaForK(prices, mu, margin, kTarget, gLo, gHi) {
    const lo = gLo == null ? 0 : gLo, hi = gHi == null ? 3 : gHi;
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi || !prices.length) return null;
    // k(g) need not be monotone when margins differ by item. Its roots satisfy
    // sum C_i^(1-g) * (mu_i * (1 + margin_i) - kTarget) = 0.
    // Combine equal prices, then recursively isolate derivative roots. Factoring
    // out the first exponential removes one term at each derivative step and
    // partitions the interval into monotone pieces, including tangent roots.
    const grouped = new Map();
    prices.forEach((p, i) => grouped.set(p, (grouped.get(p) || 0) + p * (at(mu, i) * (1 + at(margin, i)) - kTarget)));
    const terms = [...grouped].map(([p, c]) => ({ x: Math.log(p), c })).sort((a, b) => a.x - b.x);
    if (terms.some((t) => !Number.isFinite(t.x) || !Number.isFinite(t.c))) return null;
    function roots(ts) {
      ts = ts.filter((t) => t.c !== 0);
      if (!ts.length) return [lo];
      const origin = ts[0].x, scale = Math.max(...ts.map((t) => Math.abs(t.c)));
      ts = ts.map((t) => ({ x: t.x - origin, c: t.c / scale }));
      const value = (g) => {
        const shift = Math.max(...ts.map((t) => -t.x * g));
        let sum = 0, magnitude = 0;
        for (const t of ts) { const v = t.c * Math.exp(-t.x * g - shift); sum += v; magnitude += Math.abs(v); }
        return Math.abs(sum) <= 1e-12 * magnitude ? 0 : sum;
      };
      if (ts.length === 1) return [];
      const critical = roots(ts.slice(1).map((t) => ({ x: t.x, c: -t.x * t.c })));
      const cuts = [lo, ...critical.filter((g) => g > lo && g < hi), hi], found = [];
      for (const g of cuts) if (value(g) === 0) found.push(g);
      for (let i = 1; i < cuts.length; i++) {
        let a = cuts[i - 1], b = cuts[i], fa = value(a), fb = value(b);
        if (fa === 0 || fb === 0 || Math.sign(fa) === Math.sign(fb)) continue;
        for (let j = 0; j < 60; j++) {
          const m = (a + b) / 2, fm = value(m);
          if (fm === 0) { a = b = m; break; }
          if (Math.sign(fa) !== Math.sign(fm)) b = m;
          else { a = m; fa = fm; }
        }
        found.push((a + b) / 2);
      }
      return found.sort((a, b) => a - b);
    }
    return roots(terms)[0] ?? null; // deterministic: smallest matching gamma
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
  // Простая предиктивная модель спроса на лету. history: [{t, S, rate}] — минута эфира, цена и темп
  // вращений в час за интервал (включая отказы в допуске). Каждое наблюдение приводится к опорной цене
  // через эластичность, свежие весят больше (полураспад halfLife минут). Эластичность берётся из самих
  // наблюдений, если в них есть две разные цены и оценка правдоподобна, иначе — априорная epsPrior.
  // Результат совместим с demandAt, clearingPrice и dynamicStep.
  function forecastDemand(history, o) {
    o = o || {}; const pts = history.filter((h) => Number.isFinite(h.t) && Number.isFinite(h.S) && h.S > 0 && Number.isFinite(h.rate) && h.rate >= 0); if (!pts.length) return null;
    const half = o.halfLife > 0 ? o.halfLife : 10;
    const own = fitDemand(pts), usable = own && own.eps >= 0.3 && own.eps <= 4;
    const eps = usable ? own.eps : (o.epsPrior > 0 ? o.epsPrior : 1.5), Sref = pts.reduce((latest, h) => h.t > latest.t ? h : latest).S;
    let num = 0, den = 0;
    // A common time offset cancels in num / den; use the latest sample to avoid underflow.
    const latest = Math.max(...pts.map((h) => h.t));
    for (const h of pts) { const w = Math.pow(0.5, (latest - h.t) / half); num += w * h.rate * Math.pow(h.S / Sref, eps); den += w; }
    const vRef = num / den;
    return { eps, a: Math.log(vRef) + eps * Math.log(Sref), n: pts.length, vRef, Sref, epsSource: usable ? 'observed' : 'prior' };
  }
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
    const b = base(p), e = { sigma: p.sigma, f: p.f, rho: p.rho, c0: p.c0, phi: p.phi, eps: p.eps, load: p.load, kmax: p.kmax };
    return Object.assign({}, b, solve(b, e), { econ: e });
  }

  return { SERIES, normalize, stats, buildTails, lossProb, riskFloor, avgFloor, menuGuard, winChance, winCeiling,
    cannibalization, breakEvenK, roiFloorK, optimumK, volume, capacityPrice, gain, roi, base, solve, evaluate, priceForK, validate, LIMITS,
    chancePolicy, fitGamma, policyCurve, policyItems, suggestChances, variants, loyaltyPrice, marginPrice, kOfMargin, marginOfK, gammaForK, costTails, lossProbCost,
    fitDemand, forecastDemand, demandAt, capacityPerHour, clearingPrice, dynamicStep };
});
