import {menuFor,widgetItems,read,spin,topUp,subscribe,esc,time,ensureEpoch,revealEpoch,sessionSpent} from '../shared/store.js';
import {sha256Hex} from '../shared/fairness.js';
import {PrizeWheel,THEMES} from './original-wheel.js';
const $=id=>document.getElementById(id);
const parentOrigin=new URLSearchParams(location.search).get('parentOrigin');
function send(type,payload){if(parentOrigin&&parentOrigin!=='null')parent.postMessage({source:'wheel-player',type,payload},parentOrigin);}
let wheel;
function closeCurrentView(){if(wheel&&!wheel.el.res.hidden){wheel.closeResult();return;}if(wheel?.detailsOpen){wheel.setDetails(false);return;}send('close');}
$('close').onclick=closeCurrentView;document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeCurrentView();}});
try{
  await ensureEpoch();

  const server={async getState(){const s=read(),items=widgetItems(menuFor(s));const configHash=(await sha256Hex(JSON.stringify(items.map(i=>[i.id,i.menu,i.ppm])))).slice(0,12);return {available:!s.paused&&!s.pricingError,version:'v'+s.version,configHash,price:s.price,items,balance:s.balance,spent:sessionSpent(s),epoch:{id:s.epoch.id,commit:s.epoch.commit,nextNonce:s.epoch.nextNonce}};},async spin(req){const x=await spin(req.key,req.clientSeed,Number(req.version.slice(1)));const items=x.itemsSnapshot||widgetItems(menuFor(read()));return {...x,items,itemIndex:items.findIndex(i=>i.id===x.prize.id)};},revealEpoch};
  const host=$('host');wheel=new PrizeWheel(host,{server,theme:'night',viewerId:'demo-viewer'});
  function history(){if(wheel.busy)return;$('history').innerHTML=read().spins.slice(-5).reverse().map(x=>`<div class="history-item"><div>${esc(x.prize.title||x.prize.name)}<div class="sub">${time(x.at)} · ${x.price} токенов</div></div><span>${x.status==='no-prize'?'Без приза':x.status==='completed'?'Выполнено':x.status==='rejected'?'Возврат':'В очереди'}</span></div>`).join('')||'<p class="sub">Здесь появятся ваши призы.</p>';}
  subscribe(()=>{if(!wheel.verifying&&!wheel.busy)wheel.refresh().catch(e=>$('message').textContent=e.message);history();});
  host.addEventListener('prizewheel',e=>{if(e.detail.type==='details.toggle'){const open=e.detail.payload.open;$('extras').hidden=!open;document.body.classList.toggle('details-open',open);$('view-title').textContent=open?'Детали колеса':'';$('close').setAttribute('aria-label',open?'Close details':'Close wheel');window.scrollTo(0,0);}if(e.detail.type==='wallet.request')$('topup').click();if(e.detail.type==='spin.resolved'){history();const p=e.detail.payload;send('spin.resolved',{spinId:p.spinId,prizeId:p.item.id,price:p.price});}});
  $('topup').onclick=async()=>{try{await topUp();$('message').textContent='Добавлено 200 демо-токенов.';}catch(e){$('message').textContent=e.message;}};
  document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{wheel.setTheme(THEMES[b.dataset.theme]);document.querySelectorAll('[data-theme]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
  await wheel.ready;history();

}catch(e){$('message').textContent=e.message;}
