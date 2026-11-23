import {automaticPricing,saveMenu,read,menuFor,ensureEpoch} from '../../shared/store.js';
const $=id=>document.getElementById(id);
const names={balanced:'Balanced audience',buyer_heavy:'Buyer-heavy audience',curious_audience:'Curious audience',fatigue_and_free_riding:'Fatigue & free riding',slow_streamer:'Slow streamer',price_sensitive_unseen:'More price-sensitive · unseen',odds_sensitive_unseen:'More probability-sensitive · unseen'};
const policies={no_wheel:'Direct purchases only',fixed_20pct_32:'Original wheel',joint_fixed:'Best global fixed offer',joint_adaptive:'Selected adaptive policy'};
const colors=['#65865d','#8ca9a4','#bb9c6a','#967b99'];
const modelMenu=[20,60,120,240].map((value,i)=>({id:'lab-'+value,title:'Action '+String.fromCharCode(65+i),label:'Action '+String.fromCharCode(65+i),kind:'experience',value,color:colors[i]}));
const fmt=(v,d=0)=>Number(v).toLocaleString('en',{maximumFractionDigits:d});
const pct=v=>fmt(v*100,1)+'%';
const signed=v=>(v>=0?'+':'−')+fmt(Math.abs(v));
let data,timer=null,index=0,currentOffer=null;
function frames(){return data.traces[$('audience').value][$('policy').value];}
function stop(){clearInterval(timer);timer=null;$('play').textContent='Play replay';}
function mean(policy,key){return data.summary.find(s=>s.scenario===$('audience').value&&s.policy===policy).metrics[key].mean;}
function comparison(){
 const world=data.worlds[$('audience').value];
 $('audience-detail').textContent=`${world.viewers} viewers · ${world.quota} action slots · initial groups: ${pct(world.group_mix[0])} ready, ${pct(world.group_mix[1])} unsure, ${pct(world.group_mix[2])} unwilling. ${$('audience').value.endsWith('unseen')?'Excluded from policy training.':''}`;
 $('comparison').innerHTML=Object.entries(policies).map(([p,label])=>`<article class="result ${p==='joint_adaptive'?'selected':''}"><h3>${label}</h3><strong>${fmt(mean(p,'net'))}</strong><small>net tokens / observed stream</small><small>${pct(mean(p,'quota_ended'))} reached the action quota</small><small>${fmt(mean(p,'duration_minutes'),1)} minutes on average</small></article>`).join('');
 const s=data.summary.find(s=>s.scenario===$('audience').value&&s.policy==='joint_adaptive');
 const delta=s.differences.no_wheel,fixed=s.differences.joint_fixed;
 $('difference').textContent=`Selected policy vs direct only: ${signed(delta.mean)} tokens (95% Monte Carlo interval ${signed(delta.low)} to ${signed(delta.high)}). Versus the best fixed offer: ${signed(fixed.mean)} tokens. ${fmt(s.metrics.not_ready_new_payers.mean,1)} initially unwilling viewers became new payers on average; ready buyers’ direct spending changed by ${signed(s.metrics.ready_direct_delta.mean)} tokens.`;
}
function chart(rows,key,title,ylabel){
 const width=430,height=255,left=58,right=18,top=20,bottom=52;
 const xs=rows.map(r=>Math.log10(r.price)),ys=rows.map(r=>r[key]);
 const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=0,ymax=Math.max(...ys)*1.12||1;
 const x=v=>left+(Math.log10(v)-xmin)/(xmax-xmin||1)*(width-left-right),y=v=>height-bottom-(v-ymin)/(ymax-ymin)*(height-top-bottom);
 const line=rows.map(r=>`${x(r.price)},${y(r[key])}`).join(' ');
 const ticks=[0,.5,1].map(t=>{const v=t*ymax;return `<line x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}" stroke="#dce3d6"/><text x="${left-8}" y="${y(v)+4}" text-anchor="end">${fmt(v)}</text>`;}).join('');
 const xticks=[rows[0],rows[Math.floor(rows.length/2)],rows.at(-1)].map(r=>`<text x="${x(r.price)}" y="${height-bottom+22}" text-anchor="middle">${fmt(r.price,1)}</text>`).join('');
 return `<div><h3>${title}</h3><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}. Full values are in the table below." style="font:11px system-ui;fill:#52634d">${ticks}<polyline points="${line}" fill="none" stroke="#54764b" stroke-width="3"/>${rows.map(r=>`<circle cx="${x(r.price)}" cy="${y(r[key])}" r="4" fill="#54764b"><title>${fmt(r.price,2)} tokens: ${fmt(r[key],2)} ${ylabel}</title></circle>`).join('')}${xticks}<text x="${width/2}" y="${height-8}" text-anchor="middle">Spin price · tokens, logarithmic scale</text></svg></div>`;
}
function curves(){
 const rows=data.curves.filter(r=>r.scenario===$('audience').value&&r.win_probability===Number($('frequency').value)).sort((a,b)=>a.price-b.price);
 $('frequency').disabled=!rows.length;
 if(!rows.length){$('curves').textContent='This audience was held out from training. See its evaluation results above; no training response curve was generated.';$('curve-table').innerHTML='<tr><td colspan="6">No training observations for this audience.</td></tr>';return;}
 $('curves').innerHTML=chart(rows,'wheel_intents_per_100_decisions','Demand · spin attempts per 100 decisions','attempts per 100 decisions')+chart(rows,'net','Return · net tokens per observed stream','net tokens');
 $('curve-table').innerHTML=rows.map(r=>`<tr><td>${pct(r.premium)}</td><td>${fmt(r.price,2)}</td><td>${fmt(r.wheel_intents_per_100_decisions,1)}</td><td>${fmt(r.spins,1)}</td><td>${fmt(r.net)}</td><td>${pct(r.capacity_blocked_fraction)}</td></tr>`).join('');
}
function renderFrame(){
 const f=frames()[index],quota=data.worlds[$('audience').value].quota;
 $('time').value=index;$('clock').textContent=fmt(f.minute,1)+' min';
 const outstanding=f.terminal?f.queue:quota-f.completed-f.remaining_slots;
 $('slot-grid').innerHTML=Array.from({length:quota},(_,i)=>`<span class="slot ${i<f.completed?'done':i<f.completed+outstanding?'queued':''}" aria-hidden="true"></span>`).join('');
 $('capacity').textContent=`${f.completed} / ${quota} actions completed · ${outstanding} queued or reserved · ${Math.max(0,quota-f.completed-outstanding)} available slots. Green = completed; amber = outstanding.`;
 $('slot-grid').setAttribute('aria-label',$('capacity').textContent);
 $('replay-stats').innerHTML=`<div><strong>${f.spins}</strong><small>accepted spins</small></div><div><strong>${f.direct}</strong><small>direct purchases</small></div><div><strong>${fmt(f.revenue)}</strong><small>gross receipts · not net return</small></div>`;
 $('replay-status').textContent=f.terminal?(f.reason==='action_quota'?'Stream ended: action quota completed.':`Observation ended incomplete: ${f.reason==='audience_exhausted'?'audience exhausted':'time cutoff'}. Outstanding awards remain obligations.`):'Stream in progress';
 currentOffer=f.price>0?data.offers.find(o=>Math.abs(o.price-f.price)<1e-7&&Math.abs(o.win_probability-(1-f.empty))<1e-7):null;
 $('offer-price').textContent=currentOffer?fmt(currentOffer.price,2)+' tokens':'No wheel';
 $('offer-terms').textContent=currentOffer?`${pct(currentOffer.premium)} premium · ${pct(currentOffer.win_probability)} wins · ${pct(1-currentOffer.win_probability)} empty outcomes`:'Direct-purchase comparison; this is not a closure option available to the trained controller.';
 $('pressure').textContent=`Recent five-minute intents: ${f.recent_direct_intents??0} direct, ${f.recent_wheel_intents??0} wheel. Queue work: ${fmt(f.work??0)} seconds.${f.terminal?' Offer and pressure show the last recorded quote.':''}`;
 $('apply').disabled=!currentOffer;
 if(currentOffer){const r=automaticPricing(modelMenu,currentOffer.premium*100,currentOffer.win_probability);$('preview-rounding').textContent=`Player preview: ${r.price} whole tokens; ${pct(1-r.menu.at(-1).weight/100)} actual wins after rounding.`;}else $('preview-rounding').textContent='Select a wheel policy to preview an offer.';
}
function resetReplay(){stop();index=0;$('time').max=frames().length-1;renderFrame();}
async function applyOffer(restore=false){
 stop();const offer=currentOffer;if(!restore&&!offer)return;
 $('apply').disabled=true;$('restore').disabled=true;
 try{await ensureEpoch();const s=read();const version=await saveMenu(restore?menuFor(s):modelMenu,s.version,{markup:restore?20:offer.premium*100,targetWinProbability:restore?.8:offer.win_probability});const now=read();$('apply-status').textContent=`${restore?'Standard pacing restored':'Experimental offer applied'} as wheel v${version}: ${now.price} demo tokens per spin. Wallet and prior spins preserved. Open Player to try it, then Operator and Management to follow the same ledger.`;}
 catch(e){$('apply-status').textContent='Could not update the demo: '+e.message;}
 finally{$('restore').disabled=false;renderFrame();}
}
$('play').onclick=()=>{if(timer){stop();return;}if(index===frames().length-1)index=0;$('play').textContent='Pause replay';renderFrame();timer=setInterval(()=>{index++;renderFrame();if(index===frames().length-1)stop();},600);};
$('restart').onclick=resetReplay;$('time').oninput=()=>{stop();index=Number($('time').value);renderFrame();};
$('audience').onchange=()=>{comparison();curves();resetReplay();};$('policy').onchange=resetReplay;$('frequency').onchange=curves;
$('apply').onclick=()=>applyOffer();$('restore').onclick=()=>applyOffer(true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
try{const response=await fetch('data.json');if(!response.ok)throw new Error('Data request failed');data=await response.json();if(data.schema!==1)throw new Error('Unsupported data version');$('audience').innerHTML=Object.keys(data.worlds).map(n=>`<option value="${n}">${names[n]||n}</option>`).join('');comparison();curves();resetReplay();$('content').hidden=false;}catch(e){$('load-error').textContent='The experiment could not load. Serve the demo over HTTPS or localhost and reload. '+e.message;}
