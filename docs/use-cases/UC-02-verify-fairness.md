---
id: UC-02
title: Verify a spin's fairness
actor: viewer
supporting: [operator]
status: tested
gaps: []
depends: [UC-01]
---
Goal: confirm the result was fixed before payment and not changed.
Trigger: viewer opens the details of a finished spin.
Pre: spin is `committed`.
Post: widget shows that all three checks pass.

## Main
1. Viewer opens spin details in the widget. [prototype: experience/shared/fairness.js]
2. Widget requests `GET /spins/{id}/fairness`: server_seed, server_seed_hash, client_seed, nonce, content_hash, menu with ppm, formula. [tested: T:75]
3. Widget checks: SHA-256(server_seed) = the server_seed_hash received before payment (UC-01 step 3); HMAC gives the same number; number falls in the won item's ppm interval; content_hash matches the version's menu. [tested: T:75, fair.js verify]
4. Widget shows "verified". [prototype]

## Alternatives
- A1 (from step 1) independent check: viewer copies the data and recomputes with any HMAC tool. [spec]

## Exceptions
- E1 (from step 3) a check fails: widget names the failed check and offers support with the spin id (UC-07). [gap]

## Acceptance
```gherkin
Feature: UC-02 Verify a spin's fairness

@UC-02 @main @tested
Scenario: Fairness verifies
  Given a committed spin
  When its fairness data is requested
  Then SHA-256 of server_seed equals the hash returned before payment
  And the recomputed number falls in the interval of the won item

@UC-02 @E1 @gap
Scenario: A check fails
  Given fairness data that does not verify
  When the widget runs the checks
  Then the widget names the failed check
  And offers to contact platform support with the spin id
```
