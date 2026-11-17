"""Export reviewable results from a full simulate.py run (standard library only)."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

LABELS = {
    'price_insensitive': 'Price-insensitive demand',
    'fixed_spend': 'Fixed expected spend',
    'price_sensitive': 'Price-sensitive demand',
    'social_excitement': 'Shared excitement',
    'shared_satiation': 'Shared satiation',
    'direct_substitution': 'Direct-purchase substitution',
    'preference_shift': 'Preferences change after pilot',
    'slow_delivery': 'Delivery slows',
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(args.input.read_text())
    args.out.mkdir(parents=True, exist_ok=True)
    rows = []
    for r in data['summary']:
        row = {'scenario': r['scenario'], 'policy': r['policy']}
        row.update({key: round(value['mean'], 6) for key, value in r.items()
                    if isinstance(value, dict) and 'p50' in value})
        for ref in ('fixed_32', 'best_fixed'):
            row.update({f'uplift_vs_{ref}_{key}': round(value, 6)
                        for key, value in r['uplift_vs_' + ref].items()})
        rows.append(row)
    with (args.out / 'summary.csv').open('w') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    basis = {k: v for k, v in data.items() if k not in ('summary', 'traces')}
    basis['source_sha256'] = {
        name: hashlib.sha256((Path(__file__).parent / name).read_bytes()).hexdigest()
        for name in ('controller.py', 'settings.py', 'simulate.py')
    }
    basis['evaluation_seed_start'] = 7000
    basis['fixed_offer_training_seeds'] = [1000, 1019]
    basis['pilot_seed'] = 2718
    basis['net_contribution_unit'] = 'synthetic token-equivalents per 60-minute stream'
    (args.out / 'basis.json').write_text(json.dumps(basis, indent=2) + '\n')
    def get(s, p):
        return next(r for r in data['summary'] if r['scenario'] == s and r['policy'] == p)
    lines = ['# Simulation results', '',
             f'{data["runs"]} held-out one-hour streams per policy/scenario. All offers use the same 20% premium and capacity gate.', '',
             '**Net contribution = wheel receipts + direct receipts - delivery costs for every award - processing costs.**', '',
             'Values are simulated token-equivalents per hour, not forecasts of money profit. The primary controller changes only empty chance and its linked price; it cannot commercially switch the wheel off. Capacity refusals are common to all policies.', '',
             '| Scenario | No wheel | Fixed 32-token wheel | Empty-chance controller | Change vs fixed | Best fixed from training |',
             '|---|---:|---:|---:|---:|---:|']
    for s, label in LABELS.items():
        vals = [get(s, p)['contribution']['mean'] for p in ('no_wheel', 'fixed_32', 'fitted_on', 'best_fixed')]
        lines.append(f'| {label} | {vals[0]:,.0f} | {vals[1]:,.0f} | {vals[2]:,.0f} | {(vals[2]/vals[1]-1)*100:+.1f}% | {vals[3]:,.0f} |')
    lines += ['', '## Uncertainty in the difference', '',
              'Paired 95% normal Monte Carlo intervals, in token-equivalents/hour. They describe simulation randomness, not uncertainty about real behavior; eight exploratory comparisons are not multiplicity-adjusted.', '',
              '| Scenario | Difference vs fixed 32 [95% interval] | Difference vs best fixed [95% interval] |',
              '|---|---:|---:|']
    for s, label in LABELS.items():
        values = [get(s, 'fitted_on')['uplift_vs_' + ref] for ref in ('fixed_32', 'best_fixed')]
        cells = [f'{v["mean"]:+.0f} [{v["low"]:+.0f}, {v["high"]:+.0f}]' for v in values]
        lines.append(f'| {label} | {cells[0]} | {cells[1]} |')
    lines += ['', '## Interpretation', '',
              '- A good fixed offer remains competitive. Price-sensitive demand is a counterexample to assuming that adaptive planning is always better.',
              '- The direct-substitution scenario earns less with the main controller than with no wheel. The separate `fitted` extension may choose wheel-off and reaches a different result; do not attribute that benefit solely to empty-chance control.',
              '- `best_fixed` is chosen on separate training seeds; its candidates include wheel-off. In the preference-shift scenario its training covers full shifted sessions, while the fitted response remains based on the pre-shift pilot.',
              '- The `oracle` has the current synthetic demand law but the same approximate planner. It does not know future outcomes and is not an optimal upper bound.',
              '- There is no meaningful single blended expected return until the real mix of demand scenarios is known.',
              '- All costs of outstanding awards are counted. Work remaining, refused intents, sales channels and mean offered win probability are available in `summary.csv`. Completed-only wait estimates exclude unfinished actions.', '',
              'See [the experiment design](../README.md) for assumptions, limitations and reproduction.']
    (args.out / 'RESULTS.md').write_text('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
