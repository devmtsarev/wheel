#!/usr/bin/env node
// Графики и таблица примеров для разделов «Политика шансов» и «Примеры» документа.
// Всё считается функциями calc/model.js. Запуск: node docs/charts.js
//   → docs/img/13-corridor.svg, 14-cv-hump.svg, 15-cv-forces.svg и таблица примеров в stdout
'use strict';
const fs = require('fs'), path = require('path');
const M = require('../calc/model.js');

const PR = [5, 15, 20, 40, 60, 100, 200, 500];                        // цены меню-примера
const HAND = [22, 20, 17, 13, 11, 9, 6, 2];                           // ручные шансы меню-примера, %
const D = { mu: 0.4, delta: 0.1, alpha: 0.05, Nh: 30, wmin: 0 };
const baseOf = (items, z) => M.base(Object.assign({}, D, { items, z }));
const pol = (g, z) => baseOf(M.policyItems(PR, g), z);
const hand = baseOf(PR.map((p, i) => ({ p, w: HAND[i] })));
const H = PR.reduce((s, c) => s + 1 / c, 0), FRIEND_S = Math.floor(0.8 * 1.2 * 8 / H), FRIEND_Z = 1 - FRIEND_S * H / (1.2 * 8);
const friend = pol(1, FRIEND_Z);

// ---------- данные кривых ----------
const G = []; for (let g = 0; g <= 2.5001; g += 0.05) G.push(+g.toFixed(2));
const rows = G.map((g) => {
  const b = pol(g, 0), bz = pol(g, 0.2), p = M.priceForK(b, 1), qj = b.Q[7];
  return { g, ev: b.EV, cv: b.CV, cvz: bz.CV, smin: Math.min(p.lo, b.EV), qj, far: 500 / b.EV, jc: qj * ((500 - b.EV) / b.EV) ** 2 };
});

// ---------- маленький SVG-построитель ----------
const INK = '#0b0b0b', INK2 = '#52514e', GRID = '#e6e4de', AXIS = '#b9b7ae', SURF = '#fcfcfb';
const B1 = '#86b6ef', B2 = '#2a78d6', B3 = '#104281', ORANGE = '#eb6834', CRIT = '#d03b3b';
const ru = (v, d) => v.toFixed(d).replace('.', ',');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const T = (x, y, s, o = {}) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size || 12}" fill="${o.fill || INK2}" text-anchor="${o.anchor || 'start'}"${o.bold ? ' font-weight="600"' : ''}>${esc(s)}</text>`;
const pathOf = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
const svg = (w, h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}" font-family="-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif">\n<rect width="${w}" height="${h}" fill="${SURF}"/>\n${body}\n</svg>\n`;
const dot = (x, y, fill) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${fill}" stroke="${SURF}" stroke-width="2"/>`;
const out = (name, s) => { fs.writeFileSync(path.join(__dirname, 'img', name), s); console.error('wrote docs/img/' + name); };

