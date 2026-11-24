---
id: UC-08
title: Run a promotion
actor: operator
supporting: [platform, vendor]
status: tested
gaps: [G14]
depends: [UC-01]
---
Goal: offer discounts, coupons or free spins to viewers.
Trigger: marketing campaign, compensation decision.
Pre: the model's wheel is active.
Post: discounted spins are drawn exactly like full-price ones; reports show the price and the amount actually paid.

Rule: promotions live entirely in the platform's own systems. The vendor does not know promo codes, budgets or limits and does not check the paid amount against S_min. docs/model.md («Базовая цена, скидки и фриспины») gives recommended limits (discounts up to 38%, deeper only as budgeted coupons) that the platform may apply; the vendor does not enforce them.

## Main
1. Operator sets up the promotion in the platform's own tools: kind, depth, budget, who gets it. [platform]
2. Viewer spins (UC-01). [tested: T:48]
3. Platform applies the promotion when it charges and confirms with the lower amount (UC-01 A2). [tested: T:123]
4. Vendor records the price and the paid amount; the prize and odds are the same as for a full-price spin. [tested: T:123]
5. Reports show price, paid amount and the difference per period (UC-09). [gap: G14]

## Acceptance
```gherkin
Feature: UC-08 Run a promotion

@UC-08 @main @tested
Scenario: Main. Discounted spin is drawn like any other
  Given a requested spin at price 50
  When the platform confirms with paid amount 10
  Then the spin is drawn with the same chances
  And the spin records price 50 and paid amount 10
```
