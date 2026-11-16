import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {SCENARIOS} from '../demos/scenarios.mjs';
import {rewardVariance} from '../shared/variance.mjs';
// Same isolated browser-store loading approach as store.test.mjs; no user storage is read.
const fairness=readFileSync(new URL('../shared/fairness.js',import.meta.url),'utf8').replace(/export \{[^}]+\};/,'');
const store=readFileSync(new URL('../shared/store.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const {automaticPricing,ORIGINAL_PRIZES}=vm.runInNewContext(fairness+'\n'+store+'\n({automaticPricing,ORIGINAL_PRIZES})',{TextEncoder,window:{addEventListener(){}}});
const model=createRequire(import.meta.url)('../../calc/model.js');
const gcd=(a,b)=>b?gcd(b,a%b):a;
function inspect(name,menu,price){
  const r=rewardVariance(menu),unit=menu.reduce((n,p)=>gcd(n,p.value),0)||1;
  // Integer GCD scaling makes convolution exact and keeps premium-menu arrays small.
  const tails=model.buildTails(menu.map(p=>p.value/unit),menu.map(p=>p.weight/100));
  return {name,price,...r,noPrize:menu.filter(p=>p.value===0).reduce((n,p)=>n+p.weight,0),loss30Percent:model.lossProb(tails,price/unit,30,0.4)*100};
}
const rows=[inspect('Original example (50-token spin)',ORIGINAL_PRIZES,50),...SCENARIOS.map(s=>{const r=automaticPricing(s.prices.map(value=>({value,kind:'experience'})),s.markup);return inspect(s.name,r.menu,r.price);})];
if(process.argv.includes('--json'))console.log(JSON.stringify(rows,null,2));
else{console.log('| Menu | Spin | EV | Variance | SD | CV | CV ≤ 2 | No prize | Loss over 30 spins* |');console.log('|---|---:|---:|---:|---:|---:|---|---:|---:|');for(const r of rows)console.log(`| ${r.name} | ${r.price} | ${r.ev.toFixed(4)} | ${r.variance.toFixed(4)} | ${r.sd.toFixed(4)} | ${r.cv.toFixed(4)} | ${r.passes?'PASS':'FAIL'} | ${r.noPrize.toFixed(4)}% | ${r.loss30Percent.toFixed(4)}% |`);console.log('\n* Exact convolution at the PDF example assumption μ = 0.40, N = 30. This diagnostic does not enforce publication policy or claim full PDF compliance.');}
