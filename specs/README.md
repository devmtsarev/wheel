# Use cases

Source of truth for product behaviour. One file per use case; load only the ones you need.
Gaps and open questions: [gaps.md](gaps.md). Human-readable version with diagrams: Claude Doc "Prize Wheel: Use Cases and Scenarios".

## Index

| ID | File | Actor | Status | Gaps |
|---|---|---|---|---|
| UC-01 | [UC-01-spin-the-wheel.md](UC-01-spin-the-wheel.md) | viewer | tested | G6 G9 G13 |
| UC-02 | [UC-02-verify-fairness.md](UC-02-verify-fairness.md) | viewer | tested | — |
| UC-03 | [UC-03-view-own-spins.md](UC-03-view-own-spins.md) | viewer | gap | G8 |
| UC-04 | [UC-04-configure-wheel.md](UC-04-configure-wheel.md) | operator | tested+gap | G5 G12 |
| UC-05 | [UC-05-pause-resume.md](UC-05-pause-resume.md) | operator | gap | G5 G7 |
| UC-06 | [UC-06-refund-spin.md](UC-06-refund-spin.md) | operator | tested+gap | G1 G2 G4 G5 |
| UC-07 | [UC-07-resolve-dispute.md](UC-07-resolve-dispute.md) | operator | tested+gap | G1 G4 G5 |
| UC-08 | [UC-08-run-promotion.md](UC-08-run-promotion.md) | operator | tested+gap | G5 G11 |
| UC-09 | [UC-09-review-reports.md](UC-09-review-reports.md) | operator | prototype+gap | G5 G14 |
| UC-10 | [UC-10-fulfil-prize.md](UC-10-fulfil-prize.md) | model | tested+gap | G1 G2 G3 |
| UC-11 | [UC-11-connect-platform.md](UC-11-connect-platform.md) | platform | tested+spec | G5 |
| UC-12 | [UC-12-run-live-stream.md](UC-12-run-live-stream.md) | platform | tested | G3 |
| UC-13 | [UC-13-release-version.md](UC-13-release-version.md) | vendor | tested+gap | G10 |
| UC-14 | [UC-14-settle-fee.md](UC-14-settle-fee.md) | vendor | gap | G1 G4 |

## Actors

- viewer: pays tokens, spins, waits for the prize. Uses the widget only.
- operator: platform staff. Configures wheels per `model_id`, pauses, refunds, resolves disputes, runs promotions, reads reports. Uses the Platform Control Panel (G5) or the platform's config file.
- platform: platform backend. Holds the wallet (source of truth for money), reports stream state, shows the queue to the model.
- model: performs prizes on stream. Configures nothing; no interface of her own.
- vendor: us. Owns price, admission, draw, prize queue, audit log (`server/`, `calc/`).

## File format

```
---
id, title, actor, supporting, status, gaps, questions, depends   # YAML front matter
---
Goal / Trigger / Pre / Post      # one line each
## Main                          # numbered steps
## Alternatives                  # A<n> @<step>: ... (goal still reached)
## Exceptions                    # E<n> @<step>: ... (goal not reached)
## Acceptance                    # Gherkin
```

Each step ends with `[status: evidence]`.

| status | meaning |
|---|---|
| tested | in `server/`, covered by `server/test/api.test.js` (line given as `T:<line>`) |
| server | in `server/`, no test |
| spec | in `api/openapi.yaml` or `api/README.md` only, or code differs |
| prototype | only in `experience/` (browser, no API) |
| gap | nowhere; see gaps.md |

Gherkin tags: `@UC-xx`, `@main|@A<n>|@E<n>`, `@tested|@server|@gap`. Scenarios describe the target behaviour. `@tested` must keep passing; `@server` is implemented but needs a test; `@gap` is work to do.

Scope: product (`api/`, `server/`, `calc/`). `experience/` is a reference prototype only.
