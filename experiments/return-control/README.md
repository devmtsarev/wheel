# Fixed-premium return controller — experimental

**New: individual viewers and a finite action quota.** See [AGENT_MODEL.md](AGENT_MODEL.md) and [the new results](results/AGENT_RESULTS.md) for cohort-level cannibalization, conversion, changing gaming behavior and whole-stream return. The original rate-based experiment below remains a separate baseline.

The operator sets the premium. The system chooses empty-outcome probability and derives the matching spin price to maximize combined wheel and direct-purchase net contribution, subject to fulfilment capacity. There are no new operator controls for win rate, pacing or admission.

This directory contains a **research implementation and reproducible simulator**. It is not connected to the live widget, server, payment path or current pricing model. Simulation results do not justify enabling autonomous pricing in production. The existing server's price-stepping mechanism is not replaced by this diff.

## Files

- `controller.py`: deterministic candidate scoring and selection; accepts a demand predictor, cannot access future outcomes or alter draws.
- `settings.py`: explicit synthetic menu, premium, price ladder and internal experiment constants.
- `simulate.py`: synthetic demand, pilot fitting, stochastic queue, policy comparisons and raw output.
- `test_controller.py`: economic identities, boundary behavior and accounting checks.
- `summarize.py`: exports reviewable results and source hashes from the complete run.
- `results/RESULTS.md`: absolute expected returns and uncertainty, with no-wheel and fixed-wheel baselines.
- `results/summary.csv`: all 56 policy/scenario summaries.
- `results/basis.json`: scenarios, training-selected offers, fitted coefficients and source hashes.

## One economic lever

For direct action prices `c_i`, the conditional shares among winners are:

```
q_i = (1/c_i) / sum_j(1/c_j)
H = sum_i(q_i * c_i)
P(action i) = p * q_i
P(empty) = 1 - p
spin_price = (1 + premium) * p * H
```

The premium is pool-wide and is unchanged by the controller. Prices and win probabilities cannot be optimized independently under this identity. We enumerate valid whole-token prices and derive `p`, rather than round a price and silently change the premium. Every paid candidate has a positive empty chance and positive reward chances. The experiment uses floating-point probabilities; production draw-precision rounding needs a separate economic consistency check.

The objective is receipts from both channels, less delivery costs for **all awarded actions**, including unfinished obligations, and per-spin processing costs. It is not wheel turnover alone, nominal direct value awarded, or guaranteed money profit. The simulator does not estimate platform/streamer revenue splits, taxes or lifetime value.

## Decision method

1. Estimate demand for the complete `(price, p)` offer from controlled pilots. Fit wheel intent and direct-purchase intent separately, including zero counts. Normalize for audience exposure and condition on recent shared completions and queue state. Because price and p move together, separate causal price and win-rate sensitivities are not identifiable from this experiment.
2. Every two minutes, forecast six minutes for each candidate while holding its terms constant. Predict both sales channels, expected work, capacity refusals and subsequent shared exposure. Current audience and capacity are held constant in the forecast; future spikes are not provided.
3. Choose the highest predicted net contribution. Keep current terms unless the predicted gain exceeds 3% of the absolute current score plus one token over the horizon. This is an experimental anti-oscillation setting, not an operator control.
4. Apply changes only to a new offer version. Once charged, a spin's probability, price and reward version are fixed. No viewer-specific odds or loss-history targeting is used.
5. Before charging, atomically reserve worst-case award work. Other in-flight spins and direct purchases consume the same capacity. Reject new requests before payment if the commitment cannot fit. Never redraw a win or cancel an existing award to make room.

The main policy, `fitted_on`, only chooses paid offers. The separate `fitted` ablation can commercially turn the wheel off if direct business is more valuable. An off state is never a paid all-empty spin. Both policies still use the common capacity safeguard.

The planner's queue forecast is a fluid approximation, not an exact stochastic queue solver. The simulation uses bounded random durations and atomic reservations. Production cannot assume exact knowledge of remaining work, bounded performance duration or instantaneous model-state updates without implementing them.

## Simulation basis

All behavioral coefficients below are **assumptions for sensitivity testing**, not estimates extracted from psychological research.

