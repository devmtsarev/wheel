---
id: UC-09
title: Review wheel reports
actor: operator
supporting: [vendor]
status: prototype+gap
gaps: [G5, G14]
depends: [UC-06, UC-14]
---
Goal: see revenue, refunds, net, prize frequency, win rate and the vendor fee for a period.
Trigger: weekly review, settlement date.
Pre: spins exist for the period.
Post: dashboard and CSV export that match the settlement report (UC-14).

## Main
1. Operator selects period and model in the panel. [prototype: experience/manage/]
2. Panel shows spins, total at spin price, total actually paid (as reported by the platform), discounts as the difference, refunds, net paid, prize frequency vs configured chances, value win rate, jackpots. [prototype: totals at price only]
3. Panel shows the vendor fee and, after the pilot, uplift vs a control group. [gap]
4. Operator exports CSV. [prototype]

## Exceptions
- E1 (from step 2) large period: `GET /spins` returns one unpaged list, no aggregates (G14). [gap]

## Acceptance
```gherkin
Feature: UC-09 Review wheel reports

@UC-09 @main @gap
Scenario: Period report
  Given 120 spins in November, 3 of them refunded
  When the operator opens the November report
  Then totals at price and paid are shown
  And net paid equals paid minus refunds
  And the vendor fee equals f times the net paid price
```
