# Individual viewers and a finite-action stream

This extension replaces aggregate arrival-rate assumptions with individual viewers for a second, separate experiment. It keeps the earlier rate-based model and results available for comparison; their numerical results are not interchangeable.

## What changed

- Each synthetic viewer has a preferred action, willingness to pay, finite budget, arrival/departure schedule, thinking frequency, waiting tolerance, gaming interest, social response, personal loss streak and purchase history.
- Viewers start in three cohorts: ready to buy an action, unsure, and not initially willing to buy an action. Cohort labels stay fixed for attribution, while behavior changes during the stream. The controller never sees these labels or private viewer states.
- Direct purchase, wheel spin and doing nothing are competing choices. A wheel purchase is not automatically an incremental sale: the same viewer may otherwise have bought directly.
- The streamer ends the stream once a fixed action quota has been **completed**, rather than at an arbitrary one-hour boundary. Direct awards and wheel awards consume the same slots. Empty draws do not consume an action slot.
- Return is evaluated per entire observed stream. An hourly rate is also exported, but it is not the training objective: a shorter stream can have higher hourly receipts yet less total return.

## Viewer model

Initial group proportions are 25% ready, 35% unsure and 40% not ready in the balanced scenario. We also test a buyer-heavy audience, a curious audience, fatigue/free riding and slower delivery. These proportions and every behavioral coefficient are synthetic assumptions, not measured conversion rates.

The initial willingness-to-pay multipliers have group means 1.35, 0.95 and 0.42 times the preferred action's price, with individual variation. Ready viewers can afford their preferred action initially. Other viewers have varied finite budgets; the initially unwilling group's entertainment budget is sampled from 16/32/64/96 tokens. No automatic replenishment or cash/token prize is possible.

Each viewer's decision clocks and exogenous shocks are coupled across policies for comparison. The outside option is explicit. When considering a purchase:

- Direct utility depends on willingness to pay, ownership/satisfaction, waiting, prior purchases and social excitement. The direct option requires both sufficient funds and effective willingness at least 0.8. Excitement may change effective willingness, but initial cohort identity is retained in reports.
- Wheel utility combines subjective expected action value, mismatch with the preferred action, entertainment value, entry price, chance of an action, waiting, recent losses, satiation and novelty decay.
- The price and action probability are linked by the fixed 20% premium; action shares remain inversely proportional to direct prices. Subjective value is not treated as cash winnings.
- A softmax choice among direct/spin/watch expresses uncertainty and individual variation. Utilities are modeling hypotheses, not a calibrated estimate of choice probabilities.

State changes matter. A win produces temporary excitement. A personally fulfilled preferred action reduces further need. Seeing a matching public action can satisfy a viewer without paying. Some viewers respond positively to shared actions, some ignore them, and others dislike overload. Repeated losses usually reduce wheel appeal and can stop further purchasing. A small synthetic minority persists longer after losses, but finite budgets still bind. The optimizer does not target these viewers or use their loss history.

Some viewers leave during overload or stop buying because of waiting. A viewer who leaves before fulfilment does not cancel a sold obligation: the streamer still performs it. Arrival/departure times and budgets are finite. The simulation records repeat spins, faster repeat intervals, ignored wheel exposure, loss-related stops, waiting-related stops and overload departures separately.

## Streamer and reservation model

The default quota is 24 actions. The streamer serves a single queue, spending 40% of elapsed time on actions; the slow case spends 25%. Duration varies from 0.8 to 1.2 times the menu estimate, with additional fatigue as completed actions approach the quota. The streamer takes a 45-second break when a six-action milestone is observed. Multiple completions can occur within a ten-second step, so the break schedule is a discrete approximation.

Before charging, the simulator requires:

```
completed actions + queued actions + in-flight spins + proposed slot <= quota
remaining work + reserved worst-case work + proposed reservation <= 180 seconds
```

A spin reserves one action slot and 120 seconds of worst-case work until it settles ten seconds later. An empty releases both. A win replaces its reservation with the actual action obligation. Direct purchases reserve their own bounded duration. Checks are atomic within a simulation step. No already-paid spin has its terms changed; no win is rejected or redrawn.

