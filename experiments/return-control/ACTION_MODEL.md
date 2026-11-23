# Per-action adjustments: desirability, discounts and scarce supply

This experiment tests differentiated reward mixes, including negative action-specific
adjustments. It extends the joint premium study without changing production pricing,
the player widget, or the demo's previously published results.

## What “per-action overhead” means here

Let `s` be spin price, `v_i` the direct price, and `p_i` the unconditional chance of
action i. The expected spend until that specific action appears is `s / p_i`, but
other actions can be awarded along the way. It is not an isolated acquisition price.
We therefore fix a transparent reference allocation `a_i = 1/4` and define:

```
p_i = s * a_i / ((1 + m_i) * v_i)
```

`m_i` is a model adjustment, not an accounting profit margin or a promised discount
to each viewer. Negative `m_i` gives an action more probability than the equal-reference
zero-adjustment allocation. It need not mean overall negative wheel premium, and it
is not the same thing as selling a direct action below its posted price. Its value
depends on the chosen reference allocation, which stays fixed in this experiment.

For convenient search, specify expected-value shares `b_i > 0`, with `sum(b_i)=1`,
and aggregate premium `M > -1`:

```
EV = s / (1 + M)
p_i = EV * b_i / v_i
m_i = (1 + M) / (4 * b_i) - 1
P(win) = sum(p_i); P(empty) = 1 - P(win)
```

Equivalently, at a desired total win frequency `p`, derive
`s = (1 + M) * p / sum(b_i/v_i)`. All candidate offers keep every action possible
and include an empty outcome. Equal shares reproduce the previous inverse-price
mix and common premium. A value share is not a share of wins or of receipts.

Example: at 32 tokens, +20% aggregate premium and value shares
`[.05, .10, .25, .60]`, the 240-token action has a **−50% adjustment**, while the
whole wheel still awards 26.67 tokens of expected direct-purchase value per spin.
All revenue is accounted at the wheel/stream level; no arbitrary spin-receipt
allocation is used to claim per-action profit.

## Three questions, distinct comparisons

1. **Matched price and expected value:** hold spin price at 32 and EV at 26.67;
   vary six value-share shapes. Compare the globally selected shape against equal
   shares at the same price/EV. This keeps aggregate premium at 20%. Total win
   frequency changes when value moves between cheap and expensive actions, so this
   is a redistribution-plus-frequency test, not a pure appeal experiment at fixed odds.
2. **Joint differentiated pricing:** vary shape, aggregate premium and total win
   frequency. Compare against the best common-premium/inverse-price policy selected
   over the identical price/pacing parameter grid, not just the old default offer.
3. **Adaptive differentiated pricing:** switch between the four best globally trained
   joint offers using observed queue/direct-demand pressure, with thresholds .75/1.5.
   The best fixed offer is also eligible; adaptation is not forced.

A fourth comparison selects the best differentiated offer with **all `m_i >= 0`**
from the same grid. If the unrestricted optimum is the same offer, this experiment
has not demonstrated that permitting negative adjustments helps joint optimization.

Shapes are equal `[.25,.25,.25,.25]`, cheap `[.55,.25,.15,.05]`, middle
`[.10,.40,.40,.10]`, expensive `[.05,.10,.25,.60]`, concentrated expensive
`[.02,.03,.05,.90]`, and ascending `[.10,.20,.30,.40]`. Aggregate premiums are
−20%, 20%, 50%, 100%, 200%, 400%, 800%, 1600%, 3200%; win frequencies are
5%, 10%, 25%, 50%, 75%. There are 276 fixed offers, plus no-wheel references and
24 switching candidates. Negative aggregate premium is permitted but not required.
This coarse, deliberately broad finite search is not a proof of optimality.

## Demand, action appeal and public effects

The original finite-budget, three-cohort viewer model remains. New per-action
attributes separate preference prevalence, willingness/appeal, service time, delivery
cost, public excitement and satisfaction. Expensive actions are not assumed universally
better. Appeal multiplies subjective reward value in spin utility and willingness to
pay for the preferred direct action. Thus both sales channels benefit from desirability;
the wheel does not receive exclusive access to a demand boost. Individuals still have
different preferred actions and willingness, and non-preferred rewards are discounted.

Five training worlds deliberately conflict:

