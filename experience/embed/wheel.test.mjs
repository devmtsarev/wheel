import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./wheel.js',import.meta.url),'utf8');
function setup(duplicate=false,themeTools){
  const classes=new Set(),attributes={},events=[],handlers={},keys={};let mounted=0;
  const messages=[],frameHandlers={};const frame={src:'',contentWindow:{postMessage:(value,origin)=>messages.push({value,origin})},focus(){},addEventListener:(type,fn)=>frameHandlers[type]=fn};
  const panel={classList:{toggle(k,on){on?classes.add(k):classes.delete(k);}},setAttribute(k,v){attributes[k]=v;}};
  const button={classList:{toggle(){}},setAttribute(){},focus(){}};
  const root={querySelector:s=>s==='iframe'?frame:s==='section'?panel:button,addEventListener:(n,fn)=>keys[n]=fn};
  const properties={},host={style:{setProperty:(key,value)=>properties[key]=value},dataset:{},attachShadow:()=>root,dispatchEvent:e=>events.push(e)};
  const document={currentScript:{src:'https://widget.example/experience/embed/wheel.js',dataset:{}},head:{append(){}},querySelector:()=>duplicate?{}:null,createElement:tag=>tag==='script'?{}:host,body:{append(){mounted++;}}};
  vm.runInNewContext(source,{WheelHostTheme:themeTools,URL,document,location:{origin:'https://host.example'},window:{addEventListener:(n,fn)=>handlers[n]=fn},CustomEvent:class{constructor(type,options){this.type=type;Object.assign(this,options);}}});
  return {frame,messages,properties,frameHandlers,button,classes,attributes,events,handlers,keys,get mounted(){return mounted;}};
}
test('embed opens the isolated player with the correct parent origin and can close',()=>{const m=setup();m.button.onclick();const url=new URL(m.frame.src);assert.equal(url.origin,'https://widget.example');assert.equal(url.pathname,'/experience/player/');assert.equal(url.searchParams.get('parentOrigin'),'https://host.example');assert.equal(m.attributes['aria-hidden'],'false');m.keys.keydown({key:'Escape'});assert.equal(m.attributes['aria-hidden'],'true');});
test('embed rejects messages with forged origins, windows or source names',()=>{const m=setup(),payload={spinId:'spin'},good={origin:'https://widget.example',source:m.frame.contentWindow,data:{source:'wheel-player',type:'spin.resolved',payload}};for(const bad of [{...good,origin:'https://evil.example'},{...good,source:{}},{...good,data:{...good.data,source:'other'}}])m.handlers.message(bad);assert.equal(m.events.length,0);m.handlers.message(good);assert.equal(m.events.length,1);assert.equal(m.events[0].type,'wheel:spin');assert.equal(m.events[0].detail,payload);m.button.onclick();m.handlers.message({...good,data:{source:'wheel-player',type:'close'}});assert.equal(m.attributes['aria-hidden'],'true');});
test('loading the embed twice does not create another launcher',()=>{assert.equal(setup(true).mounted,0);});

test('host palette reaches only the widget origin on load, ready and live changes',()=>{
  let change;const tools={watch(doc,win,host,fn){change=fn;fn({background:'#ffffff',accent:'#2244aa'});},create(value){return {accent:value.accent,'accent-ink':'#ffffff',line:'#aaaaaa',focus:'#2244aa'};}};
  const m=setup(false,tools);assert.equal(m.properties['--wheel-accent'],'#2244aa');assert.equal(m.messages.length,0);
  m.button.onclick();m.frameHandlers.load();assert.equal(m.messages[0].origin,'https://widget.example');assert.equal(m.messages[0].value.payload.accent,'#2244aa');
  const ready={origin:'https://widget.example',source:m.frame.contentWindow,data:{source:'wheel-player',type:'ready'}};
  m.handlers.message({...ready,origin:'https://other.example'});assert.equal(m.messages.length,1);
  m.handlers.message(ready);assert.equal(m.messages.length,2);
  change({background:'#111111',accent:'#cc88ee'});assert.equal(m.messages.at(-1).value.payload.accent,'#cc88ee');
});
