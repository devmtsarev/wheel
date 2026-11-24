---
id: UC-14
title: Settle the vendor fee
actor: vendor
supporting: [platform]
status: gap
gaps: [G1, G4]
questions: [Q5, Q6]
depends: [UC-01, UC-06]
---
Goal: invoice a fee both sides agree on.
Trigger: end of a settlement period.
Pre: payment scheme agreed (uplift share or revenue share: undecided, TODO 1).
Post: both ledgers match spin by spin; invoice = f × Σ net `paid_price`.

Mirror financial ledger: the vendor's per-spin record of price, `paid_price`, promotion and reserve/commit/release/refund events with `event_id` and delivery state. Not a copy of the viewer's balance; the platform wallet is the source of truth for money.

## Main
1. Vendor exports the period from the mirror ledger. [gap: no persistence, no export; G4]
2. Platform exports wallet operations for the same spins. [gap: no agreed format]
3. Match by `spin_id`. [gap]
4. On full match, invoice f × Σ net `paid_price` (f = 5%, provisional). [spec: docs/model.md]

## Exceptions
- E1 (from step 3) refund after the draw unknown to the vendor (G1). [gap]
- E2 (from step 3) lost `charge.commit`: retries live in memory and vanish on restart; prize given, tokens possibly still on hold (G4). [gap]
- E3 (from step 3) other differences (free spins with paid_price 0, expired holds, duplicate events): contract rule, platform wins on money, vendor log (content_hash, seeds) wins on draws and versions. [proposal]

## Acceptance
```gherkin
Feature: UC-14 Settle the vendor fee

@UC-14 @main @gap
Scenario: Period settles
  Given 1000 committed spins in the period, 10 of them refunded
  When both ledgers are matched by spin_id
  Then every spin matches
  And the invoice equals f times the sum of paid_price of the 990 unrefunded spins

@UC-14 @E2 @gap
Scenario: Webhook retries survive a restart
  Given the server restarts while a charge.commit is being retried
  When it starts again
  Then the retry continues from persistent storage
```
