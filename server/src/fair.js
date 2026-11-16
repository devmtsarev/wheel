// Движок доказуемой честности (документ: «Как устроено вращение», api/README.md).
// commit: SHA-256(server_seed) показывается до розыгрыша; розыгрыш:
// HMAC-SHA256(server_seed, `${client_seed}:${nonce}[:${counter}]`) → число 0..999999
// отбором без смещения; пункт — по кумулятивным ppm.
'use strict';
const crypto = require('node:crypto');

const PPM = 1_000_000;
// 4 байта дают 0..2^32-1; принимаем только значения ниже наибольшего кратного PPM,
// иначе остаток по модулю был бы смещён к маленьким числам
const LIMIT = Math.floor(2 ** 32 / PPM) * PPM;

const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

function newServerSeed() {
  const seed = crypto.randomBytes(32).toString('hex');
  return { seed, hash: sha256hex(seed) };
}

// Число 0..999999 из сидов. counter расширяет поток, если все 8 четвёрок байт отклонены.
function rollPpm(serverSeed, clientSeed, nonce) {
  for (let counter = 0; ; counter++) {
    const msg = counter === 0 ? `${clientSeed}:${nonce}` : `${clientSeed}:${nonce}:${counter}`;
    const mac = crypto.createHmac('sha256', serverSeed).update(msg).digest();
    for (let off = 0; off + 4 <= mac.length; off += 4) {
      const v = mac.readUInt32BE(off);
      if (v < LIMIT) return v % PPM;
    }
  }
}

// Кумулятивная шкала: items[i] получает [from, from + ppm). Сумма ppm == 1e6 — проверяет валидатор.
function pickIndex(ppms, roll) {
  let acc = 0;
  for (let i = 0; i < ppms.length; i++) {
    acc += ppms[i];
    if (roll < acc) return i;
  }
  throw new Error('roll вне шкалы: сумма ppm меньше 1000000');
}

// Канонический хеш содержимого колеса; печатается зрителю и входит в проверку честности
function contentHash(items) {
  const canon = items.map((it) => ({ name: it.name, price: it.price, ppm: it.ppm }));
  return sha256hex(JSON.stringify(canon));
}

function verify({ serverSeed, serverSeedHash, clientSeed, nonce, rollPpm: roll, ppms, itemIndex }) {
  if (sha256hex(serverSeed) !== serverSeedHash) return { ok: false, reason: 'seed_hash_mismatch' };
  const r = rollPpm(serverSeed, clientSeed, nonce);
  if (r !== roll) return { ok: false, reason: 'roll_mismatch', expected: r };
  if (pickIndex(ppms, r) !== itemIndex) return { ok: false, reason: 'item_mismatch' };
  return { ok: true };
}

module.exports = { PPM, sha256hex, newServerSeed, rollPpm, pickIndex, contentHash, verify };
