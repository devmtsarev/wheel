# Integrated wheel demo — changes and verification

The original repository provides a standalone wheel and a pricing-model document/calculator. This change adds an embeddable player experience, a separate operator overlay, management reporting, and a static demo gallery.

## Try it

```sh
python3 -m http.server 8774 --bind 127.0.0.1
```

Open http://127.0.0.1:8774/experience/demos/ and follow the six-step walkthrough. The gallery includes the evening-room menu, equal-price actions, prices above 5,000 tokens, and a simple 1:2 inverse-price example. All pages work as static GitHub Pages content after merge/publication; no bundler is needed. The gallery calculator does not alter the active demo ledger.

## Behavior

- Player: transparent wheel, always-visible balance, a solid centered spin control, optional details/proof/history, no probability labels on sectors, and a demo token top-up when balance is insufficient. Closing Details returns to the wheel. No session spending cap.
- Operator: pause/resume, prize fulfilment/refund queue, action editing and live automatic pricing. Operators set direct-purchase prices and aggregate overhead, not spin price or individual chances.
- Pricing: inverse-price probabilities; a 20% no-prize target determines the whole-token spin price. The target is an explicit product default. Whole-token and ppm rounding affect the actual no-prize rate. The default menu yields 20 tokens per spin, about 21.806% no prize and 20% aggregate overhead.
- Ledger: serialized local transactions, duplicate-request protection, stale-version rejection before charging, immutable per-spin menus, proof epochs and refunds at the original charged price.
- Management: spending, refunds/net retained, actual prize frequency, prize/value win rates, dates, CSV export and embed snippet.
- Demo gallery: screenshots, editable pricing scenarios and a full walkthrough, using the same calculation function as the operator.

No arbitrary price caps are imposed. JavaScript safe-integer and one-in-a-million draw precision remain implementation constraints. No cash/token prizes or direct-purchase checkout are implemented.

## Automated validation

```sh
node --test calc/model.test.js experience/shared/store.test.mjs experience/embed/wheel.test.mjs
```

42 tests: 24 original pricing-model regressions, 15 experience/pricing/scenario tests, and 3 embed tests. They cover inverse ratios, dynamic pricing above the former caps, integer/ppm rounding, invalid settings, protected writes, wallet concurrency, old-version refunds/proofs, migrations, no-prize handling, and forged iframe-message rejection. A GitHub Actions workflow runs this command on pushes and pull requests with Node 22.

Locally the same test callbacks were executed in Node VM contexts through the available Node runtime because no standalone Node executable was installed. All 42 passed. CI independently runs the standard Node test runner.

## Browser verification

Verified player price/balance visibility; operator automatic price updates when changing a direct price from 5 to 10 (20 → 27 token spin preview); save/version behavior; management reporting; gallery loading and switching to the premium scenario (23,111-token spin at 30% overhead). Captured screenshots are under `demos/images/`. They show illustrative local demo activity, not production results or balance validation.

The player/operator layouts were inspected at the current narrow browser width and management/gallery at desktop width. Real iPhone/Safari, touch-only operation, third-party storage restrictions and full production integration remain unverified.

## Integration boundary

This is a browser-local demo, not the server implementation of `api/openapi.yaml`. The upstream API specification is preserved. Production needs authenticated viewer/staff sessions, a server-owned ledger/randomness, wallet reserve/commit/reconciliation, signed webhooks, and server events. The new automatic inverse-price policy differs from the original `calc/model.js` model; both remain separately named and tested. Existing Pages settings are not changed, and this PR does not deploy or merge itself.
