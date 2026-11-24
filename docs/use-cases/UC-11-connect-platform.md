---
id: UC-11
title: Connect a platform
actor: platform
supporting: [vendor]
status: tested+spec
gaps: [G5]
depends: []
---
Goal: integrate wallet, webhooks and widget so spins can be sold securely; the widget stays a drop-in script.
Trigger: signed contract.
Pre: none.
Post: signed API calls work; webhooks received; widget runs on stream pages; operators can sign in to the Control Panel.

## Main
1. Vendor issues licence key `wl_…`, request-signing secret, webhook secret. [spec: api/README "Доступ и подпись"; teaching secrets in server/config.json, TODO 8]
2. Platform signs every request: `X-Wheel-Signature = hex(HMAC-SHA256(secret, "{ts}.{METHOD}.{path}.{sha256(body)}"))`, window ±300 s. [tested: T:42]
3. Platform runs a webhook receiver for `spin.requested`, `spin.result`, `spin.expired`; retried 1 s, 10 s, 60 s, 5 min, 30 min, hourly to 24 h; dedup by `event_id`. No answer carries money. [server: webhooks.js; retries in memory]
4. Platform wires its payment rules to `spin.requested`: charge, then `POST /spins/{id}/commit` {paid_amount} before `expires_at`, or `POST /spins/{id}/cancel` {message}. [tested: T:48, T:103, T:114; reference: server/mock-platform.js]
5. Platform embeds the widget script and issues `widget_token` per viewer. [spec+prototype: experience/embed/wheel.js]
6. Vendor creates Control Panel accounts for the platform's operators. [gap: G5]
7. Operator configures the first wheel (UC-04).

## Alternatives
- A1 (from step 5) strict CSP: widget uses `postMessage`; the page relays the same events from its own connection. [spec: api/README "Fallback postMessage"]

## Exceptions
- E1 (from step 2) bad signature or stale timestamp: 401 `invalid_signature` | `stale_timestamp`. [tested: T:42 (signature)]
- E2 any: over 20 rps read / 5 rps write → 429 with `Retry-After`. [spec: not implemented, TODO 4]

## Acceptance
```gherkin
Feature: UC-11 Connect a platform

@UC-11 @E1 @tested
Scenario: Unsigned request rejected
  Given a request without X-Wheel-Signature
  When it reaches the API
  Then it is rejected and nothing is executed

@UC-11 @E2 @gap
Scenario: Rate limit
  Given the platform sends 12 write requests within one second
  Then the requests above the limit get 429 with Retry-After
```
