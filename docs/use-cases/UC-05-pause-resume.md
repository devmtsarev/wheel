---
id: UC-05
title: Pause and resume the wheel
actor: operator
supporting: [vendor]
status: gap
gaps: [G5, G7]
depends: [UC-12]
---
Goal: stop selling spins for a while without losing prizes already won.
Trigger: model steps away, technical problem, moderation decision.
Pre: model is live.
Post: new spins refused with reason `paused`; queue kept; resume restores sales.

## Main
1. Operator presses "Pause" for the model in the panel. [gap: G5, G7; prototype has the button]
2. Admission refuses new spins: 409 {reason: paused}; widgets get WS `wheel.paused`. [gap: `paused` exists in AdmissionError.reason, no method or logic]
3. Queued prizes stay and can still be fulfilled. [prototype]
4. Operator presses "Resume"; widgets get WS `wheel.resumed`. [gap]

## Alternatives
- A1 @1 workaround today: `PATCH /wheels/{id}` status retired, then active; viewers see `wheel_inactive`. [server]

## Acceptance
```gherkin
Feature: UC-05 Pause and resume the wheel

@UC-05 @main @gap
Scenario: Pause keeps the queue
  Given two prizes are pending in the model's queue
  When the operator pauses the wheel
  Then a new spin is refused with reason "paused"
  And both prizes remain pending
  When the operator resumes the wheel
  Then spins are sold again
```
