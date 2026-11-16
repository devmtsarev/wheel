/* Shared by the classic embed script and the module-based player. No host content leaves the page. */
(function (root) {
  'use strict';
  const isHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const hex = values => '#' + values.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, amount) => hex(rgb(a).map((v, i) => v * (1 - amount) + rgb(b)[i] * amount));
  function luminance(color) {
    const c = rgb(color).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  }
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  const textOn = color => contrast(color, '#000000') >= contrast(color, '#ffffff') ? '#000000' : '#ffffff';
  function readable(preferred, surface, minimum = 4.5) {
    if (contrast(preferred, surface) >= minimum) return preferred;
    const target = textOn(surface);
    for (let i = 1; i <= 20; i++) { const c = mix(preferred, target, i / 20); if (contrast(c, surface) >= minimum) return c; }
    return target;
  }
  function validate(value) {
    return value && isHex(value.background) && isHex(value.accent) ? { background: value.background, accent: value.accent } : null;
  }
  function create(value) {
    const colors = validate(value); if (!colors) return null;
    const { background, accent } = colors, dark = luminance(background) < 0.18;
    const panel = mix(background, dark ? '#ffffff' : '#000000', dark ? 0.07 : 0.025);
    const ink = textOn(panel), muted = readable(mix(panel, ink, 0.58), panel);
    return { bg: background, panel, ink, muted, accent, 'accent-ink': textOn(accent),
      gold: readable(accent, panel), line: mix(panel, ink, 0.25),
      focus: readable(accent, background, 3), sectors: [0.82, 0.25, 0.64, 0.38, 0.94, 0.5, 0.72, 0.16, 0.57, 0.32, 0.88, 0.44].map(t => mix(panel, accent, t)) };
  }
  function fromMessage(event, parentOrigin, parentWindow) {
    if (!parentOrigin || parentOrigin === 'null' || event.origin !== parentOrigin || event.source !== parentWindow || event.data?.source !== 'wheel-host' || event.data.type !== 'theme') return null;
    return validate(event.data.payload);
  }
  function watch(doc, win, excluded, callback, options = {}) {
    const canvas = doc.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return () => {};
    function parse(value) {
      if (!value || !win.CSS.supports('color', value)) return null;
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
      const bytes = ctx.getImageData(0, 0, 1, 1).data;
      return { color: hex(Array.from(bytes).slice(0, 3)), alpha: bytes[3] / 255 };
    }
    const scheme = win.matchMedia('(prefers-color-scheme: dark)');
    const own = element => element === excluded || excluded.contains(element);
    function visible(element) {
      const rect = element.getBoundingClientRect(), css = win.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < win.innerHeight && rect.left < win.innerWidth && css.visibility !== 'hidden' && css.display !== 'none' && Number(css.opacity) > 0;
    }
    function backdrop() {
      // Composite declared CSS colors, not pixels from images/video or private frame contents.
      let color = scheme.matches ? '#181818' : '#ffffff';
      const sample = doc.elementsFromPoint(Math.max(0, win.innerWidth - 180), Math.max(0, win.innerHeight - 270)).find(el => !own(el));
      const chain = []; for (let el = sample || doc.body; el; el = el.parentElement) chain.unshift(el);
      for (const el of chain) { const c = parse(win.getComputedStyle(el).backgroundColor); if (c && c.alpha) color = mix(color, c.color, c.alpha); }
      return color;
    }
    function extract() {
      const background = isHex(options.background) ? options.background : backdrop();
      let accent = isHex(options.accent) ? options.accent : null;
      // Prefer explicitly declared brand tokens, then visible filled controls and links.
      for (const element of [doc.body, doc.documentElement]) {
        const css = win.getComputedStyle(element);
        for (const key of ['--accent-color', '--brand-color', '--color-primary', '--primary-color', '--accent', '--primary']) {
          const c = parse(css.getPropertyValue(key).trim());
          if (!accent && c && c.alpha >= 0.95) accent = c.color;
        }
      }
      if (!accent) {
        let best = -1;
        for (const element of Array.from(doc.querySelectorAll('button, [role="button"], a[href]')).slice(0, 64)) {
          if (own(element) || !visible(element)) continue;
          const css = win.getComputedStyle(element);
          for (const [value, weight] of [[css.backgroundColor, 2], [css.color, 1]]) {
            const c = parse(value); if (!c || c.alpha < 0.95) continue;
            const channels = rgb(c.color), saturation = (Math.max(...channels) - Math.min(...channels)) / 255;
            const score = saturation * weight;
            if (saturation > 0.12 && score > best) { best = score; accent = c.color; }
          }
        }
      }
      return { background, accent: accent || (luminance(background) < 0.18 ? '#b9c9e8' : '#405575') };
    }
    let timer=null, last = '', stopped = false;
    function update() {
      if (stopped) return;
      const value = extract(), key = JSON.stringify(value);
      if (key !== last) { last = key; callback(value); }
    }
    function schedule() { if(timer!==null||stopped)return; timer=win.setTimeout(()=>{timer=null;update();},120); }
    const observer = new win.MutationObserver(records => { if (records.some(r => !own(r.target))) schedule(); });
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true });
    scheme.addEventListener('change', schedule);
    win.addEventListener('resize', schedule); win.addEventListener('scroll', schedule, {passive:true}); win.addEventListener('wheel:theme-refresh', schedule);
    doc.addEventListener('load', schedule, true); doc.addEventListener('transitionend', schedule, true);
    update();
    return () => { stopped = true; observer.disconnect(); win.clearTimeout(timer); scheme.removeEventListener('change', schedule);
      win.removeEventListener('resize', schedule); win.removeEventListener('scroll', schedule); win.removeEventListener('wheel:theme-refresh', schedule);
      doc.removeEventListener('load', schedule, true); doc.removeEventListener('transitionend', schedule, true); };
  }
  root.WheelHostTheme = Object.freeze({ validate, create, fromMessage, watch, contrast, textOn });
})(globalThis);
