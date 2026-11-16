#!/usr/bin/env node
// Пакетный расчёт цены вращения для меню разных моделей.
// Запуск: node price.js menus.json [--csv | --json]
// Все формулы берутся из model.js (раздел документа «Расчёт цены для любой модели»).
const fs = require('fs'); const M = require('./model.js');

const args = process.argv.slice(2), file = args.find((a) => !a.startsWith('--'));
const fmt = args.includes('--csv') ? 'csv' : args.includes('--json') ? 'json' : 'md';
if (!file) { console.error('Запуск: node price.js menus.json [--csv | --json]'); process.exit(2); }

const input = JSON.parse(fs.readFileSync(file, 'utf8'));
const P = Object.assign({ mu: 0.4, delta: 0.1, alpha: 0.05, Nh: 30, wmin: 0, k: [1, 0.8] }, input.params);
if (!M.SERIES.includes(P.Nh)) { console.error('Nh должно быть одним из: ' + M.SERIES.join(', ')); process.exit(2); }
const ks = [].concat(P.k);

const WHY = { risk: 'риск серии', avg: 'плюс в среднем', menu: 'защита меню' };
const ERR = { consolation: 'мало утешительных', jackpot: 'джекпот тяжелее 25% EV', cv: 'CV выше 2,0', price: 'S_min выше EV' };
const num = (x, d) => Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—';
const pct = (x, d) => Number.isFinite(x) ? (100 * x).toFixed(d).replace('.', ',') + '%' : '—';

const rows = input.models.map((m) => {
  // меню без весов: шансы подбираются из цен (γ или цена клика из параметров) и правятся под валидатор
  const auto = m.items.every((i) => i.w == null && i.q == null);
  const sug = auto ? M.suggestChances(m.items.map((i) => i.p), { gamma: m.gamma != null ? m.gamma : P.gamma, targetPrice: m.target_price || P.target_price, k: ks[0], z: P.z }) : null;
  const items = auto ? sug.items.map((i, j) => ({ p: i.p, w: i.w, role: m.items[j].role })) : m.items.map((i) => ({ p: i.p, w: i.w != null ? i.w : i.q, role: i.role }));
  const b = M.base({ items, mu: P.mu, delta: P.delta, alpha: P.alpha, Nh: P.Nh, wmin: P.wmin });
  const v = M.validate(items, b, input.limits), first = M.priceForK(b, ks[0]);
  const prices = ks.map((k) => {
    const r = M.priceForK(b, k);
    return { k, S: r.S, raw: r.raw, bound: r.bound, kEff: r.kEff,
      win: r.feasible ? M.winChance(b.P, b.Q, r.S) : NaN, risk: r.feasible ? M.lossProb(b.tails, r.S, P.Nh, P.mu) : NaN };
  });
  return { id: m.id + (auto ? ` (шансы подобраны: γ = ${num(sug.gamma, 2)}, джекпот ${pct(sug.qTop, 2)})` : ''), items: b.P.length, EV: b.EV, CV: b.CV, Smin: first.lo, Smax: first.hi, floorBy: first.floorBy,
    consolation: v.consolation, jackpotShare: v.jackpotShare, ok: v.ok, errors: v.errors, prices };
});

if (fmt === 'json') { console.log(JSON.stringify({ params: P, models: rows }, null, 2)); process.exit(0); }

const note = (p) => p.bound === 'min' ? ' (поднята до S_min)' : p.bound === 'max' && p.k > 1 ? ' (срезана до потолка)' : '';
const head = ['Модель', 'EV', 'CV', 'S_min', 'Что задало S_min', 'Потолок',
  ...ks.flatMap((k) => [`Цена при k = ${num(k, 2)}`, 'Шанс выигрыша', `Убыточных серий из ${P.Nh}`]), 'Валидатор'];
const body = rows.map((r) => [r.id, num(r.EV, 1), num(r.CV, 2), r.Smin, WHY[r.floorBy], r.Smax,
  ...r.prices.flatMap((p) => [Number.isFinite(p.S) ? p.S + (fmt === 'md' ? note(p) : '') : 'нет цены', pct(p.win, 0), pct(p.risk, 2)]),
  r.ok ? 'пройден' : 'отклонён: ' + r.errors.map((e) => ERR[e]).join('; ')]);

if (fmt === 'csv') {
  const q = (c) => /[",;\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c;
  console.log([head, ...body].map((r) => r.map(q).join(';')).join('\n'));
} else {
  console.log(`Параметры: μ = ${num(P.mu, 2)}, δ = ${num(P.delta, 2)}, α = ${pct(P.alpha, 0)}, N_h = ${P.Nh}\n`);
  console.log('| ' + head.join(' | ') + ' |'); console.log('|' + head.map(() => ' --- ').join('|') + '|');
  for (const r of body) console.log('| ' + r.join(' | ') + ' |');
}
if (rows.some((r) => !r.ok)) process.exitCode = 1;
