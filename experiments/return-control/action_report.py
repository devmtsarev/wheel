"""Publish comparisons without conflating negative adjustments with negative profit."""
import argparse,csv,json
from pathlib import Path


def generate(source,out):
    d=json.loads((source/'action-results.json').read_text());out.mkdir(parents=True,exist_ok=True)
    idx={(s['scenario'],s['policy']):s for s in d['summary']};names=list(d['worlds'])
    mean=lambda n,p,k:idx[n,p]['metrics'][k]['mean']
    ci=lambda x:f"{x['mean']:+.0f} [{x['low']:+.0f}, {x['high']:+.0f}]"
    selection=d['selections']
    lines=['# Per-action adjustment results','',
      'Synthetic net contribution per observed stream, in token-equivalents. Same populations and decision shocks are paired across policies; these are not live revenue forecasts. These worlds and seeds differ from the earlier joint-pricing study.','',
      f"{d['candidate_training_streams']:,} training policy-stream evaluations (including no-wheel references); {d['evaluation_streams']:,} held-out evaluations. Five training worlds, two unseen worlds, {d['evaluation_runs']} evaluation seeds per world/policy. All 35 experiment tests pass.",'',
      '![Paired comparisons](action-comparisons.png)', '', '![Outcome probabilities](action-probabilities.png)', '', '## Selected offers','',
      '| Policy | Shape | Spin price | Total win rate | Aggregate premium | Action adjustments, prices 20 / 60 / 120 / 240 |',
      '|---|---|---:|---:|---:|---|']
    selected=[('Matched price/EV',selection['matched_ev']),('Uniform joint',selection['uniform']),('Differentiated joint',selection['differentiated']),('Adaptive: lower pressure',selection['adaptive'][0]),('Adaptive: higher pressure',selection['adaptive'][1])]
    for label,a in selected:
        o=d['offers'][a]
        lines.append(f"| {label} | {o['shape']} | {o['price']:.2f} | {o['win_probability']:.1%} | {o['premium']:.0%} | "+' / '.join(f'{v:+.1%}' for v in o['adjustments'])+' |')
    lines+=['',f"Adaptive threshold: {selection['adaptive'][2]}. The fixed differentiated offer selected with negative adjustments allowed is arm {selection['differentiated']}; with all adjustments constrained nonnegative it is arm {selection['differentiated_nonnegative']}.",
      '', '## 1. Redistribute at the same price and expected reward value','',
      'Both offers charge 32 tokens and award 26.67 tokens of expected direct-purchase value. The selected redistribution puts 90% of expected reward value into the 240-token action. Its adjustment is −66.7% relative to the explicit equal reference allocation. Total win frequency changes: this comparison controls price and EV, not frequency.',
      '', '| Audience | Equal-share reference | Selected redistribution | Paired difference [95% MC interval] |','|---|---:|---:|---|']
    for n in names:lines.append(f"| {n} | {mean(n,'reference_32','net'):.0f} | {mean(n,'matched_ev','net'):.0f} | {ci(idx[n,'matched_ev']['differences']['reference_32'])} |")
    control_path=out/'action-controls.json'
    if control_path.exists():
        c=json.loads(control_path.read_text())
        lines+=['','### Additional control: same price, EV and total win frequency','',
            'Exploratory, pre-specified shapes within this follow-up check; neither is selected using its evaluation results. The expensive-action control uses value shares [.31,.03,.25,.41], giving the 240-token action a -26.8% adjustment. The middle-action control uses [.29,.05,.41,.25], discounting the 120-token action. Both retain price 32, EV 26.67 and total win frequency 52.78%. This removes the slower-win-frequency explanation, but still includes service-cost and public-action effects.',
            '', '| Audience | Expensive-action control vs equal shares [95% MC] | Middle-action control vs equal shares [95% MC] |', '|---|---|---|']
        cx={(r['scenario'],r['policy']):r for r in c['summary']}
        for n in names:lines.append(f"| {n} | {ci(cx[n,'expensive_same_frequency']['delta'])} | {ci(cx[n,'middle_same_frequency']['delta'])} |")
        lines+=['',f"These {c['evaluations']:,} additional evaluations share the same 100 evaluation seeds. Intervals are exploratory and unadjusted for multiple comparisons; this is not a third independent sample."]
    lines+=['','## 2. Optimize the mix and aggregate premium together','',
      '| Audience | No wheel | Uniform joint | Differentiated joint | Adaptive differentiated | Differentiated minus uniform [95% MC interval] |','|---|---:|---:|---:|---:|---|']
    for n in names:lines.append(f"| {n} | {mean(n,'no_wheel','net'):.0f} | {mean(n,'uniform_joint','net'):.0f} | {mean(n,'differentiated_joint','net'):.0f} | {mean(n,'adaptive_differentiated','net'):.0f} | {ci(idx[n,'differentiated_joint']['differences']['uniform_joint'])} |")
    lines+=['','The unrestricted joint optimum is identical to the optimum with all per-action adjustments nonnegative. Permitting negative adjustments therefore adds **no measured gain in the selected joint policy** in this search. The matched-price/EV result supports redistribution that includes a discount, not a claim that discounts are globally necessary.','',
      '## Demand, supply, and cannibalization','',
      '| Audience | Selected fixed: spin attempts / accepted | Completion rate | Direct receipts vs uniform | 240-token direct receipts vs uniform | 240-token wheel awards | Assigned workload, seconds |','|---|---:|---:|---:|---:|---:|---:|']
    for n in names:
        v=lambda k:mean(n,'differentiated_joint',k)
        u=lambda k:mean(n,'uniform_joint',k)
        lines.append(f"| {n} | {v('wheel_intents'):.1f} / {v('spins'):.1f} | {v('quota_ended'):.0%} | {v('direct_revenue')-u('direct_revenue'):+.0f} | {v('action_3_direct_revenue')-u('action_3_direct_revenue'):+.0f} | {v('action_3_wheel_awards'):.1f} | {sum(v(f'action_{j}_assigned_work') for j in range(4)):.0f} |")
    lines+=['','Assigned workload includes every awarded obligation, including unfinished awards. Attempted demand is measured before capacity refusals. Direct-receipt differences are paired policy effects, not a claim that every wheel buyer would otherwise buy directly.','',
      '## Interpretation and boundaries','',
      '- The matched-frequency expensive-action control loses in the expensive-desired and more-sensitive worlds with intervals below zero. Most other differences include zero; appeal reversal is the positive exception. The large initial redistribution gain cannot be attributed to desirability or negative adjustments alone.',
      '- Different action adjustments can help, but the globally trained differentiated policy does not beat a strong uniform policy in every audience. Read the paired intervals rather than just point estimates.',
      '- Negative adjustment is defined relative to a fixed 1/4 reference allocation. It is not the expected total spend to obtain that action, and it is not negative accounting margin. Value shares do not allocate actual receipts.',
      '- Expensive actions receive lower adjustments in the selected joint policy. That is consistent with the hypothesis, but does not establish a universal price-demand relationship.',
      '- Empty outcomes, all award obligations, finite budgets and the 24-action quota remain. Incomplete streams stay in return means.',
      '- Model coefficients, price/odds response, future retention and reputation remain uncalibrated. The finite grid and 12-seed training selection can overfit. No live pricing or existing website demo is changed.',
      '', 'See [model, equations and reproduction](../ACTION_MODEL.md). `action-demand-surface.csv` contains all training offer/world combinations with per-action demand and supply measurements; `action-summary.csv` contains full held-out means and paired net intervals.']
    (out/'ACTION_RESULTS.md').write_text('\n'.join(lines)+'\n')
    basis={k:v for k,v in d.items() if k!='summary'}
    (out/'action-basis.json').write_text(json.dumps(basis,indent=2)+'\n')
    rows=[]
    for s in d['summary']:
        r=dict(scenario=s['scenario'],policy=s['policy'],unseen=s['unseen'])
        r.update({k:v['mean'] for k,v in s['metrics'].items()})
        for ref,x in s['differences'].items():r.update({f'delta_vs_{ref}_{k}':v for k,v in x.items()})
        rows.append(r)
    with (out/'action-summary.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
    surface=list(csv.DictReader((source/'action-demand-surface.csv').open()))
    keys=['scenario','arm','net','wheel_intents','direct_intents','spins','wins','direct_revenue','wheel_revenue','quota_ended','duration_minutes','capacity_blocked_fraction']+[k for k in surface[0] if k.startswith('action_')]
    with (out/'action-demand-surface.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=keys,lineterminator='\n');w.writeheader();w.writerows({k:r[k] for k in keys} for r in surface)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();generate(a.source,a.out)
