import {hex,sha256Hex,rollPpm} from './fairness.js';
/* Browser-local demo adapter. Production must replace this with authenticated server APIs. */
export const KEY = 'wheel-experience-v1';
const ORIGINAL_PRIZES = [
  {id:'thanks',name:'A personal thank you',short:'Thank you',value:5,weight:22,color:'#5c638c'},
  {id:'kiss',name:'An air kiss',short:'Air kiss',value:15,weight:20,color:'#a687b8'},
  {id:'compliment',name:'A compliment for you',short:'Compliment',value:20,weight:17,color:'#d295a6'},
  {id:'question',name:'Ask me anything',short:'Ask anything',value:40,weight:13,color:'#a7bcbc'},
  {id:'song',name:'Pick the next song',short:'Pick a song',value:60,weight:11,color:'#7d9b8e'},
  {id:'dance',name:'A one-minute dance',short:'Dance',value:100,weight:9,color:'#d2af7d'},
  {id:'look',name:'Choose the next look',short:'New look',value:200,weight:6,color:'#bb796c'},
  {id:'jackpot',name:'Your special request',short:'Jackpot',value:500,weight:2,color:'#e8ca86'}
];
// Experiences only: no cash, token prizes, transfers or cash-out path.
export const PRIZES = [...ORIGINAL_PRIZES.map(p=>({...p,weight:Math.round(p.weight*80)/100,kind:'experience'})),{id:'none',name:'No prize this time',short:'No prize',value:0,weight:20,color:'#35423e',kind:'none'}];
const DEFAULT_TITLES=['Спасибо в чат','Воздушный поцелуй','Комплимент зрителю','Ответ на любой вопрос','Песня (куплет)','Танец, 1 минута','Смена образа','Особый номер на выбор зрителя','В этот раз без приза'];
const DEFAULT_COLORS=['#536b5a','#84917a','#405a51','#aaad87','#60765d','#c7b78b','#698b7d','#e1c781','#343d38'];
const DEFAULT_LABELS=['Спасибо','Поцелуй','Комплимент','Вопрос','Песня','Танец','Новый образ','Особый приз','Без приза'];
const defaultMenu=()=>PRIZES.map((p,i)=>({...p,title:DEFAULT_TITLES[i],label:DEFAULT_LABELS[i],color:DEFAULT_COLORS[i]}));
// Inverse-price odds: p_i = spin price / ((1 + markup/100) * action count * direct price).
// Round down to integer ppm and assign the remainder to no prize.
export function priceMenu(menu,price,markup){
  if(!Number.isSafeInteger(price)||price<1)throw new Error('Choose a positive whole-token spin price within numeric precision.');
  if(!Number.isFinite(markup)||markup<=0)throw new Error('Markup must be a positive finite percentage.');
  const actions=menu.filter(p=>p.kind!=='none');
  if(!actions.length||actions.some(p=>!Number.isSafeInteger(p.value)||p.value<1))throw new Error('Direct-purchase prices must be positive whole tokens within numeric precision.');
  const target=price/(1+markup/100),share=target/actions.length;
  const probabilities=actions.map(p=>share/p.value),total=probabilities.reduce((a,b)=>a+b,0);
  const maxPrice=(1+markup/100)*actions.length/actions.reduce((n,p)=>n+1/p.value,0);
  if(total>1+1e-12)throw new Error(`Action chances total ${(total*100).toFixed(2)}%. Lower the spin price to at most ${Math.floor(maxPrice)} tokens, raise the overhead, or revise direct prices.`);
  const ppms=probabilities.map(p=>Math.floor(p*1e6));
  if(ppms.some(p=>p<1))throw new Error('An action chance is below the current 1-in-1,000,000 draw precision. Adjust the price ratio or overhead.');
  ppms.push(1e6-ppms.reduce((a,b)=>a+b,0));
  const empty=menu.find(p=>p.kind==='none')||defaultMenu().at(-1);
  const calculated=[...actions,{...empty,id:'none',kind:'none',value:0}].map((p,i)=>({...p,weight:ppms[i]/10000}));
  const ev=calculated.reduce((n,p)=>n+p.value*(p.weight/100),0);
  return {menu:calculated,ev,target,actualMarkup:(price/ev-1)*100,maxPrice};
}
export function automaticPricing(menu,markup,targetWinProbability=0.8){
  if(!Number.isFinite(targetWinProbability)||targetWinProbability<=0||targetWinProbability>=1)throw new Error('Win frequency must be between zero and one, with an empty outcome.');
  const actions=menu.filter(p=>p.kind!=='none');
  if(!actions.length||actions.some(p=>!Number.isSafeInteger(p.value)||p.value<1))throw new Error('Direct-purchase prices must be positive whole tokens within numeric precision.');
  if(!Number.isFinite(markup)||markup<=0)throw new Error('Markup must be a positive finite percentage.');
  const maxPrice=(1+markup/100)*actions.length/actions.reduce((n,p)=>n+1/p.value,0);
  // Default pacing is 20% no prize; the experimental demo can supply another target.
  const price=Math.max(1,Math.floor(maxPrice*targetWinProbability));
  return {...priceMenu(menu,price,markup),price};
}
export function menuFor(s){return s.menu||automaticPricing(defaultMenu(),s.markup??20,s.targetWinProbability??0.8).menu;}
export function widgetItems(menu){return menu.map(p=>({id:p.id,title:p.title||p.name,label:p.label||p.short,menu:p.value,ppm:Math.round(p.weight*10000),color:p.color,kind:p.kind==='none'?'none':p.id==='jackpot'?'jackpot':'regular'}));}
export function saveMenu(menu,expectedVersion,pricing={}){return transact(async s=>{
  if(s.version!==expectedVersion)throw new Error('The wheel changed in another view. Reload the menu before saving.');
  if(!Array.isArray(menu)||menu.length<2||menu.length>12)throw new Error('Use between 2 and 12 options.');
  const ids=new Set();
  const clean=menu.map(p=>{
    if(typeof p.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id)||ids.has(p.id))throw new Error('Option IDs must be unique.');ids.add(p.id);
    const title=String(p.title||'').trim(),label=String(p.label||'').trim();
    if(!title||title.length>80||!label||label.length>16||label.split(/\s+/).length>3)throw new Error('Use a prize name (1–80 characters) and a short wheel label (1–16 characters, up to 3 words).');
    if(!['experience','none'].includes(p.kind)||((p.kind==='none')!==(p.id==='none')))throw new Error('Only experience prizes and the no-prize option are supported.');
    if(!Number.isSafeInteger(p.value)||p.value<0||(p.kind==='none'&&p.value!==0))throw new Error('Direct prices must be non-negative whole tokens within numeric precision; no prize has value 0.');
    if(!/^#[0-9a-f]{6}$/i.test(p.color))throw new Error('Choose a valid option colour.');
    return {id:p.id,name:title,short:label,title,label,value:p.value,weight:p.weight,color:p.color,kind:p.kind};
  });
  if(!clean.some(p=>p.kind==='experience'))throw new Error('Include at least one experience prize.');
  const markup=pricing.markup??s.markup??20;
  const targetWinProbability=pricing.targetWinProbability??s.targetWinProbability??0.8;
  const calculated=automaticPricing(clean,markup,targetWinProbability),price=calculated.price;
  if(calculated.menu.length>12)throw new Error('Use at most 11 actions plus no prize.');
  if(s.epoch)(s.archivedEpochs??=[]).push({...s.epoch,menu:menuFor(s)});
  s.epoch=await newEpoch((s.epoch?.id||0)+1);s.menu=calculated.menu;delete s.pricingError;s.price=price;s.markup=markup;s.targetWinProbability=targetWinProbability;s.version++;return s.version;
});}
export const MENU_REVISION = 5;
export function initialState(){ return {schema:1,menuRevision:MENU_REVISION,balance:400,paused:false,version:1,price:automaticPricing(defaultMenu(),20).price,markup:20,spins:[]}; }
export function read(){ const raw=localStorage.getItem(KEY); if(!raw)return initialState(); const s=JSON.parse(raw); if(s.schema!==1||!Array.isArray(s.spins))throw new Error('Demo storage could not be read.');return s; }
const listeners=new Set();
function notify(){listeners.forEach(fn=>fn());}
window.addEventListener('storage',e=>{if(e.key===KEY)notify();});
export function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
async function transact(fn){
  if(!navigator.locks)throw new Error('This demo needs a browser with Web Locks on localhost or HTTPS.');
  return navigator.locks.request(KEY,async()=>{const state=read();
    if(state.menuRevision!==MENU_REVISION){
      if(state.epoch){(state.archivedEpochs??=[]).push({...state.epoch,menu:state.menu||defaultMenu(),menuRevision:state.menuRevision||1});state.epoch=await newEpoch(state.epoch.id+1);}
      state.markup??=20;
      const legacy=(state.menu||defaultMenu()).map(p=>({...p,value:p.kind==='none'?0:Math.max(1,p.value)}));
      state.menu=legacy;
      try{const computed=automaticPricing(legacy,state.markup);state.menu=computed.menu;state.price=computed.price;delete state.pricingError;}
      catch(e){state.pricingError=e.message;}
      state.menuRevision=MENU_REVISION;state.version++;
    }
    const result=await fn(state);localStorage.setItem(KEY,JSON.stringify(state));notify();return result;});
}
export function selectPrize(roll,menu=PRIZES){let total=0;return menu.find(p=>(total+=Math.round(p.weight*10000))>Math.floor(roll*10000+1e-6))||menu.at(-1);}
async function newEpoch(id){const seed=hex(crypto.getRandomValues(new Uint8Array(32)));return {id,seed,commit:await sha256Hex(seed),nextNonce:0};}
export function ensureEpoch(){return transact(async s=>{if(!s.epoch)s.epoch=await newEpoch(1);return {id:s.epoch.id,commit:s.epoch.commit,nextNonce:s.epoch.nextNonce};});}
export function revealEpoch(){return transact(async s=>{if(!s.epoch)s.epoch=await newEpoch(1);const old=s.epoch;const spins=s.spins.filter(x=>x.epochId===old.id).map(x=>({...x,itemId:x.prize.id}));s.epoch=await newEpoch(old.id+1);return {...old,epochId:old.id,spins};});}
export function spin(key,clientSeed='anon',expectedVersion){return transact(async s=>{
  const previous=s.spins.find(x=>x.key===key);if(previous)return previous;
  if(expectedVersion!==undefined&&expectedVersion!==s.version)throw Object.assign(new Error('The wheel has changed. Review the updated options before spinning.'),{code:'WHEEL_UPDATED'});
  if(s.pricingError)throw Object.assign(new Error('The host needs to update wheel pricing before new spins.'),{code:'JURISDICTION_BLOCKED'});
  if(s.paused)throw Object.assign(new Error('The host has paused new spins. Please check back shortly.'),{code:'JURISDICTION_BLOCKED'});
  if(s.balance<s.price)throw Object.assign(new Error('Not enough demo tokens. Add tokens to continue.'),{code:'INSUFFICIENT_FUNDS'});
  if(!s.epoch)s.epoch=await newEpoch(1);
  const nonce=s.epoch.nextNonce++,ppm=await rollPpm(s.epoch.seed,clientSeed,nonce);
  const menu=menuFor(s),prize=selectPrize(ppm/10000,menu);
  const result={id:crypto.randomUUID(),key,at:Date.now(),viewer:'You',viewerId:'demo-viewer',stream:'Maya · evening session',price:s.price,version:s.version,prize:{...prize},itemsSnapshot:widgetItems(menu),status:prize.id==='none'?'no-prize':'pending',refunded:0,menuRevision:MENU_REVISION,epochId:s.epoch.id,commit:s.epoch.commit,nonce,clientSeed,ppm};
  s.balance-=s.price;s.spins.push(result);return result;
});}
export function sessionSpent(s){return s.spins.slice(s.sessionStartIndex||0).reduce((n,x)=>n+x.price,0);}
export function newDemoSession(){return transact(s=>{s.sessionStartIndex=s.spins.length;});}
export function topUp(){return transact(s=>{s.balance+=200;});}
export function pause(paused){return transact(s=>{s.paused=paused;});}
export function fulfill(id,status){return transact(s=>{
  if(!['completed','rejected'].includes(status))throw new Error('Unknown status.');
  const x=s.spins.find(x=>x.id===id);if(!x)throw new Error('Spin not found.');
  if(x.status!=='pending')throw new Error('This prize has already been handled.');
  x.status=status;x.handledAt=Date.now();if(status==='rejected'){x.refunded=x.price;s.balance+=x.price;}
});}
export function metrics(spins){const n=spins.length;const gross=spins.reduce((n,s)=>n+s.price,0);const refunds=spins.reduce((n,s)=>n+s.refunded,0);return {n,gross,refunds,net:gross-refunds,players:new Set(spins.map(s=>s.viewerId)).size,pending:spins.filter(s=>s.status==='pending').length,completed:spins.filter(s=>s.status==='completed').length,prizeRate:n?spins.filter(s=>s.prize.id!=='none').length/n:null,noPrize:spins.filter(s=>s.prize.id==='none').length,winRate:n?spins.filter(s=>s.prize.value>=s.price).length/n:null,jackpotRate:n?spins.filter(s=>s.prize.id==='jackpot').length/n:null};}
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const time=at=>new Date(at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
export const percent=n=>n===null?'—':(n*100).toFixed(1)+'%';
