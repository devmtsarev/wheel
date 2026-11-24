---
id: UC-07
title: Resolve a viewer dispute
actor: operator
supporting: [viewer, vendor]
status: tested+gap
gaps: [G1, G4, G5]
questions: [Q7]
depends: [UC-02, UC-06, UC-10]
---
Goal: close a complaint with evidence and a recorded decision.
Trigger: viewer complains to platform support.
Pre: viewer id known.
Post: viewer gets an answer backed by data; decision in the audit log, visible to the vendor.

## Main ("the draw was unfair")
1. Operator finds the spin: `GET /spins?viewer_id=`. [server; no pagination]
2. Operator opens fairness data, runs the three checks (UC-02). [tested: T:69]
3. Operator sends the proof to the viewer. [prototype: proof screen]
4. Decision written to the audit log with operator id and reason. [gap: audit in memory, not readable via API; G4]

## Alternatives
- A1 @2 "prize not performed": check queue status and `done_at`; if pending or disputed, defer (UC-10 A2) or refund (UC-06). [server: status | gap: defer, refund]
- A2 @2 "charged but no spin": spin `cancelled|expired` must have a matching `charge.release`; duplicates excluded by `event_id` dedup on the platform. [tested: T:97 | spec: dedup]

## Exceptions
- E1 @2 a fairness check fails: escalate to the vendor with spin id; refund (UC-06) while the vendor investigates. [gap]

## Acceptance
```gherkin
Feature: UC-07 Resolve a viewer dispute

@UC-07 @main @tested
Scenario: Fairness complaint answered with proof
  Given a committed spin
  When support opens its fairness data
  Then all three checks pass and the proof can be sent to the viewer

@UC-07 @A1 @gap
Scenario: Prize not performed is refunded and logged
  Given a prize still pending after the stream ended
  When support refunds it with a reason
  Then the decision is written to the audit log with the operator's id
  And the vendor sees it in the settlement report
```
