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

Mirror financial ledger: the vendor's per-spin record of price, `paid_price` reported by the platform, and requested/committed/cancelled/expired/refunded events with their time. Not a copy of the viewer's balance; the platform wallet is the source of truth for money.

## Main
1. Vendor exports the period from the mirror ledger. [gap: no persistence, no export; G4]
2. Platform exports wallet operations for the same spins. [gap: no agreed format]
3. Match by `spin_id`. [gap]
4. On full match, invoice f × Σ net `paid_price` (f = 5%, provisional). [spec: docs/model.md]

## Exceptions
- E1 (from step 3) Refund after the draw unknown to the vendor (G1). [gap]
- E2 (from step 3) Platform charged for a spin that expired or was cancelled: the vendor recorded no payment, the platform must show a matching refund; a charge without one is the platform's to correct. [gap: G4]
- E3 (from step 3) Other differences (free spins with paid_price 0, duplicate events): contract rule, platform wins on money, vendor log (content_hash, seeds) wins on draws and versions. [proposal]

## Acceptance
```gherkin
Feature: UC-14 Settle the vendor fee

@UC-14 @main @gap
Scenario: Main. Period settles
  Given 1000 committed spins in the period, 10 of them refunded
  When both ledgers are matched by spin_id
  Then every spin matches
  And the invoice equals f times the sum of paid amount of the 990 unrefunded spins

@UC-14 @E1 @gap
Scenario: E1. Refund unknown to the vendor
  Given the platform's export shows a refund the vendor has no record of
  When the ledgers are matched
  Then the spin is flagged and excluded from the invoice until the refund is reported

@UC-14 @E2 @gap
Scenario: E2. Expired spin with a charge on the platform side
  Given a spin expired without confirmation
  And the platform's export shows a charge for it and no refund
  When the ledgers are matched
  Then the spin is flagged for the platform to refund

@UC-14 @E3 @gap
Scenario: E3. Free spin
  Given a committed spin with paid amount 0
  When the ledgers are matched
  Then the spin matches and adds 0 to the fee
```
