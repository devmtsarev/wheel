---
id: UC-11
title: Connect a platform
actor: platform
supporting: [vendor]
status: tested+spec
gaps: [G5]
depends: []
---
Goal: integrate wallet, webhooks and widget so spins can be sold securely.
Trigger: signed contract.
Pre: none.
Post: signed API calls work; webhooks received; widget runs on stream pages; operators can sign in to the Control Panel.

## Main
1. Vendor issues licence key `wl_…`, request-signing secret, webhook secret. [spec: api/README "Доступ и подпись"; teaching secrets in server/config.json, TODO 8]
2. Platform signs every request: `X-Wheel-Signature = hex(HMAC-SHA256(secret, "{ts}.{METHOD}.{path}.{sha256(body)}"))`, window ±300 s. [tested: T:42]
3. Platform runs a webhook receiver: `charge.reserve` sync ≤5 s; others retried 1s,10s,60s,5m,30m, hourly to 24 h; dedup by `event_id`. [server: webhooks.js; retries in memory]
4. Platform embeds the widget script and issues `widget_token` per viewer. [spec+prototype: experience/embed/wheel.js]
5. Vendor creates Control Panel accounts for the platform's operators. [gap: G5]
6. Operator configures the first wheel (UC-04).

## Alternatives
- A1 @4 strict CSP: widget uses `postMessage`; the page relays the same events from its own connection. [spec: api/README "Fallback postMessage"]

## Exceptions
- E1 @2 bad signature or stale timestamp: 401 `invalid_signature` | `stale_timestamp`. [tested: T:42 (signature)]
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
