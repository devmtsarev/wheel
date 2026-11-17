"""Additional mechanistic controls: hold price, EV AND total win frequency fixed."""
import argparse,json,hashlib
from multiprocessing import Pool
from pathlib import Path
from action_experiment import WORLDS,offer
from agents import run
from joint_experiment import interval

SHAPES={'equal':(.25,.25,.25,.25),'expensive_same_frequency':(.31,.03,.25,.41),'middle_same_frequency':(.29,.05,.41,.25)}
OFFERS={n:offer(b,.2,price=32.) for n,b in SHAPES.items()}

def job(args):
    world,label,seed=args;o=OFFERS[label]
    r,_=run(WORLDS[world],1,seed,offers=([0.,o['price']],[0.,o['win_probability']]),reward_mixes=[[.25]*4,o['mix']])
    return world,label,seed,r['net']

def execute(runs,workers,out):
    with Pool(workers) as pool:rows=list(pool.imap(job,[(n,l,s) for n in WORLDS for l in SHAPES for s in range(40000,40000+runs)],chunksize=4))
    idx={(n,l,s):v for n,l,s,v in rows};summary=[]
    for n in WORLDS:
        for label in SHAPES:
            vals=[idx[n,label,s] for s in range(40000,40000+runs)]
            delta=[idx[n,label,s]-idx[n,'equal',s] for s in range(40000,40000+runs)]
            summary.append(dict(scenario=n,policy=label,net=interval(vals),delta=interval(delta)))
    d=dict(runs=runs,seeds_start=40000,evaluations=len(rows),offers=OFFERS,summary=summary,
        note='Exploratory fixed controls, no policy selection or fitting on these evaluations. Intervals are unadjusted for multiple comparisons.',
        source_sha256={f:hashlib.sha256((Path(__file__).parent/f).read_bytes()).hexdigest() for f in ('action_controls.py','action_experiment.py','agents.py','settings.py','joint_experiment.py')})
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(d,indent=2)+'\n')
    for r in summary:
        if r['policy']!='equal':print(r['scenario'],r['policy'],r['delta'],flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--runs',type=int,default=100);p.add_argument('--workers',type=int,default=4);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    if not 2<=a.runs<=1000 or not 1<=a.workers<=8:p.error('Use 2..1000 runs and 1..8 workers')
    execute(a.runs,a.workers,a.out)