| World | Main departure from neutral |
|---|---|
| Neutral | Original preferences, costs, service and public effects |
| Expensive desired, fast | 55% prefer the 240-token action; its appeal is 1.8×, service 20 seconds, cost 45 tokens; stronger public excitement |
| Cheap desired | 50% prefer the 20-token action; its appeal is 1.6×, with stronger public excitement |
| Public satiation | Expensive action popular, but matching shared actions satisfy demand 3× as strongly; repeated actions lose excitement |
| Expensive burdensome | Expensive action popular but costs 168 tokens and 60 seconds to deliver; slower streamer |

All numerical assumptions and complete vectors are exported in `action-basis.json`.
Two worlds are withheld: appeal reverses toward cheap actions while retaining the
fast-expensive supply assumptions; and the expensive-desired audience becomes more
price/odds-sensitive and more affected by losses. These evaluate distribution shift,
not just another random draw of the training populations.

## Supply and reporting

The streamer still has 24 slots and a single queue, fatigue and breaks. A spin reserves
the worst possible action workload, now derived from the world's service times. Quota
and work cannot be oversold; even low-probability costly awards remain obligations.
Completed actions affect the audience; unperformed awards do not create fictional
social benefits. At the observation cutoff every charged spin settles and its award
cost is recognized, but undelivered actions remain unfinished.

Per-action metrics include direct purchase attempts, accepted direct purchases, wheel
awards, completed actions, direct receipts, delivery costs and assigned workload.
Attempted demand is recorded before admission so constrained sales are not mistaken
for absent demand. Per-cohort payer/spin/receipt totals remain available. Changes in
aggregate payer counts are not unique-viewer conversion estimates.

The controller sees aggregate queue work, recent direct demand, completed actions and
remaining slots. It does not see the scenario name, private tastes, budgets or personal
loss histories. It does not close the wheel. The same frozen policy is evaluated in
all worlds. This remains offline policy selection, not online demand-curve learning.

## Selection and validation

Training uses 12 seeds starting at 30000; evaluation uses 100 different seeds starting
at 40000. Selection maximizes the number of training worlds with positive mean net
increment over no wheel, then mean proportional increment minus twice proportional
downside. Worlds are equally weighted. Best offers can differ on held-out data;
selection does not use evaluation outcomes. Paired intervals account for simulation
randomness, not uncertainty in the behavioral coefficients or multiple comparisons.

Core tests cover the reference-allocation equation, negative adjustments with positive
aggregate premium, matching price/EV, default-mix compatibility, quota/ledger integrity,
and per-action cost conservation. Earlier experiments remain historical snapshots;
the new simulator defaults preserve their behavioral assumptions.

## Limitations

Synthetic demand is not evidence of real willingness to pay. Long-run retention,
reputation, perceived unfairness and richer substitution among direct actions are not
modeled. A viewer currently directly buys its preferred action rather than choosing
among all direct actions. This study can test whether the idea is useful under explicit
hypotheses, not identify a live price. Wider grids, more training seeds and independently
measured demand would be needed before policy deployment.

## Reproduction

```sh
pip install -r experiments/return-control/requirements.txt
python -m unittest discover -s experiments/return-control -p 'test_*.py'
python experiments/return-control/action_experiment.py --training-runs 12 --runs 100 --workers 4 --out experiments/return-control/generated/actions
python experiments/return-control/action_report.py experiments/return-control/generated/actions --out experiments/return-control/results
```

The worker count changes execution speed, not seeds or results. Raw per-stream records
are generated separately; compact summaries, all training offer/demand measurements,
selection scores and source hashes are versioned.

Optional plots (matplotlib 3.11.2):

```sh
pip install matplotlib==3.11.2
python experiments/return-control/action_plots.py experiments/return-control/generated/actions/action-results.json --out experiments/return-control/results
```

## Additional matched-frequency controls

The first redistribution changes total win frequency. To separate that explanation,
`action_controls.py` also tests fixed value shares `[.31,.03,.25,.41]` and
`[.29,.05,.41,.25]` against equal shares, all at price 32, EV 26.67 and total
win frequency 52.78%. They shift probability among actions while preserving all
three quantities. The first gives the expensive action a negative adjustment; the
second gives the 120-token action a negative adjustment. Both are exploratory
mechanistic comparisons, not additional fitted policies. Service costs and public
effects still differ by outcome. They reuse the same 100 evaluation seeds and
report unadjusted paired intervals.

```sh
python experiments/return-control/action_controls.py --runs 100 --workers 4 --out experiments/return-control/results/action-controls.json
python experiments/return-control/action_report.py experiments/return-control/generated/actions --out experiments/return-control/results
```
