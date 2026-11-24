---
id: UC-03
title: View own spins and prizes
actor: viewer
supporting: [platform]
status: gap
gaps: [G8]
depends: [UC-01, UC-10]
---
Goal: see past spins and whether each prize was fulfilled, deferred or refunded.
Trigger: viewer opens the history tab.
Pre: widget holds a valid `widget_token`.
Post: paged list of the viewer's spins with spin status and prize status.

## Main
1. Viewer opens history in the widget. [prototype: last 5 spins, "queued/done/refunded"]
2. Widget requests the viewer's own spins with `widget_token`, paged. [gap: `GET /spins` needs the platform key; `next_cursor` always null; G8]
3. Each row shows the spin status (requested = waiting for payment | committed | cancelled with the platform's message | expired = payment not confirmed), the paid amount, the prize status (pending|done|deferred|rejected|expired) and any refunded amount. [gap: API exposes spin status, paid amount and cancel message, not prize status; G8]

## Exceptions
- E1 (from step 2) token expired: widget gets a new `widget_token` from the platform and retries. [spec]

## Acceptance
```gherkin
Feature: UC-03 View own spins and prizes

@UC-03 @main @gap
Scenario: Own history with prize status
  Given the viewer has three spins, one of them refunded
  When the viewer opens history
  Then three rows are shown, newest first
  And the refunded row shows "refunded" and the amount

@UC-03 @main @gap
Scenario: Main. Declined spin shows the platform's message
  Given the platform cancelled one of the viewer's spins with message "Not enough tokens"
  When the viewer opens history
  Then that row shows "Not enough tokens" and no prize

@UC-03 @main @gap
Scenario: Only own spins
  Given viewers "v-1" and "v-2" have spins on the same wheel
  When "v-1" opens history
  Then no spin of "v-2" is returned
```
