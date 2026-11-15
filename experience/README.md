# Embedded wheel experience

A buildless, browser-local implementation of three distinct interfaces. The original demo and calculator remain available unchanged.

Serve the repository over localhost (Web Crypto and Web Locks require a secure context):

```sh
python3 -m http.server 8774 --bind 127.0.0.1
```

- Demo gallery and interactive pricing scenarios: http://127.0.0.1:8774/experience/demos/
- Player + example host website: http://127.0.0.1:8774/experience/
- Stream operator overlay: http://127.0.0.1:8774/experience/operator/
- Separate management dashboard: http://127.0.0.1:8774/experience/manage/

Open these in the same browser and origin to share data. Each begins with zero spins and a 400-token demo wallet. Spin in the player, complete/refund in the operator panel, and watch management metrics update. Pausing blocks new spins but preserves pending prizes. Refunding returns the original charged price, even after a price version change.

## Structure

- `embed/wheel.js`: one-script launcher, Shadow DOM wrapper and isolated player iframe; validates origin and source for iframe messages.
- `player/`: original Russian wheel UI extracted into `original-wheel.js`, with its center spin button, themes, odds, session spending, result dialog and seed verification; `player.js` adapts it to the shared ledger.
- `operator/`: separate stream workspace overlay, fulfilment queue, refunds and pause/resume.
- `manage/`: reporting periods, spending/refunds, value win rate, jackpots, prize frequencies, CSV, versioned price settings and embed instructions.
- `shared/store.js`: local adapter, serialized writes through Web Locks, persisted spin snapshots and cross-tab storage events.

Browser storage is not a backend or security boundary. There is one demo viewer and one stream; management and operator pages intentionally have no authentication. Tokens have no cash conversion. No paid/free promotional spins are implemented. The original HMAC-SHA256 commit/reveal controls now work against persisted demo epochs. Seeds live in local storage, so this demonstrates verification mechanics rather than an independent fairness guarantee. Previous spins without proof data are retained in reports but excluded from epoch verification. Player spins have no session spending cap. Only an insufficient token balance or an operator pause blocks a spin. Insufficient balance exposes a Get tokens action that adds 200 demo tokens; production must connect that action to the company wallet flow.

Operators supply direct-purchase action prices and aggregate overhead; spin price and all probabilities are automatic. With n actions, direct prices C_i, overhead multiplier M = 1 + markup/100, and inverse-price sum H = sum(1/C_i), the feasible price ceiling is M*n/H. We target 20% no prize by calculating S = max(1, floor(0.8*M*n/H)) whole tokens. Then p_i = S/(M*n*C_i), with the remaining probability assigned to no prize. The 20% target is an explicit product default, not a consequence of inverse pricing. Whole-token rounding can move the actual no-prize rate. Each action contributes equally to expected reward value; doubling its direct price halves its chance before rounding.

All action chances are floored to integer ppm, with rounding remainder assigned to no prize. Thus aggregate reward EV is at or just below S/M and effective overhead is at least requested. The store ignores supplied manual spin prices and weights. Editing an action price, adding/removing actions or editing overhead recalculates the preview; saving publishes price and chances together as a new version. Existing balances and spin snapshots are preserved, including original refund amounts. Legacy menus are automatically repriced on migration. The current example menu at +20% produces a 20-token spin and approximately 21.81% no prize.

There are no arbitrary token-price or overhead caps. Positive whole-token prices must be exactly representable as JavaScript safe integers; the current draw protocol has one-in-a-million resolution. Unrepresentable probabilities are rejected explicitly instead of silently changing the inverse-price rule. The original calculator remains unchanged and describes a different model.

No-prize outcomes are charged spins with `no-prize` status. They count in spending and rate denominators, never enter the pending fulfilment queue, and have no payout. All awarded prizes are fixed experiences: there are no cash, token-reward, transfer or cash-out operations. Operator rejection refunds the original charge; it is not a prize.

The default player surface is transparent, with a wheel, priced spin action and Details button. Odds, session spending, proof controls, themes and history require opening Details. Sector percentages are omitted; exact odds remain accessible in Details. Equal-size sectors are decorative and this is disclosed there.

## Production integration boundary

Replace the store adapter with an authenticated API, not a client-side secret:

1. Company backend exchanges an authenticated viewer session for a short-lived, company/stream-scoped wheel session. Never put credentials in the embed script or URL.
2. Server owns immutable wheel versions, randomness, nonce/commit records, balance checks, session limits and idempotent spin creation. Atomically reserve/charge funds through the company wallet adapter and record the outcome; reconcile failures.
3. Stream-scoped staff sessions authorize pause and fulfilment. Management sessions authorize tenant-wide reporting and configuration. Enforce permissions server-side on every operation.
4. Stream events reach the appropriate player/operator through a server event channel. Signed, retried webhooks notify the company of outcomes, fulfilment and refunds. Browser `wheel:spin` events are presentation hints only.
5. Host an HTTPS widget origin with an explicit company allowlist for framing, CORS and postMessage. Third-party storage must not be required for identity or payment. Configure content security policy and iframe policies for the actual host.
6. Persist money in integer minor units with an explicit currency, separately from tokens. Track refunds and promotions as ledger entries. Report gross/net separately; neither is profit.

Management can be hosted separately once API authentication replaces shared local storage. In this prototype its separate route uses the same origin to demonstrate synchronization. Operator overlay must be placed in a private streaming workspace and excluded from broadcast capture.

## Verification

`shared/store.test.mjs` exercises transaction serialization, duplicate requests, balance checks, pause, refund idempotency, immutable price versions and reporting definitions using Node's built-in test runner:

```sh
node --test experience/shared/store.test.mjs
```

## Operator editing

Open **Edit wheel options** in the operator panel. Operators set aggregate markup and each action’s direct-purchase price, name, short label and colour. They can add/remove actions (1–11 plus no prize). Chances are read-only, automatically calculated and enforced by the store on save; caller-supplied weights are ignored. The preview shows the automatically calculated spin price, average reward value and effective markup. No-prize labels and colour can be customized, but its price is always zero. Cash/token payouts are not supported. These inputs describe direct-purchase prices; this demo does not implement a direct-purchase checkout.

Saving creates a new version and fairness epoch. Old spin records include immutable menu snapshots. A pending animation keeps its original options; the next spin uses the saved menu. A stale editor must reload before saving if another view changed the wheel. Management reflects the active menu and retains removed outcomes in historical distributions. The player balance is visible beside the controls and updates after spins, top-ups and refunds.


## Existing API specification

The upstream [`api/README.md`](../api/README.md) and OpenAPI document describe a server reserve/commit flow, signed webhooks, widget tokens and WebSocket updates. This prototype does not call those endpoints or claim to implement their guarantees. Its single local atomic spin transaction stands in for that flow. Production integration must reconcile the new automatic inverse-price inputs (direct prices + overhead, derived price/ppm) with API wheel versions; preserve server-issued price validity, idempotency and payment reservation semantics; and replace local seed storage with server ownership. No secrets belong in the embed.
