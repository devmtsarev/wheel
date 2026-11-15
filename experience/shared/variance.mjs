// Evaluate the actual published distribution, including zero-value no-prize outcomes.
export function rewardVariance(menu,cvLimit=2){
  if(!Array.isArray(menu)||!menu.length)throw new Error('A probability distribution is required.');
  if(!Number.isFinite(cvLimit)||cvLimit<=0)throw new Error('CV limit must be positive.');
  const rows=menu.map(p=>({value:p.value,ppm:Math.round(p.weight*10000)}));
  if(rows.some(p=>!Number.isSafeInteger(p.value)||p.value<0||!Number.isSafeInteger(p.ppm)||p.ppm<0)||rows.reduce((n,p)=>n+p.ppm,0)!==1000000)throw new Error('Use valid values and probabilities totaling 1,000,000 ppm.');
  const ev=rows.reduce((n,p)=>n+p.value*p.ppm/1e6,0);
  const variance=rows.reduce((n,p)=>n+(p.value-ev)**2*p.ppm/1e6,0);
  const sd=Math.sqrt(variance),cv=ev>0?sd/ev:null;
  return {ev,variance,sd,cv,cvLimit,passes:cv!==null&&cv<=cvLimit};
}
