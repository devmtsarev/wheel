# Gaps and open questions

Priority: G1–G5 and G15 before the pilot. Proposals are drafts, not decisions.

## Gaps

| ID | Gap | UCs | Proposal | Change in |
|---|---|---|---|---|
| G1 | No refund record after the draw | 06 07 10 14 | Platform refunds in its wallet, then reports `POST /spins/{id}/refund` {refunded_amount, reason} (idempotent); prize → rejected; excluded from fee base. Refund started in the Control Panel → webhook `spin.refund_requested` to the platform | openapi, server |
| G2 | Prize has only `pending`/`done` | 06 10 | Statuses `deferred`, `rejected`, `expired`; `POST /queue/{id}/defer`, `POST /queue/{id}/reject` {reason}; webhook + WS `prize.updated` | openapi, server |
| G3 | Prizes stay pending after stream end | 10 12 | On `live=false`: pending → deferred with expiry; on expiry → expired + refund. Period in contract | server, contract |
| G4 | No persistence, readable audit or reconciliation | 06 07 14 | Persistent storage for spins, paid amounts, audit and the webhook retry queue; `GET /audit`, `GET /reports/settlement?from&to` | server, openapi |
| G5 | No Platform Control Panel | 04 05 06 07 08 09 11 | Vendor-hosted UI per `model_id`: wheel config with price preview, pause, refund, reject/defer, promos, reports, operator accounts and roles. Screens: `experience/operator`, `experience/manage` | new component |
| G6 | ~~Platform's decline reason not shown to the viewer~~ | 01 | Closed: `POST /spins/{id}/cancel` {message} → WS `spin.cancelled` | — |
| G7 | No manual pause | 05 | `paused` flag in `StreamState` or `POST /models/{id}/pause|resume`; admission reason `paused` | openapi, admission.js |
| G8 | Viewer can't see prize status or history | 03 | Prize status in `GET /spins/{id}`; own spins via `widget_token`, paged | openapi, server |
| G9 | Displayed price vs locked price undefined | 01 | Decide: price is locked at the click (re-confirm if changed, current behaviour) or honoured for N s after display. Then make `shown_price` mandatory and fix api/README "30 s" | api/README, server |
| G10 | No A/B test | 13 | Multiple active versions with weights; group = hash(`viewer_id`); `group` in `Spin`; control group; spending export | openapi, server, contract |
| G11 | ~~Vendor validates promotions~~ | 01 08 | Closed: platform reports `paid_amount` in commit; promo codes and S_min checks removed | — |
| G12 | Wheel settings lag product decisions | 04 | k > 1, empty sector z, chances from prices without weights (TODO 4) | openapi, server |
| G13 | ~~Spending limits, jurisdiction~~ | — | Out of scope: the platform enforces them before confirming payment (UC-01 E2) | — |
| G14 | No report API | 09 | Pagination for `GET /spins`; aggregates endpoint | openapi, server |
| G15 | Widget spin requests are not idempotent | 01 | Accept `Idempotency-Key` on `POST /spins` from the widget, scoped to `viewer_id` | server, api/README |

## Open questions

| ID | Question | UCs |
|---|---|---|
| Q1 | Who marks a prize done: operator in the panel, or model via a button on the platform's stream screen? | 10 |
| Q2 | Does the platform config file stay supported next to the panel; which wins on conflict? | 04 |
| Q3 | Who may refund after the draw: operator only, or the model too? | 06 |
| Q4 | How long does a deferred prize live; is viewer consent required? | 10 |
| Q5 | Is a refund excluded from the fee base; does the vendor earn on free spins (`paid_price` = 0)? | 06 14 |
| Q6 | On mismatch: platform wins on money, vendor on draws? | 14 |
| Q7 | Who is liable to the viewer for an unfulfilled prize? | 07 10 |

Working assumptions until answered (keep values configurable): Q1 operator; Q2 last write wins, both channels call `POST /wheels`; Q3 operator; Q4 deferral period configurable (placeholder 7 days), consent required; Q5 refunds excluded, fee = f × paid amount (free spins earn 0); Q6 yes; Q7 platform.
