---
id: UC-12
title: Run a live stream
actor: platform
supporting: [vendor, model]
status: tested
gaps: [G3, G16]
depends: [UC-04]
---
Goal: sell spins only while the model can still fulfil them.
Trigger: model goes live.
Pre: the model's wheel is active.
Post: every prize sold fits into the stream's remaining time.

## Main
1. Platform sends `PUT /models/{id}/stream` {live, ends_at, queue_limit=5, buffer_s=60}. [tested: T:159]
2. Spin admitted only if queue < queue_limit and time left ≥ queued durations + longest prize + buffer_s. [tested: T:136, T:159]
3. Near the planned end sales stop with `stream_ending`. [tested: T:159]
4. At the end the platform sends live=false. [spec]

## Alternatives
- A1 (from step 3) Stream extended: platform sends a later `ends_at`; admission opens again. [server: PUT /models/{id}/stream]
- A2 (from step 2) Dynamic pricing on: price steps up at queue fill ≥ 0.6, down at ≤ 0.2, at most every 300 s; chances never change. [server: admission.js dynamicPrice; off by default]

## Exceptions
- E1 (any step) Stream ends early: sales stop; pending prizes → UC-10 E2. [gap: G3]
- E2 (from step 2) Several spins await payment at once: admission counts only prizes already in the queue, not spins still `requested`, and confirmation does not re-check capacity. All of them can be confirmed and overfill the queue or the remaining time. [gap: G16]

## Acceptance
```gherkin
Feature: UC-12 Run a live stream

@UC-12 @main @tested
Scenario: Main. Sales stop before the planned end
  Given the stream ends in 5 minutes
  And the queue holds 3 minutes of prizes, the longest prize takes 2 minutes and the buffer is 1 minute
  When a viewer presses "Spin"
  Then the spin is refused with stream_ending

@UC-12 @A1 @server
Scenario: A1. Stream extended
  Given sales stopped with stream_ending
  When the platform sends a planned end one hour later
  Then spins are accepted again

@UC-12 @A2 @server
Scenario: A2. Dynamic price steps up on a busy queue
  Given dynamic pricing is on with steps 40, 50, 60 and the price is 50
  And the queue is 60% full and the last step was more than 300 seconds ago
  When the queue changes
  Then the price becomes 60
  And item chances are unchanged

@UC-12 @E1 @gap
Scenario: E1. Stream ends early
  Given two prizes are pending
  When the platform reports the stream as ended before the planned end
  Then new spins are refused
  And the pending prizes follow UC-10 E2

@UC-12 @E2 @gap
Scenario: E2. Spins awaiting payment count towards capacity
  Given the queue limit is 5, 4 prizes are queued and 1 spin is requested
  When another viewer presses "Spin"
  Then the spin is refused with queue_full
```
