"""Fixed-premium, empty-outcome controller: synthetic, seeded design experiment.
Requires numpy. Run: python simulate.py --runs 100 --out OUTPUT_DIR
No live service or production configuration is touched.
"""
import argparse,collections,csv,json,math,random
from pathlib import Path
import numpy as np

from settings import (PRICES, DURATIONS, Q, DIRECT_Q, PREMIUM, H, D, HD, DD, COST,
                      SPIN_COST, OFFERS, PS, BASE, DT, HARD, WORST, SOFT, HORIZON, WINDOW)
from controller import choose

SCENARIOS={
 'price_insensitive':dict(eps=0,frustration=0,cannibal=.25),
 'fixed_spend':dict(eps=1,frustration=0,cannibal=.25),
 'price_sensitive':dict(eps=1.5,frustration=0,cannibal=.25),
 'social_excitement':dict(eps=.9,frustration=.3,cannibal=.3,social=.45,direct_social=-.15),
 'shared_satiation':dict(eps=1,frustration=.3,cannibal=.6,social=-.5,direct_social=-.4),
 'direct_substitution':dict(eps=1,frustration=.2,cannibal=.95,direct_base=.8),
 'preference_shift':dict(eps=1,frustration=0,cannibal=.25,shift=True),
 'slow_delivery':dict(eps=1,frustration=.2,cannibal=.3,slow=True),
}

def poisson(rng,mean):
    if mean<=0:return 0
    L=math.exp(-mean);p=1.;k=0
    while p>L:k+=1;p*=rng.random()
    return k-1

def rates(cfg,arm,audience,shared,wait,minute=0):
    """Synthetic ground truth. Only oracle and environment may call this in evaluation."""
    changed=cfg.get('shift') and minute>=30
    eps=0. if changed else cfg['eps'];frustration=2. if changed else cfg['frustration']
    if arm:
        price=OFFERS[arm];p=PS[arm]
        wheel=1.5*(price/32)**(-eps)*math.exp(-frustration*max(0,.5/p-1))
        substitute=min(.98,cfg['cannibal']*(32/price)**.35)
    else:wheel=0;substitute=0
    direct=cfg.get('direct_base',.25)*(1-substitute)
    wheel*=audience*math.exp(cfg.get('social',0)*shared-.12*wait)
    direct*=audience*math.exp(cfg.get('direct_social',0)*shared-.12*wait)
    return wheel,direct

def feature(arm,shared,wait):
    x=np.zeros(9);x[arm]=1;x[7]=shared;x[8]=wait
    return x

class Fitted:
    """Poisson response fit from separate randomized virtual pilot observations.
    Shared and wait covariates are measured. Audience is an exposure offset.
    No coefficient changes or test outcomes are used during held-out evaluation.
    """
    def __init__(self,cfg,seed=2718):
        rng=np.random.default_rng(seed);X=[];yw=[];yd=[];exposures=[]
        for arm in range(7):
            for _ in range(250):
                audience=float(rng.uniform(.5,4));shared=float(rng.uniform(0,2.5));wait=float(rng.uniform(0,6))
                w,d=rates(cfg,arm,audience,shared,wait,0)
                X.append(feature(arm,shared,wait));yw.append(rng.poisson(2*w));yd.append(rng.poisson(2*d));exposures.append(2*audience)
        X=np.array(X);offset=np.log(exposures)
        def fit(y):
            y=np.array(y);b=np.zeros(9);b[:7]=-.5
            for _ in range(60):
                mu=np.exp(np.clip(X@b+offset,-25,15))
                gradient=X.T@(y-mu)-.02*b
                information=X.T@(mu[:,None]*X)+.02*np.eye(9)
                step=np.linalg.solve(information,gradient)
                step=np.clip(step,-1,1);b+=step
                if np.max(np.abs(step))<1e-7:break
            return b.tolist()
        self.w=fit(yw);self.d=fit(yd)
    def predict(self,arm,audience,shared,wait,minute=0):
        def pred(b):return audience*math.exp(b[arm]+b[7]*shared+b[8]*wait)
        return (pred(self.w) if arm else 0),pred(self.d)

class Oracle:
    def __init__(self,cfg):self.cfg=cfg
    def predict(self,arm,audience,shared,wait,minute=0):return rates(self.cfg,arm,audience,shared,wait,minute)