| Input | Assumption |
|---|---|
| Direct action prices | 20, 60, 120, 240 tokens |
| Typical durations | 5, 15, 30, 60 seconds |
| Wheel reward mix | Inverse-price conditional shares |
| Direct purchase mix | 10%, 20%, 30%, 40% |
| Operator premium | 20%, fixed for every policy |
| Paid price candidates | 8, 16, 24, 32, 40, 48 tokens |
| Resulting win probabilities | Approximately 13.2%, 26.4%, 39.6%, 52.8%, 66.0%, 79.2% |
| Delivery cost | 35% of each awarded action's direct price, token-equivalent |
| Spin processing cost | 0.05 token-equivalent per accepted spin |
| Base wheel demand | 1.5 intents/minute at the 32-token reference before context effects |
| Base direct demand | 0.25 intents/minute; 0.8 in the substitution stress case |
| Audience surge | 4x from minute 15 to 35 |
| Capacity | 30 action-seconds/minute; 15 during minutes 25–45 in the slow-delivery case |
| Duration variability | Uniform 0.5–1.5x typical; reserve a conservative 2x bound |
| Work ceiling | 180 seconds including reservations; longest spin reservation 120 seconds |
| Spin settlement | Five seconds; accepted terms locked |
| Shared exposure | 80% of completed actions visible; five-minute exponential decay, bounded at 3 |
| Session length | 60 minutes; outstanding obligations reported and costed |

The synthetic wheel rate combines a price-response power law, optional low-win aversion, shared exposure and queue-related reluctance. Direct demand has its own mix and substitution/shared-response terms. Arrivals are Poisson; direct and wheel requests are interleaved without guaranteed channel priority. Rejected intents are not charged and do not retry. A lower price can offset or exceed the workload reduction from more empty outcomes.

Eight scenarios cover price insensitivity, fixed expected token spend, stronger price response, shared excitement, shared satiation, direct-purchase substitution, changing preferences and slower delivery. Exact coefficients are in `SCENARIOS` and the result basis. Shared events mean actions actually performed, not just win announcements.

### Fit, selection and evaluation

- Each scenario has 1,750 independent synthetic two-minute pilot observations, 250 per offer including wheel-off, across randomized audience/exposure/wait contexts; seed 2718.
- Poisson regressions use offer intercepts, shared exposure and waiting time with an audience exposure offset. All counts, including zeros, participate in fitting. The generator and fitted response share a functional family: this is a favorable modelling assumption.
- The best fixed benchmark is selected from seven offers using 20 separate one-hour training streams per offer, seeds 1000–1019.
- Held-out evaluation uses seeds 7000–7099: 100 streams for each of 7 policies and 8 scenarios, **5,600 recorded streams**.
- The response model is frozen during evaluation. Decisions adapt to state, but this is not a test of live online learning or automatic refitting.
- The preference-shift scenario changes demand after minute 30. Its response fit uses the original pilot; fixed-offer training includes full shifted sessions. This is an asymmetric stress comparison and is documented rather than called a fair test of adaptation to a previously unseen change.

The seven policies are no wheel, fixed 32-token offer, “more empty when busy,” best fixed selected in training, the main fitted controller, the controller with optional commercial wheel closure, and a known-demand planner. The last knows the current demand law but not future events and uses the same imperfect forecast: it is not an optimal upper bound.

## Results and acceptance boundary

See [absolute return comparisons](results/RESULTS.md). Results are scenario-conditioned means of synthetic net contribution per hour, with paired Monte Carlo intervals for differences. They are not estimates of real-world profit. Do not average scenarios without evidence about their actual prevalence.

The controller improves several comparisons with the default offer but does not consistently beat a strong fixed offer. In the price-sensitive scenario, the planner makes worse decisions than the training-selected fixed offer even with a known demand law. This points to forecast/queue approximation error, not merely insufficient training data. A rollout should require a separate validation gate demonstrating benefit over the best validated fixed offer; that deployment gate is not implemented here.

Capacity guards kept the simulated work bound but often refused requests. They are shared by all policies, so their benefits are not attributed to the empty-probability optimizer. No claim about satisfaction, fairness of access or acceptable refusal frequency follows from the return metric.

Not modelled: individual budgets, abandonment, retry behavior, long-term retention, trust effects of changing terms, actual action batching, delivery failures, end-of-stream shutdown, draw quantization and real fees/costs. The available price domain is bounded for the experiment; a boundary choice is only best within that domain. Service time and unfinished obligations must not be confused with elapsed waiting time. Completed-only delay metrics exclude unfinished actions.

## Reproduce

Python 3.14 was used for the recorded results. Dependencies are isolated and pinned.

```sh
cd experiments/return-control
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest discover -p 'test_*.py'
.venv/bin/python simulate.py --runs 100 --out generated
.venv/bin/python summarize.py generated/results.json --out results
```

`generated/results.json` includes full summaries, traces and fitted coefficients; `generated/runs.csv` contains every evaluation record. Large raw outputs are ignored by Git; compact results are checked in. Source hashes in the basis identify the exact experiment.

Tests and runtime assertions cover the premium identity, inverse-price proportions, fixed-budget cancellation, off-mode boundaries, invalid predictor outputs, deterministic replay, no-wheel accounting, conservation of work, reservation limits and contribution accounting including final settlements.
