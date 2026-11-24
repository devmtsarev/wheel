---
id: UC-08
title: Run a promotion
actor: operator
supporting: [vendor, viewer]
status: tested+gap
gaps: [G5, G11]
note: to be reworked per G11 (promotions are the platform's decision)
depends: [UC-04]
---
Goal: offer a discount, coupon or free spin without dropping below the safe price S_min.
Trigger: marketing campaign, compensation decision.
Pre: the model's wheel is active.
Post: promotion with code, depth d, budget in spins and time window; viewers use it in UC-01 A2.

## Main
1. Operator creates the promotion in the panel: kind (discount|coupon|freespin), d, budget_spins, window. [gap: G5]
2. Panel calls `POST /promos`. openapi promises 422 if d pushes the price below S_min; server only checks 0 < d < 1 and catches S_min at spin time (E1). [spec+server]
3. Operator hands out the code. [outside the system]
4. Viewers spin with the code until budget or window runs out. [tested: T:159]

## Alternatives
- A1 (from step 1) compensation free spin: budget 1 for one viewer after a dispute. [tested: T:159; code not bound to viewer, G11]

## Exceptions
- E1 (from step 4) too deep: discounted price below S_min → spin refused, 409 `promo_invalid`. [tested: T:159]
- E2 (from step 4) code leaked: anyone with the code can exhaust the budget (G11). [gap]

## Acceptance
```gherkin
Feature: UC-08 Run a promotion

@UC-08 @E1 @tested
Scenario: Discount below the safe price at spin time
  Given S_min is 31 and the spin price is 50
  When a spin uses a 50% discount code
  Then the spin is refused with promo_invalid

@UC-08 @main @gap
Scenario: Too-deep discount refused at creation
  Given S_min is 31 and the spin price is 50
  When the operator creates a 50% discount
  Then the server answers 422 and no promotion is created

@UC-08 @A1 @gap
Scenario: Free spin bound to one viewer
  Given a free spin issued to viewer "v-1"
  When viewer "v-2" uses the code
  Then the spin is refused
```
