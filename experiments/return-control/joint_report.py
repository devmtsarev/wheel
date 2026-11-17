"""Compact reproducible reporting without plotting dependencies."""
import argparse
import csv
import json
from pathlib import Path
import shutil


def generate(source,out):
    data=json.loads((source/'joint-results.json').read_text());out.mkdir(parents=True,exist_ok=True)
    idx={(s['scenario'],s['policy']):s for s in data['summary']}
    names=list(data['worlds']);m=lambda n,p,k:idx[n,p]['metrics'][k]['mean']
    fixed=data['offers'][data['selected_fixed']];sel=data['selected_adaptive']
    describe=lambda a:f"arm {a}: {data['offers'][a]['price']:.2f} tokens, {data['offers'][a]['premium']:.0%} premium, {data['offers'][a]['win_probability']:.0%} wins"
    lines=['# Joint premium and supply-demand results','',
        'All figures are synthetic scenario outcomes, not forecasts. Net contribution is per observed stream in token-equivalents. No live behavior changed.','',
        f"Training: {data['training_runs']} seeds × five audiences × 41 fixed offers and 60 switching policies = {data['training_runs']*5*101:,} candidate streams, plus no-wheel references. Evaluation: {data['evaluation_runs']} seeds × seven audiences × four policies = {data['evaluation_runs']*28:,} recorded streams.",'',
        '![Held-out return](heldout-return.png)', '', '![Demand and return curves](demand-and-return.png)', '', '## Frozen global policies','',f"- Best fixed: {describe(fixed['arm'])}.",
        f"- Selected adaptive candidate: below pressure {sel['threshold']}: {describe(sel['low'])}; otherwise {describe(sel['high'])}.",
        '- Both policies are selected across the five training worlds, not per audience. Two sensitivity worlds are excluded from training.',
        '- The finite grid is not a proof of an optimum. In particular, a selected 5% win rate is at the lower frequency boundary.',
        '', '## Held-out return and completion','',
        '| Audience | No wheel | Old 20% / 32 | Joint fixed | Selected policy | Delta vs no wheel [95% MC interval] | Quota completion: no wheel / selected |',
        '|---|---:|---:|---:|---:|---|---|']
    for n in names:
        d=idx[n,'joint_adaptive']['differences']['no_wheel']
        lines.append(f"| {n} | {m(n,'no_wheel','net'):.0f} | {m(n,'fixed_20pct_32','net'):.0f} | {m(n,'joint_fixed','net'):.0f} | {m(n,'joint_adaptive','net'):.0f} | {d['mean']:+.0f} [{d['low']:+.0f}, {d['high']:+.0f}] | {m(n,'no_wheel','quota_ended'):.0%} / {m(n,'joint_adaptive','quota_ended'):.0%} |")
    positive=sum(idx[n,'joint_adaptive']['differences']['no_wheel']['mean']>0 for n in names)
    supported=sum(idx[n,'joint_adaptive']['differences']['no_wheel']['low']>0 for n in names)
    lines+=['',f'Positive mean increment in {positive}/7 worlds; paired 95% Monte Carlo interval above zero in {supported}/7. Intervals do not include behavioral-model uncertainty. Incomplete streams remain in all means.','',
        '## Adaptation versus a good fixed offer','', '| Audience | Selected minus joint fixed [95% MC interval] |','|---|---|']
    for n in names:
        d=idx[n,'joint_adaptive']['differences']['joint_fixed'];lines.append(f"| {n} | {d['mean']:+.1f} [{d['low']:+.1f}, {d['high']:+.1f}] |")
    lines+=['','## Demand and scarce supply under the selected policy','',
        '| Audience | Spin intents / accepted | Direct intents / accepted | Wins | Minutes | Capacity blocked | New initially unwilling payers | Ready-buyer direct receipt delta |',
        '|---|---:|---:|---:|---:|---:|---:|---:|']
    for n in names:
        v=lambda k:m(n,'joint_adaptive',k)
        lines.append(f"| {n} | {v('wheel_intents'):.1f} / {v('spins'):.1f} | {v('direct_intents'):.1f} / {v('direct_purchases'):.1f} | {v('wins'):.1f} | {v('duration_minutes'):.1f} | {v('capacity_blocked_fraction'):.0%} | {v('not_ready_new_payers'):.1f} | {v('ready_direct_delta'):+.0f} |")
    lines+=['','`joint-demand-curves.csv` includes all 205 training offer/audience combinations, with attempted demand, accepted sales, net return, and capacity measurements. Keep win frequency constant when reading price/premium response. The surface includes dynamic selection and stock constraints; it is not an empirical price-elasticity estimate.','',
        '## Interpretation','',
        'Higher premium can improve contribution per awarded action while lower win frequency preserves scarce action slots. Increasing price eventually reduces affordability and participation; the response surface includes offers where nobody spins. Do not mistake these expensive but technically available wheels for successful engagement.',
        '', 'The optimizer is evaluated on one-stream contribution. It does not know long-term retention, reputational effects or real customer acceptance. The most attractive simulated offers can therefore be unsuitable commercially. Calibrate demand and retention before treating the selected premium as a recommendation.',
        '', 'See [model and reproduction](../JOINT_MODEL.md) for selection, supply-pressure signals, seeds and limitations.']
    (out/'JOINT_RESULTS.md').write_text('\n'.join(lines)+'\n')
    shutil.copyfile(source/'joint-demand-curves.csv',out/'joint-demand-curves.csv')
    basis={k:v for k,v in data.items() if k not in ('summary','examples')}
    (out/'joint-basis.json').write_text(json.dumps(basis,indent=2)+'\n')
    compact=[]
    for s in data['summary']:
        row=dict(scenario=s['scenario'],policy=s['policy'],unseen=s['unseen'])
        row.update({k:v['mean'] for k,v in s['metrics'].items()})
        for ref,d in s['differences'].items():row.update({f'delta_vs_{ref}_{k}':v for k,v in d.items()})
        compact.append(row)
    with (out/'joint-summary.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=list(compact[0]),lineterminator='\n');w.writeheader();w.writerows(compact)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();generate(a.source,a.out)
