import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./wheel.js',import.meta.url),'utf8');
function setup(duplicate=false){
  const classes=new Set(),attributes={},events=[],handlers={},keys={};let mounted=0;
  const frame={src:'',contentWindow:{},focus(){}};
  const panel={classList:{toggle(k,on){on?classes.add(k):classes.delete(k);}},setAttribute(k,v){attributes[k]=v;}};
  const button={classList:{toggle(){}},setAttribute(){},focus(){}};
  const root={querySelector:s=>s==='iframe'?frame:s==='section'?panel:button,addEventListener:(n,fn)=>keys[n]=fn};
  const host={dataset:{},attachShadow:()=>root,dispatchEvent:e=>events.push(e)};
  const document={currentScript:{src:'https://widget.example/experience/embed/wheel.js'},querySelector:()=>duplicate?{}:null,createElement:()=>host,body:{append(){mounted++;}}};
  vm.runInNewContext(source,{URL,document,location:{origin:'https://host.example'},window:{addEventListener:(n,fn)=>handlers[n]=fn},CustomEvent:class{constructor(type,options){this.type=type;Object.assign(this,options);}}});
  return {frame,button,classes,attributes,events,handlers,keys,get mounted(){return mounted;}};
}
test('embed opens the isolated player with the correct parent origin and can close',()=>{const m=setup();m.button.onclick();const url=new URL(m.frame.src);assert.equal(url.origin,'https://widget.example');assert.equal(url.pathname,'/experience/player/');assert.equal(url.searchParams.get('parentOrigin'),'https://host.example');assert.equal(m.attributes['aria-hidden'],'false');m.keys.keydown({key:'Escape'});assert.equal(m.attributes['aria-hidden'],'true');});
test('embed rejects messages with forged origins, windows or source names',()=>{const m=setup(),payload={spinId:'spin'},good={origin:'https://widget.example',source:m.frame.contentWindow,data:{source:'wheel-player',type:'spin.resolved',payload}};for(const bad of [{...good,origin:'https://evil.example'},{...good,source:{}},{...good,data:{...good.data,source:'other'}}])m.handlers.message(bad);assert.equal(m.events.length,0);m.handlers.message(good);assert.equal(m.events.length,1);assert.equal(m.events[0].type,'wheel:spin');assert.equal(m.events[0].detail,payload);m.button.onclick();m.handlers.message({...good,data:{source:'wheel-player',type:'close'}});assert.equal(m.attributes['aria-hidden'],'true');});
test('loading the embed twice does not create another launcher',()=>{assert.equal(setup(true).mounted,0);});
