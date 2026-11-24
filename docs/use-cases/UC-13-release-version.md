---
id: UC-13
title: Release a new wheel version
actor: vendor
supporting: [operator]
status: tested+gap
gaps: [G10]
depends: [UC-04]
---
Goal: change pricing or the wheel without breaking drawn spins, and compare versions.
Trigger: change in `calc/model.js`, pilot result.
Pre: model tests pass.
Post: new versions active; old spins keep their version, proof and refund amount.

## Main
1. Change the formula in `calc/model.js` and the test with document numbers; rebuild calculator; update docs. [tested: calc/model.test.js, server tests in CI]
2. Deploy the server; operators republish wheels (UC-04), each gets a new `content_hash`. [tested: T:25]
3. Old spins keep their `content_hash`; fairness checks and refunds use original data. [server: Spin.content_hash; prototype keeps a menu snapshot per spin]

## Alternatives
- A1 (from step 2) A/B test: two versions active for one model; viewer group by hash of `viewer_id`; control group sees no wheel; platform exports menu spending per group. [gap: one active version per model, no group field, no export; G10, TODO 7]

## Acceptance
```gherkin
Feature: UC-13 Release a new wheel version

@UC-13 @main @server
Scenario: Main. Old spins keep their version
  Given a committed spin on version A
  When version B becomes active
  Then the spin's fairness data still verifies against version A

@UC-13 @A1 @gap
Scenario: A1. Stable A/B assignment
  Given versions A and B are active for one model with a 50/50 split
  When 1000 different viewers open the wheel
  Then each viewer always sees the same version
  And every spin records its group
```