def simulate(cfg,policy,seed,model=None,keep_trace=False):
    rng=random.Random(seed);outcomes=random.Random(seed+100000);direct_rng=random.Random(seed+200000)
    queue=collections.deque();pending=[];work=0.;reserved=0.;shared=0.;arm=BASE
    total_work=0.;served=0.;contribution=0.;wheel_revenue=0.;direct_revenue=0.;delivery_cost=0.
    attempts=accepted=wins=direct_attempts=direct_accepted=completed=0
    peak=0.;switches=0;arms=[];trace=[];end_q=0.;completion_wait=[]
    for sec in range(0,3600,DT):
        minute=sec/60;audience=4. if 15<=minute<35 else 1.
        capacity=15. if cfg.get('slow') and 25<=minute<45 else 30.
        # Prior-tick spins settle under captured terms. Reservations released first.
        for won,i,dur,shared_event in pending:
            reserved-=WORST
            if won:
                cost=COST*PRICES[i];delivery_cost+=cost;contribution-=cost
                queue.append([dur,sec,shared_event]);work+=dur;total_work+=dur;wins+=1
        pending=[]
        shared*=math.exp(-DT/300)
        service=capacity*DT/60
        while queue and service>1e-9:
            used=min(queue[0][0],service);service-=used;work-=used;served+=used;queue[0][0]-=used
            if queue[0][0]<1e-9:
                _,started,visible=queue.popleft();completed+=1;completion_wait.append((sec-started)/60)
                if visible:shared=min(3.,shared+.2)
        if sec%WINDOW==0:
            previous=arm
            if isinstance(policy,int):arm=policy
            elif policy=='busy_empty':
                arm=max(1,arm-1) if work>30 else min(BASE,arm+1)
            elif policy in ('fitted_on','fitted','oracle'):arm=choose(model,arm,audience,shared,work,reserved,capacity,minute,policy!='fitted_on')
            else:raise ValueError(policy)
            switches+=int(sec>0 and arm!=previous)
        arms.append(arm)
        w,d=rates(cfg,arm,audience,shared,max(0,work)/capacity,minute)
        # Direct and wheel intents share an atomic gate; shuffle order to avoid
        # silently prioritizing one sales channel. No retries after refusal.
        n=poisson(rng,w*DT/60);nd=poisson(direct_rng,d*DT/60)
        attempts+=n;direct_attempts+=nd;requests=['wheel']*n+['direct']*nd;rng.shuffle(requests)
        for kind in requests:
            if kind=='wheel':
                if work+reserved+WORST>HARD+1e-8:continue
                accepted+=1;price=OFFERS[arm];wheel_revenue+=price;contribution+=price-SPIN_COST
                reserved+=WORST
                won=outcomes.random()<PS[arm];i=outcomes.choices(range(4),weights=Q)[0]
                dur=float(DURATIONS[i])*outcomes.uniform(.5,1.5)
                pending.append((won,i,dur,outcomes.random()<.8))
            else:
                i=direct_rng.choices(range(4),weights=DIRECT_Q)[0]
                if work+reserved+2*DURATIONS[i]>HARD+1e-8:continue
                direct_accepted+=1;revenue=float(PRICES[i]);cost=COST*revenue
                direct_revenue+=revenue;delivery_cost+=cost;contribution+=revenue-cost
                dur=float(DURATIONS[i])*direct_rng.uniform(.5,1.5)
                work+=dur;total_work+=dur;queue.append([dur,sec,direct_rng.random()<.8])
        assert work+reserved<=HARD+1e-7 and work>=-1e-7
        peak=max(peak,work)
        if keep_trace and sec%60==0:
            trace.append(dict(minute=minute,empty=1-PS[arm] if arm else None,price=OFFERS[arm],work=round(work,3),shared=round(shared,3),contribution=round(contribution,3),audience=audience,capacity=capacity))
    for won,i,dur,visible in pending:
        if won:
            cost=COST*PRICES[i];delivery_cost+=cost;contribution-=cost;wins+=1;work+=dur;total_work+=dur
    assert work<=HARD+1e-7
    assert abs(total_work-served-work)<1e-6
    assert abs(contribution-(wheel_revenue+direct_revenue-delivery_cost-accepted*SPIN_COST))<1e-6
    live=[a for a in arms if a]
    return dict(contribution=float(contribution),wheel_revenue=wheel_revenue,direct_revenue=direct_revenue,
        delivery_cost=float(delivery_cost),wheel_attempts=attempts,wheel_accepted=accepted,wins=wins,
        direct_attempts=direct_attempts,direct_accepted=direct_accepted,completed=completed,
        unfinished=wins+direct_accepted-completed,peak_work=peak,end_work=work,switches=switches,
        off_fraction=1-len(live)/len(arms),mean_p=float(np.mean([PS[a] for a in live])) if live else 0,
        blocked_fraction=1-accepted/max(1,attempts) if attempts else 0,
        completed_wait_p95=float(np.quantile(completion_wait,.95)) if completion_wait else 0),trace

