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