The stream closes only when all quota actions have been completed, at which point there can be no remaining queue or in-flight spins. If the audience is exhausted before then, the simulation reports a stalled/incomplete stream. A 180-minute observation limit is also treated as censoring, not successful stream completion. Any charged spins at that limit are settled and all awarded costs counted; unfinished actions are reported. The model is a closed finite audience, not an infinite arrival process.

## Controller comparison

The old six-minute demand planner was built for a continuing stream and cannot be assumed to optimize a finite action inventory. For this experiment we train a small, auditable **full-stream offer schedule**:

- Choose one offer for the first half of completed actions and one for the second half.
- Evaluate all 36 combinations of the six existing price/probability offers on 20 training seeds per scenario.
- Select the pair with the highest mean full-stream net contribution.
- Evaluate on 100 disjoint seeds with the same initial populations as the comparison policies.

The runtime schedule sees only completed actions and the known action quota. It does not inspect cohort, individual budget, preferred action, loss history or future draws. Every viewer receives the same current offer. A spin accepted before a phase transition retains its original terms.

Comparisons are no wheel, fixed 32-token wheel, more-empty-when-busy, best fixed offer selected from training and the trained two-phase schedule. Fixed offers are included as pairs with the same offer in both halves, so a fixed offer can win. The schedule does not commercially turn the wheel off. This is not a globally optimal policy, online reinforcement learner or production replacement; it is an interpretable baseline for finite-inventory control.

Training uses seeds 1000–1019; evaluation uses 7000–7099. Five scenarios × 36 schedules × 20 seeds give 3,600 training streams; five scenarios × five policies × 100 seeds give 2,500 recorded evaluation streams. The simulator also runs matched no-wheel counterfactuals for attribution. Selection is based only on training outcomes. There is no separate validation promotion gate yet.

## Costs, attribution and metrics

Net contribution is wheel receipts plus direct receipts, minus 35% of the direct value of all awarded actions, 0.05 token-equivalent per accepted spin, and 0.25 token-equivalent per elapsed minute. These costs are assumptions. All obligations are charged economically when awarded, even if incomplete at observation cutoff.

Report total return, observed duration, quota completion rate, unfinished awards and hourly return together. An incomplete baseline's observed return is not extrapolated to an eventual successful stream. This matters especially in the slow-streamer case.

For each initial cohort, compare matched viewers against no wheel:

- New payers: spent zero without the wheel, positive amount with it.
- Lost payers: paid without the wheel, spend zero with it.
- Gross direct spending displaced, gross direct spending gained and their net difference.
- Viewers who bought directly without the wheel and shift some spending to wheel spins.
- Total cohort spending change, wheel conversions and repeat behavior.

New payers are not simply all wheel payers. Gross displacement is not the same as net loss: one person's direct spending can fall while another's increases. These are counterfactual comparisons inside a specified simulator, not empirical causal estimates.

## Research boundary

Research motivates testing multiple directions, not selecting numeric coefficients:

- [James, O'Malley and Tunney (2016)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.00046/full) found that reinforcement and timing affect persistence differently across phases of a simulated gambling task. Continued play is not interchangeable with enjoyment. This supports heterogeneous persistence/withdrawal scenarios, not a calibrated loss-streak formula.
- [Nematzadeh et al.](https://arxiv.org/abs/1610.06497) observed reduced per-capita participation during Twitch communication overload. Applying overload sensitivity to wheel-driven interactions is a hypothesis; their study did not estimate wheel purchase probabilities.

No claim is made that this is now a validated model of real viewers. Cohort mix, willingness, entertainment utility, satiation, persistence, costs and action supply require pilot data. Other missing effects include repeated streams, retention, new audience arrivals after the initial cohort, subscriptions/tips, changing action availability, order priority, cancellations/refunds, and signalling the announced stream ending. Shorter response time resolution and alternative utility forms are future sensitivity checks.

## Reproduce

Using the environment in the parent README:

```sh
python -m unittest discover -p 'test_*.py'
python agent_experiment.py --runs 100 --training-runs 20 --out generated/agents
python agent_report.py generated/agents/agent-results.json --out results
```

See [AGENT_RESULTS.md](results/AGENT_RESULTS.md), `agent-summary.csv` and `agent-basis.json`. Full per-stream records and example traces remain in ignored `generated/agents/`. No live player, operator or server behavior is changed by this experiment.
