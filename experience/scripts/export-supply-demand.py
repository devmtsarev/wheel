"""Export measured summaries and one recorded stream per policy; no invented live runs."""
import argparse,csv,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('--out',type=Path,default=Path('experience/demos/supply-demand/data.json'));a=p.parse_args()
d=json.loads((a.source/'joint-results.json').read_text());curves=list(csv.DictReader((a.source/'joint-demand-curves.csv').open()));runs=list(csv.DictReader((a.source/'joint-runs.csv').open()))
metrics=['net','spins','wins','direct_purchases','direct_revenue','wheel_revenue','duration_minutes','quota_ended','capacity_blocked_fraction','not_ready_new_payers','ready_direct_delta']
summaries=[dict(scenario=s['scenario'],policy=s['policy'],unseen=s['unseen'],metrics={k:s['metrics'][k] for k in metrics},differences=s['differences']) for s in d['summary']]
traces=d['examples']
for r in runs:
 if int(r['seed'])!=d['evaluation_seed_start']:continue
 t=traces[r['scenario']][r['policy']]
 t.append(dict(t[-1],minute=float(r['duration_minutes']),completed=int(r['completed']),queue=int(r['unfinished']),revenue=float(r['revenue']),spins=int(r['spins']),direct=int(r['direct_purchases']),remaining_slots=d['worlds'][r['scenario']]['quota']-int(r['completed'])-int(r['unfinished']),terminal=True,reason=r['end_reason']))
fields=['arm','price','win_probability','premium','net','wheel_intents_per_100_decisions','direct_intents_per_100_decisions','spins','wins','direct_revenue','duration_minutes','capacity_blocked_fraction']
payload=dict(schema=1,trainingRuns=d['training_runs'],evaluationRuns=d['evaluation_runs'],replaySeed=d['evaluation_seed_start'],worlds=d['worlds'],offers=d['offers'],selectedFixed=d['selected_fixed'],selectedAdaptive=d['selected_adaptive'],summary=summaries,curves=[dict(scenario=r['scenario'],**{k:float(r[k]) for k in fields}) for r in curves],traces=traces,sourceHashes=d['source_sha256'])
a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(payload,separators=(',',':'))+'\n')
print(f'Exported {len(summaries)} summaries and {len(curves)} offer/audience observations to {a.out}')
