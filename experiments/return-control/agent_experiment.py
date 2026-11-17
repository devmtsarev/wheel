"""Train finite-action offer schedules, then evaluate held-out individual viewers."""
import argparse
import csv
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import numpy as np
from agents import GROUPS, WORLDS, run
from settings import OFFERS


def enrich(record, viewers, baseline):
    bg = np.array(baseline['group'])
    base_spend = np.array(baseline['spent'])
    spend = np.array(viewers['spent'])
    direct = np.array(viewers['direct_spent'])
    old_direct = np.array(baseline['direct_spent'])
    wheel = np.array(viewers['wheel_spent'])
    for g, name in enumerate(GROUPS):
        mask = bg == g
        # Paired outcomes, not a claim that every wheel payer is incremental.
        record[name+'_new_payers'] = int(np.sum(mask & (base_spend == 0) & (spend > 0)))
        record[name+'_lost_payers'] = int(np.sum(mask & (base_spend > 0) & (spend == 0)))
        record[name+'_direct_delta'] = float(np.sum(direct[mask] - old_direct[mask]))
        record[name+'_direct_spend_lost'] = float(np.maximum(0,old_direct[mask]-direct[mask]).sum())
        record[name+'_direct_spend_gained'] = float(np.maximum(0,direct[mask]-old_direct[mask]).sum())
        record[name+'_switched_to_wheel'] = int(np.sum(mask & (old_direct > 0) & (wheel > 0) & (direct < old_direct)))
        record[name+'_spend_delta'] = float(np.sum(spend[mask] - base_spend[mask]))
    record['late_arrivals_missed'] = int(np.sum((np.array(viewers['arrivals']) >= record['duration_minutes']*60) & (base_spend>0)))


def execute(runs, training_runs, out):
    all_rows = []; summaries = []; selections = {}; examples = {}
    for name, world in WORLDS.items():
        candidates = [(a,b) for a in range(1,7) for b in range(1,7)]
        train_scores = {pair: np.mean([run(world, pair, 1000+s)[0]['net'] for s in range(training_runs)]) for pair in candidates}
        pair = max(candidates, key=lambda p:train_scores[p])
        fixed = max(range(1,7), key=lambda p:train_scores[(p,p)])
        selections[name] = dict(two_phase=list(pair),prices=[OFFERS[a] for a in pair],fixed=fixed,fixed_price=OFFERS[fixed],
            scores=[dict(arms=list(p),net=float(score)) for p,score in train_scores.items()])
        policies = {'no_wheel':0,'fixed_32':4,'busy_empty':'busy_empty','best_fixed':fixed,'session_trained':pair}
        rows = {p:[] for p in policies}; examples[name] = {}
        for seed in range(7000,7000+runs):
            base, base_users = run(world, 0, seed)
            for label, policy in policies.items():
                r,u = run(world, policy, seed, trace=seed==7000)
                enrich(r,u,base_users); r['incremental_net'] = r['net'] - base['net']
                r = {k:(v.item() if isinstance(v,np.generic) else v) for k,v in r.items()}
                rows[label].append(r)
                all_rows.append(dict(scenario=name,policy=label,seed=seed,end_reason=u['reason'],**r))
                if seed==7000:examples[name][label] = u['trace']
        for label, rr in rows.items():
            result = dict(scenario=name,policy=label)
            for metric in rr[0]:
                vals = np.array([r[metric] for r in rr])
                result[metric] = dict(mean=float(vals.mean()),p10=float(np.quantile(vals,.1)),p90=float(np.quantile(vals,.9)))
            for ref in ('no_wheel','fixed_32','best_fixed'):
                delta = np.array([r['net'] - b['net'] for r,b in zip(rr, rows[ref])])
                se = float(delta.std(ddof=1)/np.sqrt(runs))
                result['net_delta_vs_'+ref] = dict(mean=float(delta.mean()),low=float(delta.mean()-1.96*se),high=float(delta.mean()+1.96*se))
            # Ratio of total net to total observed duration; primary objective is
            # per-stream return, not a mean of per-stream hourly ratios.
            result['net_per_observed_hour'] = 60*sum(r['net'] for r in rr)/sum(r['duration_minutes'] for r in rr)
            summaries.append(result)
        print(name,'schedule',selections[name]['prices'],'best fixed',OFFERS[fixed],
              {p:round(np.mean([r['net'] for r in rr])) for p,rr in rows.items()},flush=True)
    payload = dict(runs=runs,training_runs=training_runs,training_seed_start=1000,evaluation_seed_start=7000,
        worlds={k:asdict(v) for k,v in WORLDS.items()},selections=selections,summary=summaries,examples=examples,
        source_sha256={n:hashlib.sha256((Path(__file__).parent/n).read_bytes()).hexdigest() for n in ('agents.py','agent_experiment.py','settings.py')})
    out.mkdir(parents=True,exist_ok=True)
    (out/'agent-results.json').write_text(json.dumps(payload,indent=2)+'\n')
    with (out/'agent-runs.csv').open('w') as f:
        writer=csv.DictWriter(f,fieldnames=list(all_rows[0]),lineterminator='\n');writer.writeheader();writer.writerows(all_rows)
    return payload

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--runs',type=int,default=100);p.add_argument('--training-runs',type=int,default=20);p.add_argument('--out',type=Path,required=True)
    args=p.parse_args()
    if not 2<=args.runs<=1000 or not 1<=args.training_runs<6000:p.error('Use 2..1000 held-out runs and 1..5999 disjoint training runs')
    execute(args.runs,args.training_runs,args.out)
