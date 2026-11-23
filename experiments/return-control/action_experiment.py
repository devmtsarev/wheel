"""Per-action allocation and negative-adjustment experiment. No live pricing."""
import argparse,csv,hashlib,json
from dataclasses import asdict,replace
from multiprocessing import Pool
from pathlib import Path
import numpy as np
from agents import World,run
from settings import PRICES
from joint_experiment import controller,robust_score,interval

SHARES={
 'equal':(.25,.25,.25,.25),
 'cheap':(.55,.25,.15,.05),
 'middle':(.1,.4,.4,.1),
 'expensive':(.05,.1,.25,.6),
 'expensive_concentrated':(.02,.03,.05,.9),
 'ascending':(.1,.2,.3,.4),
}
PREMIUMS=(-.2,.2,.5,1.,2.,4.,8.,16.,32.)
WIN_RATES=(.05,.1,.25,.5,.75)
TRAIN_WORLDS={
 'neutral':World(),
 'expensive_desired_fast':World(target_mix=(.05,.15,.25,.55),action_appeal=(.8,1.,1.3,1.8),action_durations=(12.,25.,35.,20.),action_costs=(8.,18.,40.,45.),action_social=(.6,.8,1.2,1.6)),
 'cheap_desired':World(target_mix=(.5,.3,.15,.05),action_appeal=(1.6,1.3,1.,.8),action_durations=(8.,14.,40.,55.),action_social=(1.4,1.2,.8,.6)),
 'public_satiation':World(target_mix=(.05,.15,.25,.55),action_appeal=(.8,1.,1.3,1.8),shared_satisfaction=.35,action_satisfaction=(.5,.8,1.5,3.),action_social=(.6,.8,1.2,1.6),repetition_decay=.15),
 'expensive_burdensome':World(target_mix=(.05,.15,.25,.55),action_appeal=(.8,1.,1.3,1.8),action_durations=(5.,10.,30.,60.),action_costs=(7.,18.,60.,168.),delivery_fraction=.3),
}
UNSEEN={
 'appeal_reversal_unseen':replace(TRAIN_WORLDS['expensive_desired_fast'],target_mix=(.55,.25,.15,.05),action_appeal=(1.8,1.3,1.,.6),action_social=(1.6,1.2,.8,.6)),
 'value_and_odds_sensitive_unseen':replace(TRAIN_WORLDS['expensive_desired_fast'],price_sensitivity=1.2,probability_sensitivity=.8,loss_fatigue=.4),
}


def offer(shares,premium,win=None,price=None):
    """Shares allocate expected direct value, NOT win probabilities or receipts.

    Fixed reference allocation a_i=1/4 gives m_i=(1+premium)/(4*b_i)-1.
    Thus p_i=s*a_i/((1+m_i)*v_i); negative m_i is not negative profit.
    """
    b=np.asarray(shares,dtype=float)
    if b.shape!=(4,) or np.any(b<=0) or not np.all(np.isfinite(b)) or not np.isclose(b.sum(),1):raise ValueError('Four positive value shares summing to one required')
    if not np.isfinite(premium) or premium<=-1:raise ValueError('Premium must exceed -100%')
    if (win is None)==(price is None):raise ValueError('Specify either frequency or price')
    relative=b/PRICES;mix=relative/relative.sum()
    if price is None:price=(1+premium)*win/relative.sum()
    ev=price/(1+premium);probs=ev*relative;p=float(probs.sum())
    if not np.isfinite(price) or price<=0 or not 0<p<1:raise ValueError('Offer needs positive price and a positive empty outcome')
    adjustments=(1+premium)/(4*b)-1
    return dict(price=float(price),premium=float(premium),win_probability=p,empty=1-p,ev=float(ev),
                value_shares=b.tolist(),mix=mix.tolist(),action_probabilities=probs.tolist(),adjustments=adjustments.tolist(),
                negative=bool(np.any(adjustments < -1e-10)))

OFFERS=[dict(price=0.,win_probability=0.,mix=[.25]*4)]
MATCHED=[];JOINT=[];UNIFORM=[]
for name,b in SHARES.items():
    o=offer(b,.2,price=32.);o.update(family='matched_ev',shape=name);MATCHED.append(len(OFFERS));OFFERS.append(o)
for name,b in SHARES.items():
 for m in PREMIUMS:
  for p in WIN_RATES:
   o=offer(b,m,win=p);o.update(family='joint',shape=name);JOINT.append(len(OFFERS))
   if name=='equal':UNIFORM.append(len(OFFERS))
   OFFERS.append(o)
TABLE=([o['price'] for o in OFFERS],[o['win_probability'] for o in OFFERS])
MIXES=[o['mix'] for o in OFFERS]
WORLDS={**TRAIN_WORLDS,**UNSEEN}


def simulate(world,policy,seed):
    return run(world,policy,seed,offers=TABLE,reward_mixes=MIXES)[0]


