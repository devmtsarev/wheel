# Joint premium, empty outcomes, and scarce action supply

This study extends the individual-viewer simulator. It changes experimental offers,
not the live widget, operator UI, server, or production pricing.

## Economics and objective

An offer is a premium `m` and a win probability `p`. Relative prize probabilities
remain inverse to direct-purchase values. With `H = sum(Q * direct prices)`, the
spin price is `s = (1 + m) * p * H`. All paid offers have a positive chance of an
empty outcome and a positive chance of winning. The optimizer cannot close the
wheel. No cash prizes, credit replenishment, or per-user offers are introduced.

We search premiums 20%, 50%, 100%, 200%, 400%, 800%, 1600%, and 3200%, crossed
with win frequencies 5%, 10%, 25%, 50%, and 75%, plus the existing 32-token,
20%-premium offer. These deliberately broad experimental values test whether a
maximum lies inside the search range; they are not recommended commercial settings.
In particular, a premium is markup over expected awarded direct-purchase value,
not the operator's profit margin. Very large markup does not imply that users will
accept it in real life.

One policy is selected across all five training audience scenarios. Selection is
lexicographic: first maximize the number of scenarios with positive mean net
increment versus no wheel, then maximize average proportional increment minus
twice average proportional downside. The baseline is a comparator, not an allowed
controller action. Equal scenario weights and the downside coefficient are explicit
modeling choices. Coverage uses training means, not a statistical guarantee.

The search first evaluates every fixed offer. Then it tests both directions of
switching between the six best global fixed offers at two supply-pressure thresholds.
The best fixed offer is also a candidate, so the selected policy may legitimately
make no changes during the stream. This is a finite policy search, not proof of a
global optimum or a continuously learned demand model.

## Supply and demand are separate measurements

The demand equation is unchanged from the individual-viewer model: viewers compare
watching, direct purchase, and a spin. Higher prices affect affordability and utility;
lower win frequency reduces utility; changing premium changes expected subjective
prize value per token. Participation also depends on novelty, previous losses,
satisfaction, public actions, waiting, individual budgets, and departures.

The simulator records, before admission:

- eligible decision opportunities;
- expected direct and wheel choices under the modeled choice probabilities;
- sampled direct and wheel purchase attempts, including refused attempts;
- quoted prices and win frequencies.

It separately records accepted spins and direct purchases, capacity refusals,
wheel and direct receipts, completed actions, and completion time. This prevents a
full queue's flat sales curve from being mistaken for absent demand. Offered-wheel
capacity is unavailable when its worst-case reservation would not fit, even if a
smaller direct action could still fit.

`joint-demand-curves.csv` contains a two-dimensional offer-response surface for
each training audience. Compare prices at constant win probability to inspect
premium/price response; compare win probabilities at constant premium to inspect
pacing plus its linked price. These are full-stream policy interventions with common
initial viewer seeds, not static structural demand estimates: offers change budgets,
loss histories, stream length, who arrives before closure, and later public actions.
Even conditional intents per decision can change through that selection. Do not
interpret the slope as a measured human price elasticity.

Supply is finite inventory plus service throughput: 24 completed actions, one queue,
fatigue, breaks, and reservation limits. All accepted spins lock their outcome and
terms when bought. Empty outcomes release the reserved slot; all sold awards remain
obligations. Demand does not create extra action slots. Streams that exhaust the
audience or reach the observation cutoff are reported as incomplete.

The adaptive controller sees only completed and outstanding actions, queue work,
elapsed time, and aggregate purchase intents over the preceding five minutes.
Pressure is the maximum of queue work / 60 seconds and a ten-minute projection of
direct intents / unreserved remaining action slots. Projection uses observed exposure
with a one-minute floor during warm-up. Repeated refused attempts are counted; this
is a deliberately simple pressure signal, not a count of unique future buyers or a
calibrated shadow price. The search chooses which offer to use above/below pressure.
It never sees scenario names, cohort labels, private willingness, personal budgets,
or individual loss histories. The wheel offer is shared by everyone at a given time.

## Experimental separation

Training seeds start at 12000; evaluation seeds start at 20000. One global fixed
and one global adaptive policy are frozen before held-out evaluation. Evaluation
also includes unseen worlds with stronger price sensitivity and stronger probability
sensitivity. They are not used to select offers or thresholds. All policies use the
same initial population and keyed decision shocks per evaluation seed. The original
rate-based and fixed-premium results remain separate historical experiments.

Primary outcome is net contribution per observed stream, including direct receipts,
wheel receipts, delivery costs for all awards, processing, and elapsed operating costs.
Report paired differences and Monte Carlo confidence intervals, conversion and
cannibalization, duration, and quota completion. More spins and more payers alone
are not the objective. Statistical intervals describe random simulation noise;
they do not quantify uncertainty in the behavioral assumptions.

## Limits and calibration needed

Behavior is synthetic, not fitted to users. The response surface is generated by the
specified demand model; a simulator can expose internal tradeoffs but cannot establish
real willingness to pay. One-stream budgets and loss fatigue do not model next-stream
retention, perceived fairness, reputation, or long-term lifetime value. High premiums
may be especially poorly predicted. Production use would need observed offer exposure,
purchase attempts, queues, both sales channels, repeat visits and randomized offer
comparisons, including evidence that performance persists against a good fixed offer.

No production controller is enabled by this PR. Neither positive scenario coverage
nor a large mean simulated uplift establishes that the live product should adopt the
selected premium.

## Reproduce

```sh
pip install -r experiments/return-control/requirements.txt
python -m unittest discover -s experiments/return-control -p 'test_*.py'
python experiments/return-control/joint_experiment.py --training-runs 20 --runs 100 --out experiments/return-control/generated/joint-expanded
python experiments/return-control/joint_report.py experiments/return-control/generated/joint-expanded --out experiments/return-control/results
```

Raw per-stream output and traces are generated separately; the repository includes
compact results, the full training response surface, selections, and source hashes.

Optional figures (matplotlib 3.11.2 used for the checked-in figures):

```sh
pip install matplotlib==3.11.2
python experiments/return-control/joint_plots.py experiments/return-control/generated/joint-expanded --out experiments/return-control/results
```