// ---------- 13: коридор S = k·EV(γ) ----------
(() => {
  const W = 760, Hh = 440, xa = 64, xb = 600, ya = 84, yb = 372;
  const X = (g) => xa + g / 2.5 * (xb - xa), Y = (v) => yb - (Math.log(v) - Math.log(4)) / (Math.log(200) - Math.log(4)) * (yb - ya);
  const title = 'Цена вращения S = k · EV(γ): чем круче γ, тем дешевле колесо в токенах';
  let s = T(24, 30, title, { size: 16, fill: INK, bold: true }) + T(24, 52, 'Меню 5…500 токенов, шансы q ∝ C^(−γ), без пустого сектора; μ = 0,40, α = 5%, серия 30. Логарифмическая шкала');
  for (const v of [5, 10, 20, 50, 100, 200]) s += `<line x1="${xa}" x2="${xb}" y1="${Y(v)}" y2="${Y(v)}" stroke="${GRID}"/>` + T(xa - 8, Y(v) + 4, String(v), { anchor: 'end', size: 11 });
  for (const g of [0, 0.5, 1, 1.5, 2, 2.5]) s += T(X(g), yb + 18, ru(g, 1), { anchor: 'middle', size: 11 });
  s += T(xb, yb + 40, 'γ: 0 — равные шансы, 1 — шанс обратно пропорционален цене', { anchor: 'end', size: 11 }) + T(24, ya - 12, 'токенов за вращение', { size: 11 });
  // коридор: между S_min и EV
  const top = rows.map((r) => [X(r.g), Y(r.ev)]), bot = rows.map((r) => [X(r.g), Y(r.smin)]).reverse();
  s += `<path d="${pathOf(top.concat(bot))}Z" fill="${B1}" fill-opacity="0.22"/>`;
  const line = (f, col, wdt, dash) => `<path d="${pathOf(rows.map((r) => [X(r.g), Y(f(r))]))}" fill="none" stroke="${col}" stroke-width="${wdt}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linejoin="round"/>`;
  s += line((r) => 1.2 * r.ev, B3, 2) + line((r) => r.ev, B2, 2.5) + line((r) => 0.8 * r.ev, B1, 2) + line((r) => r.smin, INK2, 1.5, '5 4');
  const L = rows[rows.length - 1], ly = Y(1.2 * L.ev) - 12;
  s += T(xb + 10, ly, 'k = 1,2: дороже меню', { fill: INK }) + T(xb + 10, ly + 17, 'k = 1,0: цена = EV', { fill: INK, bold: true })
    + T(xb + 10, ly + 34, 'k = 0,8: скидка 20%', { fill: INK }) + T(xb + 10, ly + 51, 'S_min: ниже нельзя', {});
  // легенда коридора и подписи точек — в свободном правом верхнем углу, с выносками
  s += `<rect x="${X(1.45)}" y="${ya + 4}" width="14" height="12" fill="${B1}" fill-opacity="0.35"/>` + T(X(1.45) + 20, ya + 14, 'коридор лояльных цен: от S_min до EV', { size: 11, fill: INK });
  const callout = (px, py, tx, ty, text) => `<path d="M${px.toFixed(1)} ${py.toFixed(1)}L${(tx - 4).toFixed(1)} ${(ty - 4).toFixed(1)}" stroke="${AXIS}" stroke-width="1"/>` + dot(px, py, ORANGE) + T(tx, ty, text, { size: 11, fill: INK });
  s += callout(X(0.5), Y(40), X(0.9), Y(95), 'наше меню: ручные шансы ≈ γ 0,5, k = 0,8 → 40 токенов');
  s += callout(X(1), Y(FRIEND_S), X(1.3), Y(48), `альтернативная модель: γ = 1, k = 1,2, пустой сектор 22% → ${FRIEND_S} токенов`);
  out('13-corridor.svg', svg(W, Hh, title, s));
})();

