"""Optional scientific plots; matplotlib is not required by the simulator."""
import argparse,json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
p=argparse.ArgumentParser();p.add_argument('results',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
d=json.loads(a.results.read_text());idx={(s['scenario'],s['policy']):s for s in d['summary']}
names=list(d['worlds']);labels=['Neutral','Expensive desired / fast','Cheap desired','Public satiation','Expensive burdensome','Appeal reversal (unseen)','Sensitive audience (unseen)']
controls=json.loads((Path(__file__).parent/'results/action-controls.json').read_text())
cidx={(s['scenario'],s['policy']):s for s in controls['summary']}
fig,axes=plt.subplots(1,3,figsize=(17,5.8),sharey=True,layout='constrained')
for ax,policy,ref,title in [(axes[0],'matched_ev','reference_32','Redistribution at fixed price and EV'),(axes[1],'strict_control','equal','Same price, EV AND win frequency'),(axes[2],'differentiated_joint','uniform_joint','Differentiated vs optimized uniform offer')]:
 for y,n in enumerate(names):
  v=cidx[n,'expensive_same_frequency']['delta'] if policy=='strict_control' else idx[n,policy]['differences'][ref];color='#3d806d' if v['low']>0 else '#79848d'
  ax.errorbar(v['mean'],y,xerr=[[v['mean']-v['low']],[v['high']-v['mean']]],fmt='o',color=color,capsize=4)
 ax.axvline(0,color='#9aa3a2',linewidth=1);ax.set_title(title);ax.set_xlabel('Paired net contribution difference / stream');ax.grid(axis='x',alpha=.2)
axes[0].set_yticks(range(len(names)),labels);axes[0].invert_yaxis()
fig.suptitle('Per-action pricing: separating mix, frequency and premium\nSynthetic held-out means and 95% Monte Carlo intervals',fontsize=14)
fig.savefig(a.out/'action-comparisons.png',dpi=160);plt.close(fig)
fig,ax=plt.subplots(figsize=(11,5),layout='constrained');x=np.arange(5)
for i,(key,label,color) in enumerate([('reference','Original 32-token / equal shares','#8e969f'),('matched_ev','Same price / EV, redistributed','#d49b69'),('differentiated','Jointly optimized differentiated','#4f8b7e')]):
 o=d['offers'][d['selections'][key]];values=np.array(o['action_probabilities']+[o['empty']])*100
 ax.bar(x+(i-1)*.24,values,.24,label=label,color=color)
ax.set_xticks(x,['20-token action','60-token action','120-token action','240-token action','Empty outcome']);ax.set_ylabel('Unconditional probability (%)');ax.legend();ax.set_title('Where the probability goes');ax.grid(axis='y',alpha=.15)
fig.savefig(a.out/'action-probabilities.png',dpi=160)
