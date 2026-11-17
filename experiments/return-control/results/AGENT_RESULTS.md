# Individual-viewer, finite-action results

100 held-out seeds × 5 policies × 5 scenarios = 2,500 evaluation streams. Each scenario's schedule is selected using 20 separate training seeds per candidate.

**Primary outcome: net token-equivalent contribution per observed stream, not per hour.** Streams complete after 24 actions. Runs that exhaust the audience or hit the observation cutoff without 24 completions are reported as incomplete, not successful stream endings. Their observed contribution is included below; no revenue is imputed beyond observation.

| Audience | No wheel | Fixed 32-token wheel | Trained offer schedule | Best fixed from training | Schedule prices, first/second half |
|---|---:|---:|---:|---:|---|
| Balanced | 1,300 | 1,215 | 1,345 | 1,345 | 8/8 |
| Buyer-heavy | 1,116 | 1,139 | 1,220 | 1,203 | 16/8 |
| Curious audience | 1,491 | 1,157 | 1,331 | 1,331 | 8/8 |
| Fatigue / free riding | 1,524 | 1,301 | 1,368 | 1,368 | 16/16 |
| Slow streamer | 1,334 | 1,228 | 1,320 | 1,300 | 16/8 |

## Stream duration and completion

| Audience | No wheel minutes | Fixed wheel minutes | Trained schedule minutes | No-wheel quota completion | Trained quota completion |
|---|---:|---:|---:|---:|---:|
| Balanced | 27.9 | 25.4 | 29.6 | 100% | 100% |
| Buyer-heavy | 23.6 | 24.2 | 25.9 | 100% | 100% |
| Curious audience | 40.1 | 24.3 | 30.7 | 91% | 100% |
| Fatigue / free riding | 41.7 | 26.2 | 28.9 | 89% | 100% |
| Slow streamer | 68.6 | 40.6 | 48.2 | 50% | 96% |

## Who pays and who is displaced

For the trained schedule, matched against the same initial viewers in the no-wheel counterfactual. Cohorts describe initial willingness, not permanent purchasing rules. Lost direct spend is a gross matched-viewer decrease; the net direct change also includes viewers whose direct spending increases. These are causal comparisons inside the simulator, not estimates from customers.

| Audience | New initially-unwilling payers | Ready-group lost direct spend | Ready-group net direct change | Ready-group lost payers | Unsure new payers |
|---|---:|---:|---:|---:|---:|
| Balanced | 14.4 | 511 | -69 | 3.3 | 9.0 |
| Buyer-heavy | 2.1 | 570 | +68 | 6.0 | 3.3 |
| Curious audience | 31.8 | 335 | -184 | 1.4 | 10.7 |
| Fatigue / free riding | 12.2 | 781 | -433 | 4.1 | 8.6 |
| Slow streamer | 11.9 | 542 | -179 | 3.2 | 7.5 |

## Gaming response

Counts per stream for the trained schedule. Faster-repeat count means at least five spins with shorter average intervals for the last two gaps than the first two. It is descriptive: price changes and waiting can contribute, so it is not a clinical or psychological classification.

| Audience | Repeat spinners | Faster-repeat spinners | Exposed but never spin | Stop after losses | Stop because of waiting | Leave during overload |
|---|---:|---:|---:|---:|---:|---:|
| Balanced | 8.2 | 0.0 | 69.3 | 0.5 | 20.8 | 4.5 |
| Buyer-heavy | 0.8 | 0.0 | 92.4 | 0.0 | 26.7 | 5.2 |
| Curious audience | 23.8 | 0.2 | 44.6 | 2.1 | 10.6 | 3.1 |
| Fatigue / free riding | 4.7 | 0.0 | 72.5 | 0.0 | 18.3 | 11.5 |
| Slow streamer | 7.7 | 0.0 | 73.6 | 0.5 | 64.6 | 1.4 |

## Paired uncertainty

Mean net differences and 95% normal Monte Carlo intervals, token-equivalents per observed stream. These describe simulation randomness, not uncertainty about actual people or the model. Comparisons are exploratory.

| Audience | Trained minus no wheel | Trained minus fixed 32 | Trained minus best fixed |
|---|---:|---:|---:|
| Balanced | +46 [-2, +93] | +130 [+85, +176] | +0 [+0, +0] |
| Buyer-heavy | +104 [+74, +133] | +81 [+49, +113] | +17 [-1, +34] |
| Curious audience | -160 [-215, -105] | +174 [+122, +225] | +0 [+0, +0] |
| Fatigue / free riding | -156 [-212, -99] | +67 [+16, +118] | +0 [+0, +0] |
| Slow streamer | -14 [-63, +35] | +92 [+47, +137] | +20 [-13, +52] |

## Interpretation

- Conversion alone is not success: new wheel payers can coexist with lower total return and displaced direct buyers.
- Cheap or random actions consume the same finite action slots as direct purchases; catalogue mix and early stream termination matter.
- Three scenarios select the same offer for both halves. Extra scheduling complexity is not automatically useful.
- No-wheel baselines sometimes fail to reach the action quota within the finite audience lifetime. Read completion rates alongside return; do not treat censored runs as fully completed streams.
- The trained schedule cannot choose wheel-off commercially. A no-wheel result can therefore exceed the best tested wheel schedule.
- This is a richer mechanistic hypothesis, not a calibrated model of real users. See [AGENT_MODEL.md](../AGENT_MODEL.md).