// ---------- 14: горб CV ----------
(() => {
  const W = 760, Hh = 420, xa = 64, xb = 600, ya = 84, yb = 352;
  const X = (g) => xa + g / 2.5 * (xb - xa), Y = (v) => yb - (v - 0.8) / (2.8 - 0.8) * (yb - ya);
  const title = 'Горб CV: самое «лотерейное» колесо получается около γ = 1';
  let s = T(24, 30, title, { size: 16, fill: INK, bold: true }) + T(24, 52, 'Относительный разброс стоимости приза CV = σ / EV по значению γ; меню 5…500 токенов');
  s += `<rect x="${xa}" y="${ya}" width="${xb - xa}" height="${Y(2) - ya}" fill="${CRIT}" fill-opacity="0.07"/>`;
  for (const v of [1, 1.5, 2, 2.5]) s += `<line x1="${xa}" x2="${xb}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 2 ? AXIS : GRID}"${v === 2 ? ' stroke-dasharray="5 4" stroke-width="1.5"' : ''}/>` + T(xa - 8, Y(v) + 4, ru(v, 1), { anchor: 'end', size: 11, fill: v === 2 ? INK : INK2 });
  s += T(xa + 8, ya + 16, 'валидатор не пропускает: CV > 2,0', { size: 11, fill: CRIT });
  for (const g of [0, 0.5, 1, 1.5, 2, 2.5]) s += T(X(g), yb + 18, ru(g, 1), { anchor: 'middle', size: 11 });
  s += T(xb, yb + 40, 'γ', { anchor: 'end', size: 11 }) + T(24, ya - 12, 'CV', { size: 11 });
  s += `<path d="${pathOf(rows.map((r) => [X(r.g), Y(r.cvz)]))}" fill="none" stroke="${B1}" stroke-width="2"/>`;
  s += `<path d="${pathOf(rows.map((r) => [X(r.g), Y(r.cv)]))}" fill="none" stroke="${B2}" stroke-width="2.5"/>`;
  const L = rows[rows.length - 1];
  s += T(xb + 10, Y(L.cvz) + 4, 'с пустым сектором 20%', { fill: INK }) + T(xb + 10, Y(L.cv) + 4, 'без пустого сектора', { fill: INK, bold: true });
  s += dot(X(0.5), Y(hand.CV), ORANGE) + T(X(0.5) + 12, Y(hand.CV) + 16, `наше меню: ${ru(hand.CV, 2)} — джекпот прижат вручную`, { size: 11, fill: INK });
  s += dot(X(1), Y(friend.CV), ORANGE) + T(X(1) + 10, Y(friend.CV) - 8, `альтернативная модель: ${ru(friend.CV, 2)}`, { size: 11, fill: INK });
  out('14-cv-hump.svg', svg(W, Hh, title, s));
})();

// ---------- 15: почему горб — три панели на общей оси γ ----------
(() => {
  const W = 760, xa = 64, xb = 600, ph = 104, gap = 44, y0 = 96, Hh = y0 + 3 * ph + 2 * gap + 56;
  const X = (g) => xa + g / 2.5 * (xb - xa);
  const title = 'Почему горб: джекпот становится реже, но всё дальше от среднего';
  let s = T(24, 30, title, { size: 16, fill: INK, bold: true }) + T(24, 52, 'Вклад джекпота в CV² ≈ шанс × (удалённость от среднего)². Меню 5…500 токенов');
  const panels = [
    { name: 'Шанс джекпота, % — падает', f: (r) => r.qj * 100, max: 12.5, ticks: [0, 5, 10], d: 0, col: B2 },
    { name: 'Удалённость: во сколько раз джекпот 500 больше среднего приза — растёт', f: (r) => r.far, max: 80, ticks: [0, 40, 80], d: 0, col: B2 },
    { name: 'Вклад джекпота в CV² — произведение даёт горб', f: (r) => r.jc, max: 3, ticks: [0, 1.5, 3], d: 1, col: B3 },
  ];
  panels.forEach((p, i) => {
    const ya = y0 + i * (ph + gap), yb = ya + ph, Y = (v) => yb - v / p.max * ph;
    s += T(xa, ya - 10, p.name, { fill: INK, size: 12, bold: i === 2 });
    for (const v of p.ticks) s += `<line x1="${xa}" x2="${xb}" y1="${Y(v)}" y2="${Y(v)}" stroke="${GRID}"/>` + T(xa - 8, Y(v) + 4, ru(v, p.d), { anchor: 'end', size: 11 });
    s += `<line x1="${X(1)}" x2="${X(1)}" y1="${ya}" y2="${yb}" stroke="${AXIS}" stroke-dasharray="4 4"/>`;
    s += `<path d="${pathOf(rows.map((r) => [X(r.g), Y(p.f(r))]))}" fill="none" stroke="${p.col}" stroke-width="${i === 2 ? 2.5 : 2}"/>`;
    const r1 = rows.find((r) => r.g === 1); s += dot(X(1), Y(p.f(r1)), p.col) + T(X(1) + 10, Y(p.f(r1)) - 8, ru(p.f(r1), i === 0 ? 2 : 1) + (i === 0 ? '%' : i === 1 ? '×' : ''), { size: 11, fill: INK });
    if (i === 2) for (const g of [0, 0.5, 1, 1.5, 2, 2.5]) s += T(X(g), yb + 18, ru(g, 1), { anchor: 'middle', size: 11 });
    if (i === 2) s += T(xb, yb + 40, 'γ', { anchor: 'end', size: 11 });
  });
  s += T(X(1) + 6, y0 + 12, 'γ = 1', { size: 11 });
  out('15-cv-forces.svg', svg(W, Hh, title, s));
})();

