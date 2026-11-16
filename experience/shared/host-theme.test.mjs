import test from 'node:test';
import assert from 'node:assert/strict';
import './host-theme.js';
const T=globalThis.WheelHostTheme;
test('site palettes keep text readable on controls, panels and every sector',()=>{
  for(const background of ['#ffffff','#151020','#faf0da','#707070'])for(const accent of ['#ffffff','#000000','#0000ff','#ff0000','#b78cff','#eeee00']){
    const p=T.create({background,accent});assert.equal(p.accent,accent);
    assert.ok(T.contrast(p.ink,p.panel)>=4.5);assert.ok(T.contrast(p.muted,p.panel)>=4.5);
    assert.ok(T.contrast(p['accent-ink'],p.accent)>=4.5);assert.ok(T.contrast(p.gold,p.panel)>=4.5);
    assert.ok(T.contrast(p.focus,p.bg)>=3);
    for(const color of p.sectors)assert.ok(T.contrast(T.textOn(color),color)>=4.5);
  }
});
test('player accepts only normalized color messages from its declared parent',()=>{
  const parent={},good={origin:'https://host.example',source:parent,data:{source:'wheel-host',type:'theme',payload:{background:'#ffffff',accent:'#336699',extra:'ignored'}}};
  assert.deepEqual(T.fromMessage(good,good.origin,parent),{background:'#ffffff',accent:'#336699'});
  for(const event of [{...good,origin:'https://evil.example'},{...good,source:{}},{...good,data:{...good.data,source:'other'}},{...good,data:{...good.data,payload:{background:'url(https://evil.example)',accent:'#336699'}}}])assert.equal(T.fromMessage(event,good.origin,parent),null);
  assert.equal(T.fromMessage(good,'null',parent),null);assert.equal(T.create({background:'#fff',accent:'#336699'}),null);
});
function fixture(){
  const events={},timers=new Map();let serial=0,observe,schemeChange,pixel=[0,0,0,0];
  const css=(backgroundColor,color='#222222',props={})=>({backgroundColor,color,opacity:'1',visibility:'visible',display:'block',getPropertyValue:k=>props[k]||''});
  const root={css:css('#ffffff'),parentElement:null},body={css:css('rgba(0,0,0,0)'),parentElement:root};
  const button={css:css('#6633cc','#ffffff'),parentElement:body,getBoundingClientRect:()=>({width:100,height:40,left:20,top:20,right:120,bottom:60})};
  const host={parentElement:body,contains:el=>el===host};
  const context={clearRect(){pixel=[0,0,0,0];},fillRect(){const v=this.fillStyle;if(v.startsWith('#'))pixel=[1,3,5].map(i=>parseInt(v.slice(i,i+2),16)).concat(255);else pixel=[0,0,0,0];},getImageData:()=>({data:pixel})};
  const doc={body,documentElement:root,createElement:()=>({getContext:()=>context}),elementsFromPoint:()=>[host,body,root],querySelectorAll:()=>[button],addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n]};
  const win={innerWidth:1000,innerHeight:800,CSS:{supports:(_,v)=>/^#[0-9a-f]{6}$|^rgba\(0,0,0,0\)$/.test(v)},getComputedStyle:el=>el.css,matchMedia:()=>({matches:false,addEventListener:(n,f)=>schemeChange=f,removeEventListener(){}}),MutationObserver:class{constructor(fn){observe=fn;}observe(){}disconnect(){}},clearTimeout:id=>timers.delete(id),setTimeout:fn=>{timers.set(++serial,fn);return serial;},addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n]};
  const flush=()=>{for(const fn of timers.values())fn();timers.clear();};
  return {doc,win,host,body,button,root,css,flush,mutate:target=>observe([{target}]),scheme:()=>schemeChange()};
}
test('extracts visible host colors, tracks theme changes and ignores its own mutations',()=>{
  const f=fixture(),seen=[],stop=T.watch(f.doc,f.win,f.host,p=>seen.push(p));
  assert.deepEqual(seen.at(-1),{background:'#ffffff',accent:'#6633cc'});
  f.body.css=f.css('#151020','#ffffff');f.button.css=f.css('#bb88ff','#000000');
  f.mutate(f.body);f.flush();assert.deepEqual(seen.at(-1),{background:'#151020',accent:'#bb88ff'});
  const count=seen.length;f.mutate(f.host);f.flush();f.scheme();f.flush();assert.equal(seen.length,count);
  stop();f.body.css=f.css('#ffffff');f.mutate(f.body);f.flush();assert.equal(seen.length,count);
});
test('declared brand tokens and explicit overrides take precedence over sampled controls',()=>{
  const f=fixture(),seen=[];f.body.css=f.css('#ffffff','#222222',{'--accent':'#aa3300'});
  T.watch(f.doc,f.win,f.host,p=>seen.push(p));assert.equal(seen.at(-1).accent,'#aa3300');
  T.watch(f.doc,f.win,f.host,p=>seen.push(p),{accent:'#008855',background:'#222222'});
  assert.deepEqual(seen.at(-1),{accent:'#008855',background:'#222222'});
});
