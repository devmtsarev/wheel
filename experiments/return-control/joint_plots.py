"""Optional plots: install matplotlib separately; not needed for simulation/tests."""
import argparse
import csv
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('--out',type=Path,required=True)
args=p.parse_args();out=args.out;out.mkdir(parents=True,exist_ok=True)
d=json.loads((args.source/'joint-results.json').read_text())
rows=list(csv.DictReader((args.source/'joint-demand-curves.csv').open()))
fig,axs=plt.subplots(2,2,figsize=(13,8),layout='constrained')
colors=plt.get_cmap('viridis')(np.linspace(.1,.85,5))
for i,n in enumerate(('balanced','curious_audience')):
 for p,c in zip((.05,.1,.25,.5,.75),colors):
  rr=sorted([r for r in rows if r['scenario']==n and float(r['win_probability'])==p],key=lambda r:float(r['premium']))
  axs[i,0].plot([float(r['price']) for r in rr],[float(r['wheel_intents_per_100_decisions']) for r in rr],'-o',color=c,label=f'{p:.0%} wins')
  axs[i,1].plot([100*float(r['premium']) for r in rr],[float(r['net']) for r in rr],'-o',color=c,label=f'{p:.0%} wins')
 axs[i,0].set(xscale='log',xlabel='Spin price (tokens; log scale)',ylabel='Spin attempts / 100 decisions',title=n.replace('_',' ').title()+' — modeled demand')
 axs[i,1].set(xscale='log',xlabel='Premium (%; log scale)',ylabel='Net contribution / observed stream',title='Return after finite supply and cannibalization')
 for a in axs[i]:a.grid(alpha=.18)
axs[0,1].legend(title='Fixed win frequency',fontsize=8,loc='upper right')
fig.suptitle('Synthetic supply-demand response surface\nTraining means; endogenous audience selection, budgets and queue constraints',fontsize=14)
fig.savefig(out/'demand-and-return.png',dpi=150);plt.close(fig)
idx={(r['scenario'],r['policy']):r for r in d['summary']};names=list(d['worlds'])
fig,ax=plt.subplots(figsize=(12,5.5),layout='constrained');x=np.arange(len(names));width=.24
for offset,p,label,c in [(-width,'no_wheel','Direct only','#778595'),(0,'fixed_20pct_32','Old wheel: 20% premium','#dc9874'),(width,'joint_adaptive','Selected joint policy','#459e95')]:
 vals=[idx[n,p]['metrics']['net']['mean'] for n in names]
 ax.bar(x+offset,vals,width,label=label,color=c)
ax.set_xticks(x,[n.replace('_','\n') for n in names],fontsize=9);ax.set_ylabel('Net contribution / observed stream');ax.set_title('Held-out simulation: seven audiences, one frozen policy');ax.legend(loc='upper left');ax.grid(axis='y',alpha=.18)
fig.savefig(out/'heldout-return.png',dpi=150);plt.close(fig)