// ---------- таблица примеров ----------
const pct = (v, d) => ru(v * 100, d) + '%';
function example(name, b, items, k, kmax, note) {
  const p = M.priceForK(b, k, kmax), v = M.validate(items, b, { kMax: kmax || 1 }), S = p.S;
  const names = { consolation: 'мало утешительных', jackpot: 'тяжёлый джекпот', cv: 'CV > 2', empty: 'пустой сектор', price: 'нет цены' };
  return [name, ru(b.EV, 1), ru(b.CV, 2), `${p.lo}–${p.hi}`, String(S) + (p.bound === 'min' ? ' ↑' : p.bound === 'max' ? ' ↓' : ''), ru(S / b.EV, 2),
    pct(S / (D.mu * b.EV) - 1, 0), pct(b.Q[7], 2), pct(M.winChance(b.P, b.Q, S), 0), pct(b.z || 0, 0), pct(M.lossProb(b.tails, S, 30, D.mu), 2),
    v.ok ? 'пройден' : v.errors.map((e) => names[e]).join(', ')].join(' | ');
}
const handItems = PR.map((p, i) => ({ p, w: HAND[i] }));
const lines = [
  example('Наше меню, ручные шансы, k = 0,8', hand, handItems, 0.8),
  example('Наше меню, ручные шансы, k = 1,0', hand, handItems, 1),
  example('γ = 0 (равные шансы), k = 0,8', pol(0, 0), M.policyItems(PR, 0), 0.8),
  example('γ = 0,5, k = 0,8', pol(0.5, 0), M.policyItems(PR, 0.5), 0.8),
  example('γ = 1, k = 0,8 (шансы альтернативной модели, лояльная цена)', pol(1, 0), M.policyItems(PR, 1), 0.8),
  example('**Альтернативная модель:** γ = 1, z = 22%, k = 1,2', friend, M.policyItems(PR, 1), 1.2, 1.2),
  example('Альтернативная модель под потолком k ≤ 1', friend, M.policyItems(PR, 1), 1.2, 1),
  example('γ = 1,5, k = 0,8', pol(1.5, 0), M.policyItems(PR, 1.5), 0.8),
  example('γ = 2, k = 0,8', pol(2, 0), M.policyItems(PR, 2), 0.8),
];
console.log('| Точка | EV | CV | Коридор | Цена S | k = S/EV | Маржа над себестоимостью | Шанс джекпота | Шанс выигрыша | Пустых | Риск серии из 30 | Валидатор |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const l of lines) console.log('| ' + l + ' |');

// маржа по пунктам
const mu = [0.2, 0.3, 0.3, 0.4, 0.4, 0.4, 0.5, 0.6], mg = [1.5, 1.2, 1.2, 1, 1, 1, 0.8, 0.5];
console.log('\nМаржа по пунктам: r_i/C_i = ' + mu.map((x, i) => ru(x * (1 + mg[i]), 2)).join(' · '));
console.log('| γ | k = S/EV | EV | Цена S | Средняя маржа над себестоимостью | Шанс джекпота |\n| --- | --- | --- | --- | --- | --- |');
for (const g of [0, 0.5, M.gammaForK(PR, mu, mg, 0.8), 1, 1.5, 2]) {
  const q = M.chancePolicy(PR, g), r = M.marginPrice(PR, q, mu, mg);
  console.log(`| ${ru(g, 2)} | ${ru(r.k, 2)} | ${ru(r.EV, 1)} | ${Math.round(r.S)} | ${pct(r.margin, 0)} | ${pct(q[7], 2)} |`);
}
console.error(`друг: S=${FRIEND_S}, z=${FRIEND_Z.toFixed(4)}, EV=${friend.EV.toFixed(4)}, CV=${friend.CV.toFixed(4)}; ручное меню CV=${hand.CV.toFixed(3)}`);
