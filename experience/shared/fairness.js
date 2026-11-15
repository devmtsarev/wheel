// Cryptographic helpers extracted from the original wheel demo.
const te = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));

// commit = SHA-256(server_seed_hex как строка)
async function sha256Hex(str) {
  return hex(await crypto.subtle.digest('SHA-256', te.encode(str)));
}
async function hmacSha256(keyBytes, msg) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, te.encode(msg)));
}
// HMAC(server_seed, "client_seed:nonce") -> число 0..999999 (ppm) без смещения:
// берём 32-битные слова, слова >= LIMIT отбрасываем (rejection sampling).
async function rollPpm(serverSeedHex, clientSeed, nonce) {
  const LIMIT = Math.floor(4294967296 / 1e6) * 1e6;
  for (let round = 0; round < 1000; round++) {
    const msg = round === 0 ? `${clientSeed}:${nonce}` : `${clientSeed}:${nonce}:${round}`;
    const mac = await hmacSha256(unhex(serverSeedHex), msg);
    const dv = new DataView(mac.buffer);
    for (let w = 0; w < 8; w++) {
      const v = dv.getUint32(w * 4);
      if (v < LIMIT) return v % 1e6;
    }
  }
  throw new Error('unreachable');
}
// Пункт по кумулятивным весам (веса в ppm, сумма ровно 1 000 000)
function pickIndex(items, ppm) {
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += items[i].ppm;
    if (ppm < acc) return i;
  }
  return items.length - 1;
}

export {hex, sha256Hex, rollPpm, pickIndex};