def verify():
    assert abs(sum(Q)-1)<1e-12
    for s,p in zip(OFFERS[1:],PS[1:]):
        assert 0<p<1 and abs(s/(p*H)-(1+PREMIUM))<1e-12
        assert np.max(np.abs(p*Q*PRICES-p*H/4))<1e-12
        assert abs((1.5*(s/32)**-1)*p-1.5*PS[BASE])<1e-12
    cfg=SCENARIOS['fixed_spend'];f=Fitted(cfg)
    assert abs(f.predict(BASE,1,0,0)[0]/rates(cfg,BASE,1,0,0)[0]-1)<.2
    assert simulate(cfg,'fitted',91,f)==simulate(cfg,'fitted',91,f)
    off,_=simulate(cfg,0,12)
    assert off['wheel_accepted']==off['wins']==off['wheel_revenue']==0
    for scenario in SCENARIOS.values():simulate(scenario,'oracle',2,Oracle(scenario))


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--runs',type=int,default=100);parser.add_argument('--out',type=Path,required=True)
    a=parser.parse_args()
    if a.runs < 2:parser.error('--runs must be at least 2 for uncertainty estimates')
    a.out.mkdir(exist_ok=True,parents=True);verify();records=[];summaries=[];traces={};chosen={};fits={}
    for name,cfg in SCENARIOS.items():
        fit=Fitted(cfg);oracle=Oracle(cfg);fits[name]=dict(wheel=fit.w,direct=fit.d)
        # Fixed benchmark selected on training seeds, not evaluation returns.
        train=[np.mean([simulate(cfg,arm,1000+j)[0]['contribution'] for j in range(20)]) for arm in range(7)]
        best=int(np.argmax(train));chosen[name]=dict(arm=best,price=OFFERS[best],training_means=[float(x) for x in train]);traces[name]={}
        by_policy=collections.defaultdict(list)
        for seed in range(7000,7000+a.runs):
            baseline,_=simulate(cfg,0,seed)
            for label,policy,model in [('no_wheel',0,None),('fixed_32',BASE,None),('busy_empty','busy_empty',None),('best_fixed',best,None),('fitted_on','fitted_on',fit),('fitted','fitted',fit),('oracle','oracle',oracle)]:
                r,t=simulate(cfg,policy,seed,model,seed==7000)
                r['incremental']=r['contribution']-baseline['contribution']
                by_policy[label].append(r);records.append(dict(scenario=name,policy=label,seed=seed,**r))
                if seed==7000:traces[name][label]=t
        for label,rr in by_policy.items():
            summary=dict(scenario=name,policy=label)
            for k in rr[0]:
                values=np.array([r[k] for r in rr]);summary[k]=dict(mean=float(values.mean()),p10=float(np.quantile(values,.1)),p50=float(np.median(values)),p90=float(np.quantile(values,.9)))
            # Paired uplift against the same seed's fixed-price policy; normal
            # Monte Carlo CI is simulation uncertainty, not real-world validity.
            for ref in ('fixed_32','best_fixed'):
                delta=np.array([r['contribution']-b['contribution'] for r,b in zip(rr,by_policy[ref])]);se=float(delta.std(ddof=1)/math.sqrt(len(delta))) if len(delta)>1 else 0
                summary['uplift_vs_'+ref]=dict(mean=float(delta.mean()),low=float(delta.mean()-1.96*se),high=float(delta.mean()+1.96*se))
            summaries.append(summary)
        print(name,'best fixed',OFFERS[best],{label:round(np.mean([r['contribution'] for r in rr])) for label,rr in by_policy.items()},flush=True)
    payload=dict(runs=a.runs,scenarios=SCENARIOS,offers=OFFERS,win_probabilities=PS,premium=PREMIUM,
      conditional_value=H,conditional_duration=D,direct_value=HD,direct_duration=DD,summary=summaries,traces=traces,best_fixed_training=chosen,fitted_coefficients=fits)
    (a.out/'results.json').write_text(json.dumps(payload,indent=2))
    with (a.out/'runs.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=list(records[0]));w.writeheader();w.writerows(records)
    print('Passed premium/inverse-price identities, deterministic replay, no-wheel accounting, work conservation, capacity reservations and contribution accounting.')

if __name__=='__main__':main()
