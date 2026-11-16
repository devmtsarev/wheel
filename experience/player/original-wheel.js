// Original demo widget, with adapter lifecycle and overlay integration fixes.
import {hex,sha256Hex,rollPpm,pickIndex} from '../shared/fairness.js';
const pl = (n, f) => {
  n = Math.abs(n) % 100; const m = n % 10;
  if (n > 10 && n < 20) return f[2];
  if (m > 1 && m < 5) return f[1];
  if (m === 1) return f[0];
  return f[2];
};
const tk = (n) => `${n} ${pl(n, ['токен', 'токена', 'токенов'])}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : hex(crypto.getRandomValues(new Uint8Array(16))));

const THEMES = {
  night:  { bg: '#202a24', panel: '#26352c', ink: '#f5f3e8', muted: '#bec8b8', accent: '#e1ce9b', 'accent-ink': '#233025', gold: '#e1ce9b', line: 'rgba(235,227,198,.18)' },
  mint:   { bg: '#eef6f2', panel: '#ffffff', ink: '#14312b', muted: '#5d7a72', accent: '#0f9d7a', 'accent-ink': '#ffffff', gold: '#f2a516', line: 'rgba(20,49,43,.16)' },
  violet: { bg: '#f1eefe', panel: '#ffffff', ink: '#211a4d', muted: '#6b64a3', accent: '#5b3df5', 'accent-ink': '#ffffff', gold: '#f2a516', line: 'rgba(33,26,77,.16)' }
};

const WIDGET_CSS = `
:host { display:block; font-family:"Avenir Next","Segoe UI",system-ui,sans-serif; color:var(--ink); }
:host { --bg:#1a1740; --panel:#252163; --ink:#f4f0ff; --muted:#a8a1d6; --accent:#ff5c8a; --accent-ink:#2a0b17; --gold:#ffc857; --line:rgba(255,255,255,.14); }
* { box-sizing:border-box; }
.w { position:relative; overflow:visible; background:transparent; border:0; border-radius:22px; padding:8px; max-width:440px; margin:0 auto; }
.stage { position:relative; margin:0 auto; }
canvas { display:block; margin:0 auto; filter:drop-shadow(0 12px 18px #0005); }
.pointer { position:absolute; left:50%; top:-2px; transform:translateX(-50%); width:0; height:0;
  border-left:13px solid transparent; border-right:13px solid transparent; border-top:26px solid var(--gold);
  filter:drop-shadow(0 2px 2px rgba(0,0,0,.35)); pointer-events:none; }
.stage { --hub:84px; }
.spin { position:absolute; z-index:2; left:50%; top:50%; transform:translate(-50%,-50%); width:var(--hub); height:var(--hub);
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; padding:8px;
  font:inherit; text-align:center; line-height:1; border:3px solid var(--panel); border-radius:50%; cursor:pointer; background:var(--accent); color:var(--accent-ink);
  opacity:1; appearance:none; -webkit-appearance:none; overflow:hidden;
  box-shadow:0 0 0 2px var(--accent), 0 4px 14px rgba(0,0,0,.35); }
.spin span{display:block;flex:none;width:100%;text-align:center;margin:0;line-height:1;position:relative}
.spin:hover:not(:disabled) { box-shadow:0 0 0 3px var(--gold), 0 6px 18px rgba(0,0,0,.4); }
.spin { -webkit-tap-highlight-color:transparent; }
.spin.busy:disabled { opacity:1; cursor:progress; }
.spin svg { width:calc(var(--hub) * .3); height:calc(var(--hub) * .3); flex:none; }
.spin .price { font-size:calc(var(--hub) * .27); font-weight:800; line-height:1; font-variant-numeric:tabular-nums; }
.spin:disabled { opacity:1; background:#bdbdbd; color:#333333; cursor:not-allowed; box-shadow:none;border-color:#777777; }
.spin.busy:disabled{background:var(--accent);color:var(--accent-ink)}
.spin:focus-visible, summary:focus-visible, .btn:focus-visible, input:focus-visible { outline:3px solid var(--gold); outline-offset:2px; }
.meta { display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-top:10px; font-size:13px; color:var(--muted); }
.meta b { color:var(--ink); }
.msg { min-height:20px; margin-top:6px; font-size:13px; color:var(--gold); }
details { margin-top:10px; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:10px 12px; }
summary { cursor:pointer; font-weight:700; font-size:14px; }
table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13px; }
th { text-align:left; font-weight:600; color:var(--muted); padding:3px 4px; }
td { overflow-wrap:anywhere; padding:5px 4px; border-top:1px solid var(--line); }
td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; }
.dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:7px; vertical-align:-1px; }
.rules{font-size:12px;line-height:1.5;color:var(--muted);margin:0 0 12px}.ev { margin:8px 0 0; font-size:12.5px; color:var(--muted); }
.ev b { color:var(--ink); }
.fair p { margin:8px 0 4px; font-size:12.5px; color:var(--muted); }
.code { font:12px/1.4 ui-monospace,Menlo,Consolas,monospace; word-break:break-all; color:var(--ink); background:rgba(0,0,0,.12); border-radius:8px; padding:6px 8px; }
.fair label { display:block; margin-top:8px; font-size:12.5px; color:var(--muted); }
.fair input { width:100%; margin-top:3px; padding:7px 9px; font:12px ui-monospace,Menlo,Consolas,monospace; color:var(--ink); background:rgba(0,0,0,.12); border:1px solid var(--line); border-radius:8px; }
.btn { margin-top:8px; font:inherit; font-size:13px; padding:7px 12px; border-radius:10px; cursor:pointer; border:1px solid var(--line); background:transparent; color:var(--ink); }
.btn:hover { background:rgba(127,127,127,.15); }
.vlog { margin-top:8px; font-size:12.5px; display:grid; gap:3px; }
.vlog .ok { color:#35c48a; } .vlog .bad { color:#ff6b5e; }
.res { position:absolute; inset:0; z-index:4; display:flex; align-items:center; justify-content:center; padding:18px; background:transparent; }
.res[hidden] { display:none; }
.card { width:100%; max-width:330px; text-align:center; background:var(--panel); border:1px solid var(--line); border-radius:20px; padding:20px 18px; }
.card.jp { border:2px solid var(--gold); box-shadow:0 0 0 6px rgba(255,200,87,.18); }
.card h3 { margin:0 0 4px; font-size:13px; font-weight:600; color:var(--muted); }
.card .prize { margin:0 0 10px; font-size:24px; font-weight:800; line-height:1.15; }
.card .chips { display:flex; justify-content:center; gap:6px; flex-wrap:wrap; margin-bottom:12px; font-size:12.5px; color:var(--muted); }
.card .chips span { border:1px solid var(--line); border-radius:99px; padding:3px 9px; }
.card .btn { margin:0; background:var(--accent); color:var(--accent-ink); border:0; font-weight:700; padding:9px 18px; }
.wallet-summary{width:max-content;max-width:100%;margin:10px auto 0;padding:7px 13px;border-radius:20px;background:#202a24f2;color:#edf0e4;font-size:12px;text-align:center}.details-open .wallet-summary{display:none}.details-open .stage,.details-open .msg{display:none}.details-open .info{margin:0 0 12px}.funding{display:block;margin:10px auto;background:var(--accent);color:var(--accent-ink)}.funding:hover,.funding:focus-visible{background:var(--accent);color:var(--accent-ink);border-color:var(--gold);box-shadow:0 0 0 2px var(--gold)}.funding[hidden]{display:none}.extra[hidden]{display:none}.extra{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:14px;margin-top:12px}
.info{display:block;margin:14px auto 0;background:#202a24ed;color:#e4e5d8;border:1px solid #c8ccad44;border-radius:30px;padding:9px 17px;font:500 12px system-ui;cursor:pointer}.info:focus-visible{outline:3px solid var(--gold)}
.msg:empty{display:none}.msg{border-radius:10px;text-align:center;background:#202a24ed;padding:8px;font-size:12px}.spin .spin-label{font-size:11px;letter-spacing:0;font-weight:600}.spin .unit{font-size:11px;font-weight:500}.spin{border-width:3px}.spin .price{font-weight:600}
.sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
`;

class PrizeWheel {
  constructor(host, { server, theme = 'night', viewerId }) {
    this.host = host; this.server = server; this.viewerId = viewerId;
    this.R = Math.random() * Math.PI * 2; this.busy = false; if (this.el) this.el.reveal.disabled = false; this.state = null; this.lastReq = null;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.root = host.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>${WIDGET_CSS}</style>
      <div class="w">
        <div class="stage"><canvas></canvas><div class="pointer"></div>
          <button class="spin" type="button" aria-label="Крутить колесо">
            <span class="spin-label">КРУТИТЬ</span>
            <span class="price">…</span><span class="unit">токенов</span>
          </button>
        </div>
        <div class="wallet-summary" aria-live="polite">Баланс: <strong class="visible-balance">…</strong></div>
        <div class="msg" role="status" aria-live="polite"></div>
        <button class="funding btn" hidden>Получить токены · демо +200</button>
        <button class="info" aria-expanded="false" aria-controls="wheel-details">ⓘ Детали</button>
        <div class="extra" id="wheel-details" hidden><p class="rules">Только впечатления, без денежных выигрышей. Возможен исход без приза. Секторы декоративные; точные шансы указаны ниже.</p>
        <div class="meta"><span>Баланс: <b class="bal">…</b></span><span>Потрачено за сессию: <b class="lim">…</b></span></div>
        <details class="odds"><summary>Шансы призов</summary>
          <table><thead><tr><th>Приз</th><th class="n">Шанс</th></tr></thead><tbody></tbody></table>
          <p class="ev"></p>
        </details>
        <details class="fair"><summary>Проверка честности</summary>
          <p>Хэш серверного seed, опубликованный до вращений текущей серии:</p>
          <div class="code commit">…</div>
          <label>Ваш client seed (можно менять)<input class="cseed" spellcheck="false" autocomplete="off"></label>
          <p>Следующий nonce: <b class="nonce">0</b>. Результат = HMAC-SHA256(server seed, «client seed:nonce») → число от 0 до 999999 → приз по кумулятивным шансам.</p>
          <button class="btn reveal" type="button">Раскрыть seed и проверить вращения</button>
          <div class="vlog" aria-live="polite"></div>
        </details>
        </div>
        <div class="res" hidden>
          <div class="card" role="dialog" aria-label="Результат вращения">
            <h3>Выпало</h3><p class="prize"></p><div class="chips"></div>
            <button class="btn close" type="button">Закрыть</button>
          </div>
        </div>
      </div>`;
    const $ = (s) => this.root.querySelector(s);
    this.el = { stage: $('.stage'), cv: $('canvas'), btn: $('.spin'), price: $('.spin .price'), bal: $('.bal'), lim: $('.lim'),
      msg: $('.msg'), tbody: $('tbody'), ev: $('.ev'), commit: $('.commit'), cseed: $('.cseed'), nonce: $('.nonce'),
      reveal: $('.reveal'), vlog: $('.vlog'), res: $('.res'), prize: $('.prize'), chips: $('.chips'), card: $('.card'), close: $('.close') };
    this.root.querySelector('.info').onclick=()=>this.setDetails(!this.detailsOpen);
    this.el.cseed.value = hex(crypto.getRandomValues(new Uint8Array(4)));
    this.el.btn.addEventListener('click', () => this.spin());
    this.root.querySelector('.funding').onclick=()=>this.emit('wallet.request',{});
    this.el.close.addEventListener('click', () => this.closeResult());
    this.el.reveal.addEventListener('click', () => this.revealAndVerify());
    // Пересчёт размера выносим в rAF и делаем только при смене ширины: так не возникает
    // безобидной, но шумной ошибки "ResizeObserver loop completed with undelivered notifications".
    let lastW = 0, raf = 0;
    new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w === lastW) return;
      lastW = w;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => this.resize());
    }).observe(host);
    this.setTheme(THEMES[theme] || THEMES.night);
    this.ready = this.refresh(true);
  }

  setDetails(open) {
    this.detailsOpen=!!open;
    this.root.querySelector('.extra').hidden=!open;
    this.root.querySelector('.w').classList.toggle('details-open',!!open);
    const button=this.root.querySelector('.info');
    button.setAttribute('aria-expanded',String(!!open));
    button.textContent=open?'← К колесу':'ⓘ Детали';
    this.emit('details.toggle',{open:!!open});
    if(!open){this.resize();button.focus();}
  }

  // ---- публичный API виджета ----
  setTheme(t) { Object.entries(t).forEach(([k, v]) => this.host.style.setProperty('--' + k, v)); this.draw(); }
  async refresh(rebuild = false) {
    this.state = await this.server.getState();
    this.renderOdds();
    this.render(); this.resize();
  }
  emit(type, payload) {
    this.host.dispatchEvent(new CustomEvent('prizewheel', { detail: { type, payload }, bubbles: true, composed: true }));
    // Host integration uses the scoped prizewheel CustomEvent.   // запасной канал для страницы платформы
  }

  // ---- отрисовка ----
  renderOdds() {
    const s = this.state;
    this.el.tbody.innerHTML = s.items.map((i) =>
      `<tr><td><span class="dot" style="background:${i.color}"></span>${esc(i.title)}</td>
       <td class="n">${(i.ppm / 10000).toFixed(4)}%</td></tr>`).join('');
    this.el.ev.innerHTML = `Цена вращения: <b>${tk(s.price)}</b>. Шансы фиксированы до конца серии. Версия колеса ${s.version}, хэш конфигурации ${s.configHash}.`;
  }
  render() {
    const s = this.state, b = this.el;
    b.bal.textContent = tk(s.balance);
    this.root.querySelector('.visible-balance').textContent=tk(s.balance);
    b.lim.textContent = tk(s.spent);
    b.price.textContent = s.price;
    b.btn.setAttribute('aria-label', `Крутить колесо за ${tk(s.price)}`);
    b.commit.textContent = s.epoch.commit;
    b.nonce.textContent = s.epoch.nextNonce;
    let msg = '', off = this.busy || this.verifying;
    if (!s.available) { msg = 'Ведущий приостановил вращения.'; off = true; }
    else if (s.balance < s.price) { msg = 'Недостаточно токенов. Получите токены, чтобы продолжить.'; off = true; }
    if (!this.busy && msg) b.msg.textContent = msg;
    else if (!this.busy && !this.keepMsg) b.msg.textContent = '';
    b.btn.classList.toggle('busy', this.busy);
    b.btn.disabled = off;
    this.root.querySelector('.funding').hidden = s.balance >= s.price || this.busy || !s.available;
    document.dispatchEvent(new CustomEvent('wheel-state', { detail: s }));
  }
  resize() {
    const w = Math.min(this.el.stage.parentElement.clientWidth - 32, 380);
    const size = Math.max(180, w || 300);
    this.size = size; this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.el.cv.width = size * this.dpr; this.el.cv.height = size * this.dpr;
    this.el.cv.style.width = size + 'px'; this.el.cv.style.height = size + 'px';
    this.el.stage.style.width = size + 'px';
    this.el.stage.style.setProperty('--hub', Math.max(92, Math.round(size * 0.29)) + 'px');
    this.draw();
  }
  draw() {
    if (!this.state || !this.size) return;
    const css = getComputedStyle(this.host), v = (n) => css.getPropertyValue(n).trim();
    const ctx = this.el.cv.getContext('2d'), s = this.size, items = this.state.items, n = items.length;
    const a = (Math.PI * 2) / n, cx = s / 2, cy = s / 2, r = s / 2 - 12;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, s, s);
    ctx.beginPath(); ctx.arc(cx, cy, r + 9, 0, Math.PI * 2); ctx.fillStyle = v('--panel'); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = v('--line'); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const a0 = this.R + i * a - Math.PI / 2, a1 = a0 + a;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1); ctx.closePath();
      ctx.fillStyle = items[i].color; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = v('--bg'); ctx.stroke();
      // Reserve the center button and rim; wrap phrases inside each sector.
      const mid=a0+a/2, radius=r*0.67, maxWidth=r*0.48;
      ctx.save();ctx.translate(cx+Math.cos(mid)*radius,cy+Math.sin(mid)*radius);
      ctx.rotate(mid+(Math.cos(mid)<0?Math.PI:0));
      ctx.fillStyle=this.textOn(items[i].color);ctx.textAlign='center';ctx.textBaseline='middle';
      const lines=items[i].label.split(' ');let font=Math.round(s*0.04);
      ctx.font=`600 ${font}px system-ui`;
      while(font>9&&lines.some(line=>ctx.measureText(line).width>maxWidth)){font--;ctx.font=`600 ${font}px system-ui`;}
      lines.forEach((line,j)=>ctx.fillText(line,0,(j-(lines.length-1)/2)*(font+3)));
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.17, 0, Math.PI * 2); ctx.fillStyle = v('--panel'); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = v('--accent'); ctx.stroke();
  }
  textOn(hexColor) {
    const h = hexColor.replace('#', ''), c = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255)
      .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.4 ? '#1b1636' : '#ffffff';
  }
  animateTo(idx) {   // чисто косметика: итог уже определён сервером
    return new Promise((resolve) => {
      const TAU = Math.PI * 2, n = this.state.items.length, a = TAU / n;
      const jitter = 0; // Land at the center, never stage a near miss.
      const target = ((((-(idx + 0.5) * a + jitter) % TAU) + TAU) % TAU);
      const cur = ((this.R % TAU) + TAU) % TAU;
      const delta = ((target - cur + TAU) % TAU) + TAU * (5 + Math.floor(Math.random() * 2));
      const start = this.R, dur = this.reduced ? 0 : 3200, t0 = performance.now();
      let lastTick = Math.floor(start / a);
      const step = (now) => {
        const t = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - t, 4);
        this.R = start + delta * e; this.draw();
        const tick = Math.floor(this.R / a);
        if (tick !== lastTick) { lastTick = tick; if (!this.reduced && navigator.vibrate) navigator.vibrate(6); }
        t < 1 ? requestAnimationFrame(step) : resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // ---- вращение ----
  async spin() {
    if (this.busy || this.verifying || !this.state) return;
    this.busy = true; this.el.reveal.disabled = true; this.keepMsg = false; this.closeResult();
    this.el.btn.classList.add('busy'); this.el.btn.disabled = true; this.el.msg.textContent = 'Списываем токены…';
    const req = { version:this.state.version, key: uid(), clientSeed: this.el.cseed.value.trim() || 'anon', viewerId: this.viewerId };
    this.lastReq = req;
    this.emit('spin.requested', { key: req.key, viewerId: this.viewerId });
    let res;
    try {
      res = await this.server.spin(req);
    } catch (e) {
      const texts = { WHEEL_UPDATED:'Колесо обновилось. Проверьте новые условия. Токены не списаны.', INSUFFICIENT_FUNDS: 'Не хватает токенов.',
        JURISDICTION_BLOCKED: 'Ведущий приостановил вращения.', SPIN_IN_PROGRESS: 'Предыдущее вращение ещё идёт.' };
      this.busy = false; if (this.el) this.el.reveal.disabled = false; this.el.msg.textContent = texts[e.code] || 'Ошибка. Токены не списаны, попробуйте ещё раз.';
      this.keepMsg = true; await this.refresh(); return;
    }
    if(res.items)this.state.items=res.items;
    const item = this.state.items[res.itemIndex];
    this.el.msg.textContent = 'Колесо крутится…';
    this.emit('spin.started', { spinId: res.id, viewerId: this.viewerId, price: res.price });
    await this.animateTo(res.itemIndex);
    this.busy = false; if (this.el) this.el.reveal.disabled = false;
    this.showResult(item, res);
    // В продакшене сервер публикует «выпало» в чат с reveal_at = конец анимации, чтобы не спойлерить итог.
    this.emit('spin.resolved', { spinId: res.id, viewerId: this.viewerId, price: res.price,
      item: { id: item.id, title: item.title, menu: item.menu, kind: item.kind },
      proof: { epochId: res.epochId, commit: res.commit, nonce: res.nonce, clientSeed: res.clientSeed } });
    this.keepMsg = false; this.el.msg.textContent = '';
    await this.refresh();
  }
  showResult(item, res) {
    this.el.card.classList.toggle('jp', item.kind === 'jackpot');
    this.el.prize.textContent = item.kind === 'jackpot' ? `Особый приз: ${item.title}` : item.title;
    this.el.card.querySelector('h3').textContent = item.kind==='none'?'Вращение завершено':'Ваш приз';
    this.el.chips.innerHTML = `<span>Вы заплатили ${tk(res.price)}</span>`;
    this.el.res.hidden = false; this.el.close.focus();
  }
  closeResult() { this.el.res.hidden = true; }

  // ---- provably fair ----
  async revealAndVerify() {
    if (this.busy || this.verifying) return;
    this.verifying = true; this.render();
    const out = this.el.vlog; out.innerHTML = '';
    const line = (cls, text) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; out.appendChild(d); };
    this.el.reveal.disabled = true;
    try {
      const r = await this.server.revealEpoch();
      const hashOk = (await sha256Hex(r.seed)) === r.commit && r.commit === this.state.epoch.commit;
      line(hashOk ? 'ok' : 'bad', `${hashOk ? '✓' : '✗'} Серия ${r.epochId}: SHA-256(seed) совпадает с опубликованным хэшем`);
      if (!r.spins.length) line('', 'В этой серии не было вращений.');
      for (const sp of r.spins) {
        const ppm = await rollPpm(r.seed, sp.clientSeed, sp.nonce);
        const proofItems=sp.itemsSnapshot||this.state.items;
        const idx = pickIndex(proofItems, ppm), ok = proofItems[idx].id === sp.itemId && sp.commit === r.commit;
        line(ok ? 'ok' : 'bad', `${ok ? '✓' : '✗'} nonce ${sp.nonce}: число ${ppm} → «${proofItems[idx].label}»`);
      }
      this.el.cseed.value = hex(crypto.getRandomValues(new Uint8Array(4)));
      await this.refresh();
    } catch (e) { line('bad', e.message); } finally { this.verifying = false; this.el.reveal.disabled = false; this.render(); }
  }
}


export {PrizeWheel, THEMES};
