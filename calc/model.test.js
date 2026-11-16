// Контрольные числа из документа «Колесо призов: математическая модель цены вращения».
const test = require('node:test'); const assert = require('node:assert/strict');
const M = require('./model.js');
const items = [[5, 22], [15, 20], [20, 17], [40, 13], [60, 11], [100, 9], [200, 6], [500, 2]].map(([p, w]) => ({ p, w }));
const D = { items, mu: 0.4, delta: 0.1, alpha: 0.05, Nh: 30, wmin: 0, sigma: 0.4, f: 0.05, rho: 3, c0: 0.2, phi: 0.3, eps: 1.5, load: 0.5 };
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} ± ${tol}`);
const b = M.base(D), ev = b.EV;

test('стоимость приза: EV 50,3, разброс 80,6, CV 1,60', () => { near(ev, 50.3, 1e-9); near(b.sd, 80.575, 0.001); near(b.CV, 1.602, 0.001); });
test('риск серии из 30 по ценам 31, 33, 40, 50', () => {
  near(M.lossProb(b.tails, 31, 30, 0.4), 0.0480, 0.0001); near(M.lossProb(b.tails, 33, 30, 0.4), 0.0281, 0.0001);
  near(M.lossProb(b.tails, 40, 30, 0.4), 0.0034, 0.0001); near(M.lossProb(b.tails, 50, 30, 0.4), 0.00009, 0.00001);
  near(M.lossProb(b.tails, 30, 30, 0.4), 0.062, 0.0005); });
test('риск одного вращения: 17% при цене 33, 8% при цене 50', () => { near(M.lossProb(b.tails, 33, 1, 0.4), 0.17, 1e-9); near(M.lossProb(b.tails, 50, 1, 0.4), 0.08, 1e-9); });
test('риск серии из 10: 12,0% при 33 и 1,3% при 50', () => { near(M.lossProb(b.tails, 33, 10, 0.4), 0.120, 0.0005); near(M.lossProb(b.tails, 50, 10, 0.4), 0.0134, 0.0001); });
test('нижние границы: меню 12, в среднем 25,15, риск 31', () => { near(b.bMenu, 12, 1e-9); near(b.bAvg, 25.15, 1e-9); assert.equal(b.bRisk, 31); });
test('граница по риску при μ = 0,30 / 0,50 / 0,60', () => { for (const [mu, S] of [[0.3, 24], [0.5, 39], [0.6, 47]]) assert.equal(M.riskFloor(b.tails, 30, mu, 0.05, b.maxP), S); });
test('граница по риску при других α и длине серии', () => {
  assert.equal(M.riskFloor(b.tails, 30, 0.4, 0.02, b.maxP), 35); assert.equal(M.riskFloor(b.tails, 50, 0.4, 0.05, b.maxP), 29); assert.equal(M.riskFloor(b.tails, 100, 0.4, 0.05, b.maxP), 26); });
test('шанс выигрыша ступенями: 41% до 40, 28% до 60, 17% до 100', () => {
  for (const [S, w] of [[21, 0.41], [33, 0.41], [40, 0.41], [41, 0.28], [50, 0.28], [60, 0.28], [61, 0.17]]) near(M.winChance(b.P, b.Q, S), w, 1e-9);
  assert.equal(M.winCeiling(b.P, b.Q, 0.4), 40); assert.equal(M.winCeiling(b.P, b.Q, 0), Infinity); });
test('каннибализация в среднем сценарии: 50,2% при 50 и 57,7% при 40', () => { near(M.cannibalization(0.2, 0.3, ev, 50), 0.502, 0.0005); near(M.cannibalization(0.2, 0.3, ev, 40), 0.577, 0.0005); });
test('границы выгодности по сценариям каннибализации', () => {
  const sc = (c0, phi, rho) => M.roiFloorK({ sigma: 0.4, f: 0.05, rho, c0, phi }) * ev;
  for (const [c0, phi, be, r3, r4] of [[0.1, 0.15, 10, 15, 19], [0.2, 0.3, 23, 36, 51]]) {
    assert.equal(Math.ceil(M.breakEvenK({ sigma: 0.4, f: 0.05, c0, phi }) * ev), be); assert.equal(Math.ceil(sc(c0, phi, 3)), r3); assert.equal(Math.ceil(sc(c0, phi, 4) - 1e-9), r4); }
  assert.equal(Math.ceil(M.breakEvenK({ sigma: 0.4, f: 0.05, c0: 0.3, phi: 0.45 }) * ev), 40); assert.equal(Math.ceil(sc(0.3, 0.45, 3)), 70); assert.equal(Math.ceil(sc(0.3, 0.45, 4)), 114);   // обе выше потолка 50
  assert.equal(M.roiFloorK({ sigma: 0.4, f: 0.08, rho: 5, c0: 0.2, phi: 0.3 }), Infinity); });
test('оптимум без ограничений: k* = ε/(ε−1)·k_be', () => { const e = { sigma: 0.4, f: 0.05, c0: 0.2, phi: 0.3 };
  near(M.optimumK({ ...e, eps: 2.5 }) * ev, 37.26, 0.01); near(M.optimumK({ ...e, eps: 1.5 }), 1.333, 0.001); assert.equal(M.optimumK({ ...e, eps: 0.8 }), Infinity); });
test('выгода платформы: средний сценарий 753 при 50 и 541 при 33; высокий −276 при 33', () => { const e = { sigma: 0.4, f: 0.05, c0: 0.2, phi: 0.3, eps: 1.5, load: 0.01 };
  near(M.gain(50, ev, e), 753, 1); near(M.gain(33, ev, e), 541, 1); near(M.gain(33, ev, { ...e, c0: 0.3, phi: 0.45 }), -276, 1); });
test('ROI при цене 50: 6,0 / 4,0 / 2,0 по сценариям', () => { for (const [c0, phi, r] of [[0.1, 0.15, 6], [0.2, 0.3, 4], [0.3, 0.45, 2]]) near(M.roi(50, ev, { sigma: 0.4, f: 0.05, c0, phi }), r, 0.05); });
test('коридор и оптимум по умолчанию: 36–50, оптимум 50', () => { const m = M.evaluate(D); assert.deepEqual([m.lo, m.hi, m.opt, m.feasible], [36, 50, 50, true]); });
test('коридор при μ = 0,50: 39–50', () => { const m = M.evaluate({ ...D, mu: 0.5 }); assert.deepEqual([m.lo, m.hi], [39, 50]); });
test('эластичный спрос ε = 2,5: оптимум 37', () => { assert.equal(M.evaluate({ ...D, eps: 2.5, load: 0.01 }).opt, 37); });
test('низкая каннибализация: оптимум упирается в границу риска 31', () => { assert.equal(M.evaluate({ ...D, c0: 0.1, phi: 0.15, load: 0.01 }).opt, 31); });
test('минимальный шанс выигрыша 40%: потолок 40', () => { const m = M.evaluate({ ...D, wmin: 0.4 }); assert.deepEqual([m.lo, m.hi], [36, 40]); });
test('высокая каннибализация: цель по ROI недостижима, коридора нет', () => { const m = M.evaluate({ ...D, c0: 0.3, phi: 0.45 }); assert.equal(m.feasible, false); assert.equal(m.opt, 50); });
test('цена по ёмкости: спрос 45 при ёмкости 30 и цене 33 даёт 43', () => { near(33 * Math.pow(45 / 30, 1 / 1.5), 43.2, 0.1); near(M.capacityPrice(ev, 1.5, 1), ev, 1e-9); });
test('слабая эластичность: при ε = 0,5 и двойном спросе цена по ёмкости в 4 раза выше EV', () => { near(M.capacityPrice(ev, 0.5, 2) / ev, 4, 1e-9); });

test('цена по k на меню-примере: k = 1 даёт 50, k = 0,8 даёт 40, k = 0,5 упирается в границу 31', () => {
  assert.equal(M.priceForK(b, 1).S, 50); assert.equal(M.priceForK(b, 0.8).S, 40);
  const p = M.priceForK(b, 0.5); assert.equal(p.S, 31); assert.equal(p.bound, 'min'); assert.equal(p.floorBy, 'risk');
  assert.equal(M.priceForK(b, 1.3).S, 50); assert.equal(M.priceForK(b, 1.3).bound, 'max'); });
test('цена по k на другом меню: дешёвое ровное меню, коридор 8–15', () => {
  const flat = M.base(Object.assign({}, D, { items: [[5, 25], [10, 25], [15, 20], [20, 15], [30, 10], [50, 5]].map(([p, w]) => ({ p, w })) }));
  near(flat.EV, 15.25, 1e-9); const p = M.priceForK(flat, 0.8); assert.equal(p.lo, 8); assert.equal(p.hi, 15); assert.equal(p.S, 12); assert.equal(p.floorBy, 'risk'); });
test('валидатор: меню-пример проходит, джекпот 6% отклонён по двум правилам', () => {
  const v = M.validate(items, b); assert.ok(v.ok); near(v.consolation, 0.22, 1e-9); near(v.jackpotShare, 0.199, 0.0005);
  const risky = items.map((i) => i.p === 5 ? { p: 5, w: 18 } : i.p === 500 ? { p: 500, w: 6 } : i), rb = M.base(Object.assign({}, D, { items: risky }));
  const r = M.validate(risky, rb); near(rb.EV, 70.1, 1e-9); near(rb.CV, 1.69, 0.005); near(r.jackpotShare, 0.428, 0.0005);
  assert.deepEqual(r.errors, ['consolation', 'jackpot']); });

// ---------- политика шансов, пустой сектор, маржа над себестоимостью, спрос ----------
const PR = [5, 15, 20, 40, 60, 100, 200, 500];
const pol = (gamma, z, extra) => M.base(Object.assign({}, D, { items: M.policyItems(PR, gamma), z }, extra));
test('политика шансов q ∝ C^−γ: γ = 0 равные шансы, γ = 1 шанс обратно пропорционален цене', () => {
  const q0 = M.chancePolicy(PR, 0), q1 = M.chancePolicy(PR, 1);
  for (const q of q0) near(q, 0.125, 1e-12);
  near(q1[0] / q1[1], 3, 1e-9); near(q1[0] / q1[7], 100, 1e-9); near(q1[7], 0.005329, 1e-6);
  near(q1.reduce((s, q, i) => s + q * PR[i], 0), 21.314, 0.001); // равный вклад: EV = n / Σ(1/C)
  for (let i = 0; i < 8; i++) near(q1[i] * PR[i], 21.314 / 8, 0.001);
});
test('кривая EV(γ) и горб CV: EV 117,5 → 49,7 → 21,3 → 7,8; CV 1,33 → 1,87 → 2,12 → 1,31', () => {
  for (const [g, ev, cv] of [[0, 117.5, 1.33], [0.5, 49.7, 1.869], [1, 21.3, 2.124], [2, 7.8, 1.313]]) {
    const b1 = pol(g, 0); near(b1.EV, ev, 0.05); near(b1.CV, cv, 0.001); }
  assert.ok(pol(1, 0).CV > pol(0.5, 0).CV && pol(1, 0).CV > pol(1.5, 0).CV); // вершина горба около γ = 1
});
test('пустой сектор z: EV сжимается в (1 − z), CV растёт, валидатор отмечает empty', () => {
  const b0 = pol(1, 0), b2 = pol(1, 0.2);
  near(b2.EV, b0.EV * 0.8, 1e-9); near(b2.CV, 2.43, 0.005); near(b2.Q[b2.Q.length - 1], 0.2, 1e-12); assert.equal(b2.P[b2.P.length - 1], 0);
  assert.ok(M.validate(M.policyItems(PR, 1), b2).errors.includes('empty'));
  assert.ok(!M.validate(M.policyItems(PR, 1), b2, { emptyMax: 0.25 }).errors.includes('empty'));
});
test('модель друга как точка (γ = 1, z ≈ 0,218, k = 1,2): цена 20, EV 16,67, CV 2,46, риск серии 0,197%', () => {
  const H = PR.reduce((s, c) => s + 1 / c, 0), Sf = Math.floor(0.8 * 1.2 * 8 / H); assert.equal(Sf, 20);
  const z = 1 - Sf * H / (1.2 * 8); near(z, 0.2181, 0.0001);
  const fb = pol(1, z); near(fb.EV, 16.6667, 0.0001); near(fb.CV, 2.4596, 0.0005);
  near(M.lossProb(fb.tails, 20, 30, 0.4), 0.00197, 0.00002);
  assert.equal(M.priceForK(fb, 1.2, 1.2).S, 20);           // при потолке k_max = 1,2 наша формула даёт его цену
  assert.equal(M.priceForK(fb, 1.2).S, 16);                // при нашем потолке k_max = 1 цена срезается до ⌊EV⌋
  assert.deepEqual(M.validate(M.policyItems(PR, 1), fb).errors, ['cv', 'empty']);
});
test('маржа над себестоимостью: k = μ(1 + m); при k > 1 параметр μ остаётся в модели', () => {
  near(M.kOfMargin(0.4, 1), 0.8, 1e-12); near(M.marginOfK(0.4, 1.2), 2, 1e-12); near(M.marginOfK(0.4, 0.4), 0, 1e-12);
  for (const g of [0, 0.5, 1, 2]) { const q = M.chancePolicy(PR, g), r = M.marginPrice(PR, q, 0.4, 1); near(r.k, 0.8, 1e-9); near(r.margin, 1, 1e-9); }
  const fb = pol(1, 0.2181), r = M.marginPrice(fb.P, fb.Q, 0.4, 2); near(r.k, 1.2, 1e-9); near(r.cost, 0.4 * fb.EV, 1e-9); // пустой сектор затрат не несёт
});
test('маржа по пунктам: k зависит от γ, γ подбирается под целевую лояльность', () => {
  const mu = [0.2, 0.3, 0.3, 0.4, 0.4, 0.4, 0.5, 0.6], m = [1.5, 1.2, 1.2, 1, 1, 1, 0.8, 0.5]; // r_i/C_i от 0,5 до 0,9
  const k0 = M.marginPrice(PR, M.chancePolicy(PR, 0), mu, m).k, k2 = M.marginPrice(PR, M.chancePolicy(PR, 2), mu, m).k;
  assert.ok(k0 > k2); near(k0, 0.868, 0.001); near(k2, 0.5985, 0.0005);
  const g = M.gammaForK(PR, mu, m, 0.8); near(M.marginPrice(PR, M.chancePolicy(PR, g), mu, m).k, 0.8, 1e-6); near(g, 0.697, 0.002);
  assert.equal(M.gammaForK(PR, mu, m, 0.95), null); // такой k при этих маржах недостижим
  const ct = M.costTails(PR, M.chancePolicy(PR, g), mu); near(M.lossProbCost(ct, 28, 30), 0.068, 0.001); assert.ok(M.lossProbCost(ct, 35, 30) < M.lossProbCost(ct, 28, 30));
});
test('спрос и динамическая цена: ε восстанавливается, шаг идёт к цене равновесия по ступеням', () => {
  const obs = [30, 40, 50].map((S) => ({ S, rate: 600 * Math.pow(S, -1.5) * 60 })), fit = M.fitDemand(obs);
  near(fit.eps, 1.5, 1e-9); near(M.demandAt(fit, 40), obs[1].rate, 1e-6);
  assert.equal(M.fitDemand([{ S: 40, rate: 30 }, { S: 40, rate: 32 }]), null);
  const cap = M.demandAt(fit, 46); near(M.clearingPrice(fit, cap), 46, 1e-6);
  const o = { fit, capacity: cap, lo: 31, hi: 50, steps: [31, 36, 40, 45, 50] };
  assert.equal(M.dynamicStep(Object.assign({ current: 40 }, o)), 45);  // равновесие 46 ≥ ступени 45
  assert.equal(M.dynamicStep(Object.assign({ current: 45 }, o)), 45);  // до 50 не дошло — стоим
  assert.equal(M.dynamicStep(Object.assign({ current: 50 }, o)), 50);  // равновесие 46 выше ступени 45 — вниз не идём (гистерезис)
  assert.equal(M.dynamicStep(Object.assign({ current: 50 }, o, { capacity: M.demandAt(fit, 44) })), 45); // равновесие 44 — шаг вниз
  assert.equal(M.dynamicStep(Object.assign({ current: 45 }, o, { capacity: cap / 100 })), 50); // спрос много выше — но не выше потолка
  near(M.capacityPerHour([0.5, 0.5], [60, 180], 0.5), 15, 1e-9);
});

test('условие нормировки, поправки по пунктам и подгонка γ', () => {
  for (const g of [0, 0.5, 1, 2.5]) near(M.chancePolicy(PR, g).reduce((a, x) => a + x, 0), 1, 1e-12);
  near(pol(1, 0.2).Q.reduce((a, x) => a + x, 0), 1, 1e-12);                       // с пустым сектором сумма тоже 1
  near(M.fitGamma(PR, M.chancePolicy(PR, 0.7)), 0.7, 1e-9); near(M.fitGamma(b.P, b.Q), 0.5, 0.01); // ручное меню ≈ γ 0,5
  const adj = [1, 1, 1, 1, 1, 1, 1, 0.63], q = M.chancePolicy(PR, 0.5, adj);         // джекпот прижат на 37%
  near(q[7], 0.02, 0.0005); near(M.stats(PR, q).CV, 1.79, 0.005);                  // CV 1,87 → 1,79 одним прижатым пунктом
});
test('пустой сектор выносится за скобки: EV = (1 − z)·EV0, CV² = (CV0² + z)/(1 − z), маржа от z не зависит', () => {
  const b0 = pol(1, 0), z = 0.2181, bz = pol(1, z);
  near(bz.EV, (1 - z) * b0.EV, 1e-9); near(bz.CV ** 2, (b0.CV ** 2 + z) / (1 - z), 1e-9);
  const Sz = 20, S0 = Sz / (1 - z); near(S0, 25.58, 0.01);                          // та же сделка без пустого сектора
  near(bz.EV / Sz, b0.EV / S0, 1e-9);                                               // отдача зрителю на токен одинакова
  near(M.marginPrice(bz.P, bz.Q, 0.4, 2).k, M.marginPrice(b0.P, b0.Q, 0.4, 2).k, 1e-9);
  near(Sz / b0.EV, 0.938, 0.001); near((Sz / b0.EV) / (1 - z), 1.2, 0.001);            // две базы цены: k = k0 / (1 − z)
  const zmax = (4 - b.CV ** 2) / 5; near(zmax, 0.287, 0.001);                        // сколько пустоты выдерживает ручное меню до CV = 2
  near(M.base(Object.assign({}, D, { z: zmax })).CV, 2, 1e-9);
});
test('кривая по γ и потолок k_max в коридоре', () => {
  const c = M.policyCurve(PR, [0, 0.5, 1], { z: 0, mu: 0.4, delta: 0.1, alpha: 0.05, Nh: 30 });
  assert.deepEqual(c.map((r) => r.smin), [67, 33, 15]); near(c[2].CV, 2.124, 0.001); near(c[2].qTop, 0.005329, 1e-6);
  const zf = 1 - 20 * PR.reduce((a, c) => a + 1 / c, 0) / 9.6; // точная доля пустого сектора альтернативной модели
  const fr = M.evaluate(Object.assign({}, D, { items: M.policyItems(PR, 1), z: zf, kmax: 1.2, rho: 1 }));
  assert.equal(fr.hi, 20); assert.equal(M.evaluate(Object.assign({}, D, { items: M.policyItems(PR, 1), z: zf })).hi, 16);
});
