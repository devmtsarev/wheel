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
node --test calc/model.test.js experience/shared/store.test.mjs experience/embed/wheel.test.mjs experience/shared/variance.test.mjs
```

46 tests: 24 original pricing-model regressions, 15 experience/pricing/scenario tests, 3 embed tests, and 4 variance tests. They cover inverse ratios, dynamic pricing above the former caps, integer/ppm rounding, invalid settings, protected writes, wallet concurrency, old-version refunds/proofs, migrations, no-prize handling, and forged iframe-message rejection. A GitHub Actions workflow runs this command on pushes and pull requests with Node 22.

Locally the same test callbacks were executed in Node VM contexts through the available Node runtime because no standalone Node executable was installed. The original 42 passed locally and on GitHub Actions. The four additional variance tests pass locally; CI independently runs the standard Node test runner.

## Browser verification

Verified player price/balance visibility; operator automatic price updates when changing a direct price from 5 to 10 (20 → 27 token spin preview); save/version behavior; management reporting; gallery loading and switching to the premium scenario (23,111-token spin at 30% overhead). Captured screenshots are under `demos/images/`. They show illustrative local demo activity, not production results or balance validation.

The player/operator layouts were inspected at the current narrow browser width and management/gallery at desktop width. Real iPhone/Safari, touch-only operation, third-party storage restrictions and full production integration remain unverified.

## Integration boundary

This is a browser-local demo, not the server implementation of `api/openapi.yaml`. The upstream API specification is preserved. Production needs authenticated viewer/staff sessions, a server-owned ledger/randomness, wallet reserve/commit/reconciliation, signed webhooks, and server events. The new automatic inverse-price policy differs from the original `calc/model.js` model; both remain separately named and tested. Existing Pages settings are not changed, and this PR does not deploy or merge itself.

## Published demo entry point

The existing GitHub Pages `/demo/` link opens the updated `experience/` player view, with Operator and Management in its navigation. A relative redirect supports both the `/wheel/` Pages prefix and local serving. The gallery remains at `/experience/demos/`. Publication follows merging this branch into `main`.

## Variance audit against the original PDF

Run `node experience/scripts/audit-variance.mjs` (or add `--json`) to reproduce this table from the actual pricing function and scenario definitions. Zero-value no-prize outcomes are retained in both moments and exact convolution; the original calculator's `normalize()` would discard them and must not be used here.

| Distribution | Spin | Mean reward EV | Variance (tokens²) | SD (tokens) | CV | PDF CV ≤ 2 | No prize | 30-spin loss risk* |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| Original PDF example | 50 | 50.3000 | 6492.4100 | 80.5755 | 1.6019 | PASS | 0% | 0.0092% |
| Current evening room | 20 | 16.6661 | 1680.3756 | 40.9924 | 2.4596 | **FAIL** | 21.8060% | 0.1969% |
| Equal-price actions | 96 | 80.0000 | 1600.0000 | 40.0000 | 0.5000 | PASS | 20.0000% | 0% |
| Premium menu | 23111 | 17777.6400 | 483948116.0304 | 21998.8208 | 1.2374 | PASS | 20.0005% | approximately 0% |
| Simple 1:2 ratio | 128 | 106.6665 | 4622.2278 | 67.9870 | 0.6374 | PASS | 20.0001% | 0% |

* Exact convolution under the PDF's illustrative assumptions μ = 0.40 and N = 30, before refunds. The default menu passes its 5% series-loss threshold but fails its separate CV limit. Absolute variance falls from the old example, but relative variance rises because mean reward value falls more. Passing one check is not full PDF validation.

For ideal inverse-price probabilities and no-prize probability L, CV² = (sum(C_i) × sum(1/C_i)) / (n² × (1−L)) − 1. The current action-price spread gives a minimum CV of about 2.1243 even at L = 0. Changing token scale, or simply raising the spin price, cannot make this menu meet CV ≤ 2 while retaining strict inverse pricing. Meeting that rule requires changing the action-price spread/menu or probability policy. The required empty outcome has not been removed or silently altered by the audit.

This is a diagnostic, not a production publication gate: the audit prints FAIL for the default menu and exits normally. CI tests verify the arithmetic and the expected failure, rather than asserting that every demo complies with the PDF. The default remains available for reviewing the requested product behavior.

Intentional departures from the PDF: empty outcomes are now required, and positive aggregate overhead means S > EV instead of the document's S ≤ EV ceiling. The 20% no-prize target is a provisional product choice needed to determine the probability normalization/price, not a deduction from inverse pricing. Remaining PDF safeguards—complete variance/jackpot/consolation validation, queue/time admission, platform spending limits, and direct-price synchronization—are not implemented as production gates.
