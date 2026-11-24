---
id: UC-06
title: Refund a spin
actor: operator
supporting: [platform, vendor]
status: tested+gap
gaps: [G1, G2, G4, G5]
questions: [Q3, Q5]
depends: [UC-01]
---
Goal: return the viewer's tokens and keep the vendor ledger and prize queue consistent.

The platform moves the money; the vendor records the refund so the prize and the fee base stay right.
Trigger: refused or unfulfilled prize (UC-10), dispute decision (UC-07), expired deferral (UC-10 E2).
Pre: spin exists.
Post: viewer gets the original `paid_price` back exactly once; prize `rejected`; refund excluded from the fee base.

Rule: a drawn spin is never undone. A refund is a new event on top of it; history and fairness proof stay unchanged.

## Main (after the draw)
1. Operator decides to refund a drawn spin, with a reason. [gap: G5; prototype has a Refund button]
2. Platform credits the viewer's wallet with the original `paid_price` in its own transaction. [platform]
3. Platform reports it: `POST /spins/{id}/refund` {refunded_amount, reason, Idempotency-Key}; vendor sets the prize `rejected`. [gap: G1, G2]
4. Mirror ledger records the refund; reports and fee base exclude it. [gap: G4; prototype keeps refunds in reports]

## Alternatives
- A1 (from step 1) Before the draw: spin still `requested`; the platform does not charge (or refunds itself) and cancels it. Nothing to record. [tested: T:103]
- A2 (from step 1) Refund started in the Control Panel: the panel asks the platform to refund (webhook `spin.refund_requested`); continue at step 2. [gap: G1, G5]

## Exceptions
- E1 (from step 1) already refunded: second refund refused, nothing credited. [prototype: store.test.mjs "refund uses original charge and cannot happen twice"]
- E2 (from step 3) Platform refunds but never reports it: prize stays `pending`, fee charged as if nothing happened; caught by reconciliation (UC-14). [gap: G1, G4]

## Acceptance
```gherkin
Feature: UC-06 Refund a spin

@UC-06 @main @gap
Scenario: Refund after the draw at the original price
  Given a committed spin paid 40 tokens at a price that has since changed to 55
  When the platform credits 40 tokens and reports the refund with reason "model refused"
  Then the prize status becomes rejected
  And the spin no longer counts towards the vendor fee

@UC-06 @A1 @tested
Scenario: A1. Before the draw
  Given a requested spin
  When the platform cancels it
  Then no result is drawn and no refund is needed

@UC-06 @E1 @gap
Scenario: Refund only once
  Given a refunded spin
  When the operator refunds it again
  Then the request is refused and nothing is credited
```
