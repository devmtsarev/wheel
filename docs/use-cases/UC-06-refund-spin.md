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
Trigger: refused or unfulfilled prize (UC-10), dispute decision (UC-07), expired deferral (UC-10 E2).
Pre: spin exists.
Post: viewer gets the original `paid_price` back exactly once; prize `rejected`; refund excluded from the fee base.

Rule: a drawn spin is never undone. A refund is a new event on top of it; history and fairness proof stay unchanged.

## Main (after the draw)
1. Operator finds the spin in the panel, presses "Refund" with a reason. [gap: G5; prototype has it]
2. Panel calls `POST /spins/{id}/refund` {reason, Idempotency-Key}; server sets prize `rejected`, sends `charge.refund` {amount: original paid_price}. [gap: G1, G2]
3. Platform credits the viewer, answers 200. [gap: G1]
4. Mirror ledger records the refund; reports and fee base exclude it. [gap: G4; prototype keeps refunds in reports]

## Alternatives
- A1 @2 before the draw: spin still `reserved` → `POST /spins/{id}/cancel` → `charge.release`. [tested: T:97]

## Exceptions
- E1 @1 already refunded: second refund refused, nothing credited. [prototype: store.test.mjs "refund uses original charge and cannot happen twice"]
- E2 platform refunds in its own wallet bypassing the vendor: prize stays `pending`, fee charged as if nothing happened (G1, G4). [gap]

## Acceptance
```gherkin
Feature: UC-06 Refund a spin

@UC-06 @main @gap
Scenario: Refund after the draw at the original price
  Given a committed spin paid 40 tokens at a price that has since changed to 55
  When the operator refunds it with reason "model refused"
  Then the platform receives charge.refund for 40 tokens
  And the prize status becomes rejected
  And the spin no longer counts towards the vendor fee

@UC-06 @A1 @tested
Scenario: Cancel before the draw
  Given a reserved spin
  When it is cancelled
  Then the platform receives charge.release for the held amount

@UC-06 @E1 @gap
Scenario: Refund only once
  Given a refunded spin
  When the operator refunds it again
  Then the request is refused and nothing is credited
```
