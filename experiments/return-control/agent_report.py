"""Export compact individual-viewer simulation results; standard library only."""
import argparse
import csv
import json
from pathlib import Path

LABELS={'balanced':'Balanced','buyer_heavy':'Buyer-heavy','curious_audience':'Curious audience',
        'fatigue_and_free_riding':'Fatigue / free riding','slow_streamer':'Slow streamer'}

def export(source,out):
    x=json.loads(source.read_text());out.mkdir(parents=True,exist_ok=True)
    def r(s,p):return next(a for a in x['summary'] if a['scenario']==s and a['policy']==p)
    def v(s,p,k):return r(s,p)[k]['mean']
    rows=[]
    for a in x['summary']:
        item={'scenario':a['scenario'],'policy':a['policy']}
        for k,val in a.items():
            if isinstance(val,dict):
                for stat,num in val.items():item[k+'_'+stat]=round(num,6)
        item['net_per_observed_hour']=round(a['net_per_observed_hour'],6)
        rows.append(item)
    with (out/'agent-summary.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
    basis={k:val for k,val in x.items() if k not in ('summary','examples')}
    (out/'agent-basis.json').write_text(json.dumps(basis,indent=2)+'\n')
    text=['# Individual-viewer, finite-action results','',
      f"{x['runs']} held-out seeds × 5 policies × 5 scenarios = {x['runs']*25:,} evaluation streams. "
      f"Each scenario's schedule is selected using {x['training_runs']} separate training seeds per candidate.",'',
      '**Primary outcome: net token-equivalent contribution per observed stream, not per hour.** Streams complete after 24 actions. Runs that exhaust the audience or hit the observation cutoff without 24 completions are reported as incomplete, not successful stream endings. Their observed contribution is included below; no revenue is imputed beyond observation.','',
      '| Audience | No wheel | Fixed 32-token wheel | Trained offer schedule | Best fixed from training | Schedule prices, first/second half |',
      '|---|---:|---:|---:|---:|---|']
    for s,label in LABELS.items():
        vals=[v(s,p,'net') for p in ('no_wheel','fixed_32','session_trained','best_fixed')]
        text.append(f'| {label} | '+ ' | '.join(f'{a:,.0f}' for a in vals)+' | '+ '/'.join(map(str,x['selections'][s]['prices']))+' |')
    text+=['','## Stream duration and completion','',
      '| Audience | No wheel minutes | Fixed wheel minutes | Trained schedule minutes | No-wheel quota completion | Trained quota completion |',
      '|---|---:|---:|---:|---:|---:|']
    for s,label in LABELS.items():
        text.append(f"| {label} | {v(s,'no_wheel','duration_minutes'):.1f} | {v(s,'fixed_32','duration_minutes'):.1f} | {v(s,'session_trained','duration_minutes'):.1f} | {100*v(s,'no_wheel','quota_ended'):.0f}% | {100*v(s,'session_trained','quota_ended'):.0f}% |")
    text+=['','## Who pays and who is displaced','',
      'For the trained schedule, matched against the same initial viewers in the no-wheel counterfactual. Cohorts describe initial willingness, not permanent purchasing rules. Lost direct spend is a gross matched-viewer decrease; the net direct change also includes viewers whose direct spending increases. These are causal comparisons inside the simulator, not estimates from customers.','',
      '| Audience | New initially-unwilling payers | Ready-group lost direct spend | Ready-group net direct change | Ready-group lost payers | Unsure new payers |',
      '|---|---:|---:|---:|---:|---:|']
    for s,label in LABELS.items():
        p='session_trained'
        text.append(f"| {label} | {v(s,p,'not_ready_new_payers'):.1f} | {v(s,p,'ready_direct_spend_lost'):.0f} | {v(s,p,'ready_direct_delta'):+.0f} | {v(s,p,'ready_lost_payers'):.1f} | {v(s,p,'unsure_new_payers'):.1f} |")
    text+=['','## Gaming response','',
      'Counts per stream for the trained schedule. Faster-repeat count means at least five spins with shorter average intervals for the last two gaps than the first two. It is descriptive: price changes and waiting can contribute, so it is not a clinical or psychological classification.','',
      '| Audience | Repeat spinners | Faster-repeat spinners | Exposed but never spin | Stop after losses | Stop because of waiting | Leave during overload |',
      '|---|---:|---:|---:|---:|---:|---:|']
    for s,label in LABELS.items():
        keys=('repeat_spinners','accelerating_spinners','wheel_exposed_never_spin','fatigue_stops','waiting_stops','overload_leavers')
        text.append('| '+label+' | '+' | '.join(f"{v(s,'session_trained',k):.1f}" for k in keys)+' |')
    text+=['','## Paired uncertainty','',
      'Mean net differences and 95% normal Monte Carlo intervals, token-equivalents per observed stream. These describe simulation randomness, not uncertainty about actual people or the model. Comparisons are exploratory.','',
      '| Audience | Trained minus no wheel | Trained minus fixed 32 | Trained minus best fixed |','|---|---:|---:|---:|']
    for s,label in LABELS.items():
        cells=[]
        for ref in ('no_wheel','fixed_32','best_fixed'):
            d=r(s,'session_trained')['net_delta_vs_'+ref];cells.append(f"{d['mean']:+.0f} [{d['low']:+.0f}, {d['high']:+.0f}]")
        text.append('| '+label+' | '+' | '.join(cells)+' |')
    text+=['','## Interpretation','',
      '- Conversion alone is not success: new wheel payers can coexist with lower total return and displaced direct buyers.',
      '- Cheap or random actions consume the same finite action slots as direct purchases; catalogue mix and early stream termination matter.',
      '- Three scenarios select the same offer for both halves. Extra scheduling complexity is not automatically useful.',
      '- No-wheel baselines sometimes fail to reach the action quota within the finite audience lifetime. Read completion rates alongside return; do not treat censored runs as fully completed streams.',
      '- The trained schedule cannot choose wheel-off commercially. A no-wheel result can therefore exceed the best tested wheel schedule.',
      '- This is a richer mechanistic hypothesis, not a calibrated model of real users. See [AGENT_MODEL.md](../AGENT_MODEL.md).','']
    (out/'AGENT_RESULTS.md').write_text('\n'.join(text))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();export(a.input,a.out)
