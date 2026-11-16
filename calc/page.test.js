// Exercise the actual built calculator scripts and event handlers with a small DOM adapter.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'page.src.html'), 'utf8');
const model = fs.readFileSync(path.join(__dirname, 'model.js'), 'utf8');
const built = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
function page(hash = '') {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', events: {}, addEventListener(type, fn) { this.events[type] = fn; } });
    return elements.get(id);
  };
  const context = vm.createContext({ document: { querySelector: element }, window: { addEventListener() {} },
    location: { hash, search: '', protocol: 'https:', href: 'https://example.com/wheel/calc/' },
    URLSearchParams, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {} });
  for (const script of built.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(script[1], context);
  return { element, run: (code) => vm.runInContext(code, context) };
}
test('Pages calculator contains the current source and model', () => {
  assert.ok(built.includes(source.replace('/*__MODEL__*/', () => model)));
});
test('suggested weights pass validation after applying, editing and sharing', () => {
  const p = page('#gamma=1');
  p.element('#suggest').events.click();
  const validation = () => p.run('M.validate(st.items, model())');
  assert.equal(validation().ok, true, JSON.stringify(validation())); assert.ok(validation().cv <= 2 + 1e-9);
  assert.ok(!p.element('#m-sug').textContent.includes('не проходит'));
  const weight = p.run('st.items[0].w');
  p.element('#menu').events.input({ target: { dataset: { i: '0', k: 'w' }, value: String(weight) } });
  assert.equal(p.run('st.items[0].w'), weight); assert.equal(validation().ok, true);
  const restored = page('#' + p.run('paramString()'));
  assert.equal(restored.run('st.items[0].w'), weight);
  assert.equal(restored.run('M.validate(st.items, model()).ok'), true);
});
test('suggestion status reports full validation failures, including price feasibility', () => {
  const p = page('#gamma=1&mu=1&delta=0.3');
  p.element('#suggest').events.click();
  assert.equal(p.run('M.validate(st.items, model()).ok'), false);
  assert.ok(p.element('#m-sug').textContent.includes('не проходит'));
});