def train_job(job):
    name,spec,seeds=job
    policy=controller(*spec) if isinstance(spec,tuple) else spec
    rr=[simulate(TRAIN_WORLDS[name],policy,s) for s in seeds]
    return name,spec,{k:float(np.mean([r[k] for r in rr])) for k in rr[0]}


def evaluate_job(job):
    name,label,spec,seed=job
    policy=controller(*spec) if isinstance(spec,tuple) else spec
    r=simulate(WORLDS[name],policy,seed)
    return dict(scenario=name,policy=label,seed=seed,**{k:v.item() if isinstance(v,np.generic) else v for k,v in r.items()})


def execute(training_runs,runs,workers,out):
    out.mkdir(parents=True,exist_ok=True);trainseeds=list(range(30000,30000+training_runs))
    scores={};surface=[]
    with Pool(workers) as pool:
        jobs=[(name,arm,trainseeds) for arm in range(len(OFFERS)) for name in TRAIN_WORLDS]
        for name,arm,metrics in pool.imap(train_job,jobs,chunksize=1):
            scores[name,arm]=metrics['net'];surface.append(dict(scenario=name,arm=arm,**metrics))
            if name==list(TRAIN_WORLDS)[-1] and arm%25==0:print('trained offer',arm,'/',len(OFFERS)-1,flush=True)
        def deltas(spec):return [(scores[n,spec]-scores[n,0])/scores[n,0] for n in TRAIN_WORLDS]
        def choose(candidates):return max(candidates,key=lambda a:robust_score(deltas(a)))
        matched=choose(MATCHED);uniform=choose(UNIFORM);diff=choose(JOINT)
        nonnegative=choose([a for a in JOINT if not OFFERS[a]['negative']])
        finalists=sorted(JOINT,key=lambda a:robust_score(deltas(a)),reverse=True)[:4]
        switches=[(lo,hi,t) for lo in finalists for hi in finalists if lo!=hi for t in (.75,1.5)]
        for name,spec,metrics in pool.imap(train_job,[(n,s,trainseeds) for s in switches for n in TRAIN_WORLDS],chunksize=1):
            scores[name,spec]=metrics['net']
        best=choose([diff]+switches);adaptive=(best,best,1.) if isinstance(best,int) else best
        selections=dict(reference=1,matched_ev=matched,uniform=uniform,differentiated_nonnegative=nonnegative,differentiated=diff,adaptive=list(adaptive))
        print('selected',selections,flush=True)
        policies={'no_wheel':0,'reference_32':1,'matched_ev':matched,'uniform_joint':uniform,'differentiated_nonnegative':nonnegative,'differentiated_joint':diff,'adaptive_differentiated':adaptive}
        jobs=[(n,label,spec,seed) for n in WORLDS for seed in range(40000,40000+runs) for label,spec in policies.items()]
        rows=list(pool.imap(evaluate_job,jobs,chunksize=4))
    idx={(r['scenario'],r['policy'],r['seed']):r for r in rows};summary=[]
    for name in WORLDS:
        for label in policies:
            rr=[idx[name,label,seed] for seed in range(40000,40000+runs)]
            numeric=[k for k in rr[0] if k not in ('scenario','policy','seed')]
            summary.append(dict(scenario=name,policy=label,unseen=name in UNSEEN,
                metrics={k:interval([r[k] for r in rr]) for k in numeric},
                differences={ref:interval([r['net']-idx[name,ref,r['seed']]['net'] for r in rr]) for ref in policies}))
        print(name,{p:round(np.mean([idx[name,p,s]['net'] for s in range(40000,40000+runs)])) for p in policies},flush=True)
    for filename,rr in [('action-runs.csv',rows),('action-demand-surface.csv',surface)]:
        with (out/filename).open('w') as f:
            w=csv.DictWriter(f,fieldnames=list(rr[0]),lineterminator='\n');w.writeheader();w.writerows(rr)
    payload=dict(training_runs=training_runs,evaluation_runs=runs,training_seed_start=30000,evaluation_seed_start=40000,
        candidate_training_streams=(len(OFFERS)+len(switches))*len(TRAIN_WORLDS)*training_runs,
        evaluation_streams=len(rows),worlds={n:asdict(w) for n,w in WORLDS.items()},offers=OFFERS,selections=selections,
        training_scores=[dict(spec=list(s) if isinstance(s,tuple) else s,deltas=deltas(s)) for s in list(range(1,len(OFFERS)))+switches],summary=summary,
        source_sha256={f:hashlib.sha256((Path(__file__).parent/f).read_bytes()).hexdigest() for f in ('agents.py','action_experiment.py','joint_experiment.py','settings.py')})
    (out/'action-results.json').write_text(json.dumps(payload,indent=2)+'\n');return payload

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--training-runs',type=int,default=12);p.add_argument('--runs',type=int,default=100);p.add_argument('--workers',type=int,default=4);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    if not 2<=a.training_runs<10000 or not 2<=a.runs<=1000 or not 1<=a.workers<=8:p.error('Use disjoint train/evaluation seeds and 1..8 workers')
    execute(a.training_runs,a.runs,a.workers,a.out)
