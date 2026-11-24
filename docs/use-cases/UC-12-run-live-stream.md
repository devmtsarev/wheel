---
id: UC-12
title: Run a live stream
actor: platform
supporting: [vendor, model]
status: tested
gaps: [G3]
depends: [UC-04]
---
Goal: sell spins only while the model can still fulfil them.
Trigger: model goes live.
Pre: the model's wheel is active.
Post: every prize sold fits into the stream's remaining time.

## Main
1. Platform sends `PUT /models/{id}/stream` {live, ends_at, queue_limit=5, buffer_s=60}. [tested: T:130]
2. Spin admitted only if queue < queue_limit and time left ≥ queued durations + longest prize + buffer_s. [tested: T:107, T:130]
3. If dynamic pricing is on: price steps up at queue fill ≥ 0.6, down at ≤ 0.2, at most every 300 s; chances never change. [server: admission.js dynamicPrice; off by default]
4. Near the planned end sales stop with `stream_ending`. [tested: T:130]
5. At the end the platform sends live=false. [spec]

## Alternatives
- A1 @4 stream extended: platform sends a later `ends_at`; admission opens again. [spec]

## Exceptions
- E1 any stream ends early: sales stop; pending prizes → UC-10 E2. [gap: G3]

## Acceptance
```gherkin
Feature: UC-12 Run a live stream

@UC-12 @main @tested
Scenario: Sales stop before the planned end
  Given the stream ends in 5 minutes
  And the queue holds 3 minutes of prizes, the longest prize takes 2 minutes and the buffer is 1 minute
  When a viewer presses "Spin"
  Then the spin is refused with stream_ending

@UC-12 @main @server
Scenario: Dynamic price steps up on a busy queue
  Given dynamic pricing is on with steps 40, 50, 60 and the price is 50
  And the queue is 60% full and the last step was more than 300 seconds ago
  When the queue changes
  Then the price becomes 60
  And item chances are unchanged
```
