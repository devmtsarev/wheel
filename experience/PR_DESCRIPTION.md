The repository previously demonstrated a standalone player wheel plus a pricing document/calculator. This PR adds a browser-local integration prototype: an embedded player overlay, an operator workspace, a management dashboard and a static demo gallery. It also implements the revised pricing requirements and makes their differences from the original PDF explicit.

## What changed

| Area | Before | This PR |
|---|---|---|
| Experience | Standalone wheel demo | Transparent wheel over a sample host website, with a one-script iframe embed |
| Player controls | Original demo controls | Visible token balance, centered spin control, details/history/proof on demand, demo top-up for insufficient balance |
| Outcomes | Every spin awards an action | Required no-prize outcome; no cash or token prizes |
| Operator | No integrated operator workflow | Separate overlay: fulfil/refund queue, pause/resume, edit actions and direct-purchase prices |
| Pricing inputs | Menu and independently supplied chance weights; PDF calculates price within a risk/EV corridor | Direct-purchase prices and aggregate overhead; chances and spin price are derived together |
| Reporting | Pricing analysis | Separate dashboard: gross spend, refunds/net retained, prize and value-win rates, history, CSV |
| Demonstration | Original wheel and calculator | Additional gallery, screenshots, four pricing scenarios and an end-to-end walkthrough |

The existing `/demo/` Pages URL now redirects to the updated player experience, with navigation to Operator and Management. The original `calc/`, PDF and API specification remain unchanged. This is an alternative product/pricing policy, not a replacement claiming compatibility with every PDF rule.

## Why spin price is calculated rather than fixed

Action prices can differ by orders of magnitude. A fixed 40-token spin combined with inverse-price chances and +20% overhead makes the default menu's action probabilities total 156.39%, which is impossible. Renormalizing those probabilities alone would change the promised overhead.

Let `C_i` be direct prices, `n` the number of actions (excluding no prize), `M = 1 + overhead/100`, and `H = sum(1/C_i)`. We target a 20% no-prize probability and calculate:

```text
spin price S = max(1, floor(0.8 × M × n / H))
action probability q_i = S / (M × n × C_i)
no-prize probability = 1 − sum(q_i)
```

The 20% no-prize target is an explicit provisional product choice, not mathematically implied by inverse pricing. Whole-token/ppm rounding changes its actual value. Chances are rounded down to ppm and the remainder goes to no prize, preserving at least the requested aggregate overhead. Doubling a direct price halves its chance before rounding. No arbitrary token-price cap remains; safe-integer and draw precision constraints still apply.

For the default menu, +20% overhead yields **20 tokens per spin**, **16.6661 tokens mean reward value**, and **21.8060% no prize**. Changing the cheapest action from 5 to 10 tokens changes the calculated spin price to **27 tokens**. Changes preview live and take effect together only when saved as a new wheel version. This is configuration-driven pricing, not adjustment to a player's losses/history or automatic queue-based repricing.

Existing spins keep their original price, outcome, menu snapshot and proof data. Stale displayed versions are rejected before charging; refunds use the original charge.

## Variance check against the PDF

`node experience/scripts/audit-variance.mjs` reproduces the audit, including the zero-value outcome. It calculates `variance = Σ q_i(C_i − EV)²`, `SD = √variance`, and `CV = SD / EV`.

| Distribution | Spin | EV | Variance (tokens²) | SD | CV | PDF CV ≤ 2 |
|---|---:|---:|---:|---:|---:|---|
| Original PDF example | 50 | 50.3000 | 6492.4100 | 80.5755 | 1.6019 | PASS |
| Current evening room | 20 | 16.6661 | 1680.3756 | 40.9924 | **2.4596** | **FAIL** |
| Equal-price actions | 96 | 80.0000 | 1600.0000 | 40.0000 | 0.5000 | PASS |
| Premium menu | 23111 | 17777.6400 | 483948116.0304 | 21998.8208 | 1.2374 | PASS |
| Simple 1:2 ratio | 128 | 106.6665 | 4622.2278 | 67.9870 | 0.6374 | PASS |

The current menu's absolute variance is lower, but its relative variance is higher. Its exact 30-spin loss probability is **0.1969%** under the PDF's illustrative `μ = 0.40`, below the separate 5% risk threshold. This does not cancel the CV failure or establish full compliance.

With strict inverse-price chances, even eliminating empty outcomes would leave this menu at CV ≈ **2.1243**. Repricing alone cannot bring it below 2: satisfying the PDF's CV limit requires changing the menu/price spread or probability policy. Empty outcomes remain required and have not been removed. The audit is diagnostic, not an enforced publication gate.

Other intentional PDF departures: positive aggregate overhead requires `S > EV`, whereas the PDF caps `S ≤ EV`; the PDF assumes every spin awards an action. The requested model cannot satisfy both those old assumptions unchanged. Full validator rules, queue/time admission and platform spending limits remain outstanding.

## Demo and tests

```sh
python3 -m http.server 8774 --bind 127.0.0.1
# Open http://127.0.0.1:8774/experience/demos/

node --test calc/model.test.js experience/shared/store.test.mjs experience/embed/wheel.test.mjs experience/shared/variance.test.mjs
node experience/scripts/audit-variance.mjs
```

46 tests cover the original model, automatic pricing, rounding, high prices, invalid/stale edits, concurrent wallet operations, idempotency, original-price refunds, migrations/proofs, no-prize behavior, embed message validation, and variance arithmetic including the zero outcome. The prior 42-test commit passed GitHub Actions; four variance tests were added and pass locally. Local execution uses Node VM contexts; CI uses the standard Node 22 test runner.

Browser checks covered the player price/balance, operator price-change preview and saving, management reports, and demo-gallery scenario switching. Screenshots and walkthrough: `experience/demos/`. After merge and existing Pages publication, the additional gallery will be at https://devmtsarev.github.io/wheel/experience/demos/; that is not claimed to be deployed before merge.

## Integration boundary

This is a local prototype with one demo viewer/stream and no production authentication or payment integration. Local seed storage demonstrates proof mechanics, not independent fairness. It does not implement the upstream API's wallet reserve/commit, webhooks or WebSocket contract. Real iPhone/Safari/touch behavior and production integration remain unverified. See `experience/README.md` and `experience/CHANGES.md` for the implementation boundary and full audit.
