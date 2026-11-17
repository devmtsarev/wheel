# Simulation results

100 held-out one-hour streams per policy/scenario. All offers use the same 20% premium and capacity gate.

**Net contribution = wheel receipts + direct receipts - delivery costs for every award - processing costs.**

Values are simulated token-equivalents per hour, not forecasts of money profit. The primary controller changes only empty chance and its linked price; it cannot commercially switch the wheel off. Capacity refusals are common to all policies.

| Scenario | No wheel | Fixed 32-token wheel | Empty-chance controller | Change vs fixed | Best fixed from training |
|---|---:|---:|---:|---:|---:|
| Price-insensitive demand | 2,200 | 3,709 | 4,256 | +14.8% | 4,256 |
| Fixed expected spend | 2,200 | 3,709 | 3,687 | -0.6% | 3,709 |
| Price-sensitive demand | 2,200 | 3,709 | 3,806 | +2.6% | 3,889 |
| Shared excitement | 2,123 | 4,269 | 4,330 | +1.4% | 4,285 |
| Shared satiation | 2,015 | 2,753 | 2,873 | +4.4% | 2,817 |
| Direct-purchase substitution | 3,973 | 3,204 | 3,475 | +8.5% | 3,973 |
| Preferences change after pilot | 2,200 | 3,709 | 3,901 | +5.2% | 4,007 |
| Delivery slows | 1,929 | 3,172 | 3,158 | -0.4% | 3,172 |

## Uncertainty in the difference

Paired 95% normal Monte Carlo intervals, in token-equivalents/hour. They describe simulation randomness, not uncertainty about real behavior; eight exploratory comparisons are not multiplicity-adjusted.

| Scenario | Difference vs fixed 32 [95% interval] | Difference vs best fixed [95% interval] |
|---|---:|---:|
| Price-insensitive demand | +548 [+469, +627] | +0 [+0, +0] |
| Fixed expected spend | -22 [-88, +45] | -22 [-88, +45] |
| Price-sensitive demand | +97 [+10, +184] | -84 [-158, -10] |
| Shared excitement | +61 [-42, +164] | +45 [-31, +121] |
| Shared satiation | +121 [+59, +182] | +57 [+13, +100] |
| Direct-purchase substitution | +271 [+198, +345] | -498 [-603, -392] |
| Preferences change after pilot | +192 [+126, +258] | -107 [-174, -40] |
| Delivery slows | -13 [-75, +49] | -13 [-75, +49] |

## Interpretation

- A good fixed offer remains competitive. Price-sensitive demand is a counterexample to assuming that adaptive planning is always better.
- The direct-substitution scenario earns less with the main controller than with no wheel. The separate `fitted` extension may choose wheel-off and reaches a different result; do not attribute that benefit solely to empty-chance control.
- `best_fixed` is chosen on separate training seeds; its candidates include wheel-off. In the preference-shift scenario its training covers full shifted sessions, while the fitted response remains based on the pre-shift pilot.
- The `oracle` has the current synthetic demand law but the same approximate planner. It does not know future outcomes and is not an optimal upper bound.
- There is no meaningful single blended expected return until the real mix of demand scenarios is known.
- All costs of outstanding awards are counted. Work remaining, refused intents, sales channels and mean offered win probability are available in `summary.csv`. Completed-only wait estimates exclude unfinished actions.

See [the experiment design](../README.md) for assumptions, limitations and reproduction.
