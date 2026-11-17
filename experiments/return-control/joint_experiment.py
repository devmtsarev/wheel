"""Joint premium / empty-outcome study. Synthetic demand; no production pricing."""
import argparse
import csv
from dataclasses import asdict, replace
import hashlib
import json
from pathlib import Path
import numpy as np
from agents import WORLDS, run
from agent_experiment import enrich
from settings import H, PS

PREMIUMS = (.2, .5, 1., 2., 4., 8., 16., 32.)
WIN_RATES = (.05, .1, .25, .5, .75)
OFFERS = [(0., 0., 0.)] + [(32., PS[4], .2)] + [((1+m)*p*H,p,m) for m in PREMIUMS for p in WIN_RATES]
TABLE = ([o[0] for o in OFFERS], [o[1] for o in OFFERS])
STRESS = {
    'price_sensitive_unseen': replace(WORLDS['balanced'],price_sensitivity=1.2),
    'odds_sensitive_unseen': replace(WORLDS['curious_audience'],probability_sensitivity=.8),
}


def pressure(state):
    """Public aggregate demand over five minutes vs remaining supply.

    Ten-minute direct-intent projection is a heuristic, not latent willingness
    or a forecast fitted to the evaluation scenario. Rejected intents count.
    """
    remaining = max(1, state['quota']-state['completed']-state['outstanding'])
    exposure = min(300, max(60, state['seconds']))
    direct_projection = state['recent_direct_intents'] * 600 / exposure
    return max(state['work']/60, direct_projection/remaining)


def controller(low, high, threshold):
    def choose(state):
        return high if pressure(state) >= threshold else low
    return choose


def robust_score(deltas):
    """Training only: coverage first, then mean gain penalized for downside."""
    x=np.asarray(deltas)
    return (int(np.sum(x>0)),float(x.mean()-2*np.maximum(-x,0).mean()),float(x.min()))


def interval(values):
    x=np.asarray(values,dtype=float);se=x.std(ddof=1)/np.sqrt(len(x))
    return dict(mean=float(x.mean()),low=float(x.mean()-1.96*se),high=float(x.mean()+1.96*se))


def execute(training_runs,runs,out):
    out.mkdir(parents=True,exist_ok=True)
    train_seeds=range(12000,12000+training_runs)
    train_worlds=list(WORLDS)
    base={name:np.array([run(w,0,s)[0]['net'] for s in train_seeds]) for name,w in WORLDS.items()}
    fixed_scores={}; curves=[]
    metrics=('net','spins','wins','wheel_revenue','direct_revenue','duration_minutes','decision_exposures','wheel_intents','direct_intents','expected_wheel_intents','expected_direct_intents','capacity_blocked_fraction','completed','quota_ended')
    for arm in range(1,len(OFFERS)):
        delta=[]
        for name,w in WORLDS.items():
            rr=[run(w,arm,s,offers=TABLE)[0] for s in train_seeds]
            delta.append(float(np.mean([r['net'] for r in rr]-base[name])/base[name].mean()))
            row=dict(scenario=name,arm=arm,price=OFFERS[arm][0],win_probability=OFFERS[arm][1],premium=OFFERS[arm][2])
            row.update({k:float(np.mean([r[k] for r in rr])) for k in metrics})
            row['wheel_intents_per_100_decisions']=100*row['wheel_intents']/max(1,row['decision_exposures'])
            row['direct_intents_per_100_decisions']=100*row['direct_intents']/max(1,row['decision_exposures'])
            curves.append(row)
        fixed_scores[arm]=delta
        print('fixed',arm,'score',robust_score(delta),flush=True)
    ranked=sorted(fixed_scores,key=lambda a:robust_score(fixed_scores[a]),reverse=True)
    fixed=ranked[0]
    # Restrict the adaptive search to six globally competitive arms; no scenario-specific policies.
    finalists=ranked[:6]; candidates=[]
    for lo in finalists:
        for hi in finalists:
            if lo==hi:continue
            for threshold in (.75,1.5):
                policy=controller(lo,hi,threshold)
                delta=[]
                for name,w in WORLDS.items():
                    vals=np.array([run(w,policy,s,offers=TABLE)[0]['net'] for s in train_seeds])
                    delta.append(float((vals-base[name]).mean()/base[name].mean()))
                candidates.append(dict(low=lo,high=hi,threshold=threshold,deltas=delta))
        print('adaptive low',lo,'done',flush=True)
    # A fixed policy is a valid result; adaptation is not forced to look successful.
    candidates.append(dict(low=fixed,high=fixed,threshold=1.,deltas=fixed_scores[fixed]))
    selected=max(candidates,key=lambda c:robust_score(c['deltas']))
    policies={'no_wheel':0,'fixed_20pct_32':1,'joint_fixed':fixed,
              'joint_adaptive':controller(selected['low'],selected['high'],selected['threshold'])}
    worlds={**WORLDS,**STRESS}; rows=[]; summary=[]; examples={}
    for name,w in worlds.items():
        by_policy={p:[] for p in policies};examples[name]={}
        for seed in range(20000,20000+runs):
            b,bu=run(w,0,seed,offers=TABLE)
            for label,policy in policies.items():
                r,u=run(w,policy,seed,trace=seed==20000,offers=TABLE)
                enrich(r,u,bu)
                r['incremental_net']=r['net']-b['net']
                r={k:v.item() if isinstance(v,np.generic) else v for k,v in r.items()}
                by_policy[label].append(r)
                rows.append(dict(scenario=name,policy=label,seed=seed,end_reason=u['reason'],**r))
                if seed==20000:examples[name][label]=u['trace']
        for label,rr in by_policy.items():
            record=dict(scenario=name,policy=label,unseen=name in STRESS,
                        metrics={k:interval([r[k] for r in rr]) for k in rr[0]})
            record['differences']={ref:interval([r['net']-b['net'] for r,b in zip(rr,by_policy[ref])]) for ref in policies}
            summary.append(record)
        print('evaluation',name,{p:round(np.mean([r['net'] for r in rr])) for p,rr in by_policy.items()},flush=True)
    for filename,data in [('joint-demand-curves.csv',curves),('joint-runs.csv',rows)]:
        with (out/filename).open('w') as f:
            writer=csv.DictWriter(f,fieldnames=list(data[0]),lineterminator='\n');writer.writeheader();writer.writerows(data)
    payload=dict(training_runs=training_runs,evaluation_runs=runs,training_seed_start=12000,evaluation_seed_start=20000,
        offers=[dict(arm=a,price=p,win_probability=q,premium=m) for a,(p,q,m) in enumerate(OFFERS)],
        worlds={k:asdict(w) for k,w in worlds.items()},fixed_training={str(k):v for k,v in fixed_scores.items()},
        adaptive_training=candidates,selected_fixed=fixed,selected_adaptive=selected,summary=summary,examples=examples,
        source_sha256={f:hashlib.sha256((Path(__file__).parent/f).read_bytes()).hexdigest() for f in ('agents.py','joint_experiment.py','settings.py','agent_experiment.py')})
    (out/'joint-results.json').write_text(json.dumps(payload,indent=2)+'\n')
    return payload

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--training-runs',type=int,default=20);p.add_argument('--runs',type=int,default=100);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    if not 2<=a.training_runs<8000 or not 2<=a.runs<=1000:p.error('Use 2..7999 training and 2..1000 evaluation runs with disjoint seeds')
    execute(a.training_runs,a.runs,a.out)
