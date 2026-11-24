---
id: UC-04
title: Configure a model's wheel
actor: operator
supporting: [vendor]
status: tested+gap
gaps: [G5, G12]
questions: [Q2]
depends: [UC-11]
---
Goal: publish a valid, priced wheel for one `model_id`.
Trigger: a new model joins, or the model's menu changes.
Pre: platform connected (UC-11); operator has a Control Panel account.
Post: new active version with its own `content_hash`; previous version `retired`.

## Main
1. Operator opens the Control Panel and selects the model by `model_id`. [gap: G5]
2. Operator enters menu items: name, menu price (tokens), `duration_s` (default 60), optional role (consolation|regular|jackpot). [spec: schema MenuItem]
3. Operator sets markup k; chances are derived from prices automatically. [gap: API needs manual `weight`, `price_k` ≤ 1 while product decision is k > 1, no empty sector z; G12]
4. Panel previews spin price, chances, win chance and validator result before saving. [server: POST /pricing/quote]
5. Operator saves; panel calls `POST /wheels` {compliance_ack}; server validates, sets `content_hash`, activates, retires previous. [tested: T:25, T:35]
6. Next spin uses the new version; drawn spins keep theirs. [server: Spin.content_hash]

## Alternatives
- A1 (from steps 1-4) Config file: platform backend calls `POST /wheels` with the same data from its own config file; panel not used. [tested: T:25]
- A2 (from step 5) Change during a live stream: new version active at once; drawn prizes stay queued. Spin still `requested` on the old version: untested. [server]

## Exceptions
- E1 (from step 5) Validator rejects: 422 with `violations[].rule` (ppm_sum|consolation|jackpot|cv|price|menu_mismatch); nothing created; operator corrects. [tested: T:35]

## Acceptance
```gherkin
Feature: UC-04 Configure a model's wheel

@UC-04 @main @gap
Scenario: Main. Configure in the Control Panel
  Given the operator has selected model "model-1"
  When the operator enters eight menu items without weights and markup k = 1.2
  Then the panel shows the spin price and the chance of every item, chances summing to 1000000 ppm
  When the operator saves
  Then an active version with a new content_hash is created
  And the previous version becomes retired

@UC-04 @A1 @tested
Scenario: A1. Configuration file
  Given the platform keeps the wheel configuration in its own file
  When its backend sends the menu to POST /wheels
  Then an active version with a content_hash is created

@UC-04 @A2 @server
Scenario: A2. Change during a live stream
  Given a prize from version A is queued
  When version B is saved
  Then the queued prize stays in the queue
  And the next spin uses version B

@UC-04 @E1 @tested
Scenario: E1. Validator rejects a wheel
  Given a menu whose jackpot chance is 6%
  When the wheel is saved
  Then the server answers 422 with "jackpot" among the violated rules
  And no version is created
```
