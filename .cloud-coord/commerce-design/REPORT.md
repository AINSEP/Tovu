# Commerce debate — consensus report (2026-10-21)
Coordinator: tovu-53 (Opus 5.5, coordinator only — did not vote). 3 rounds (R1 blind, R2 informed rebuttal, R3 owner-requested design + sample code).

| Voice | Model | Repo access |
|---|---|---|
| Opus (Primary) | Opus 5.5 subagent, high | jini-int read-only |
| Sonnet (added) | Sonnet 5.5 subagent, high | jini-int read-only |
| Codex | gpt-6.1-sol (verified in session log) | jini-int read-only |
| Gemini | gemini-4-argon-high | staged copy of packages/commerce only (no agent-plugins/core) |

Raw answers: `r{1,2,3}-{opus,sonnet,codex}.md`, `r{1,2,3}-gemini.txt` in this folder. Sample code to start from: **r3-opus.md** (most complete), with r3-codex.md / r3-sonnet.md / r3-gemini.txt for alternatives.

## Verdict
**Rewrite the payments part of `packages/commerce` as a generic payments kernel; keep the package.** All four agree. Today's code has real money bugs, all caused by two code paths each updating the refunded total.

## Bugs in today's code
Coordinator-verified in code:
- **B1 partial refund recorded as full** — refund webhooks take the *charge's* amount (`lipay-gateway.ts:282-287` → `lipay-plugin.ts:456-459`). Caveat: LiPay isn't live; its real payload is unknown.
- **B2 double count** — direct `refund()` adds (`lipay-plugin.ts:825`), the webhook echo adds again (`:456-459`).
- **B4 charged but "failed"** — any provider error incl. timeout → terminal `failed` (`:654-658`); a later success webhook is ignored.
- **Currency case** — catalog stores `"usd"` (`catalog/types.ts:74`); payments only accepts `/^[A-Z]{3}$/` (`lipay-plugin.ts:266`).

Reported by voices, cross-confirmed by Opus from code, not re-verified by the coordinator:
- 0 / negative refund amounts accepted (`lipay-gateway.ts:266`).
- Early events lost forever: an event recorded unapplied is never retried; the provider retry is deduped (`:930`, `:908`).
- Retried refund fails: balance checks run before the replay lookup (`:856-863`).
- Webhook workspace ≠ charge workspace (`:553`, `:898`, `:980`).
- Refund stuck `pending` holds its reservation forever (`:741-767`, `:821`).

## Converged design (4 of 4 by R3)
1. **Shape** — `@jini-ai/commerce` owns Money, the provider contract + registry, the ledger (payments, attempts, refunds, disputes), one webhook inbox, an outbox, state machines, reconciler and money-moving services. **Provider plugins** (Stripe, PayPal, LiPay) are stateless translators: no DB writes. **Consumer plugins** (donations, Shopify importer, bookings) get an injected `PaymentsPort` + outbox events (`payment.succeeded`, `refund.succeeded`, `dispute.opened`). No plugin imports another; commerce imports no plugin.
2. **One writer** — sync responses, webhooks and `retrieve` snapshots all become *evidence* and go through one function (`applyRefundEvidence` / `applyPaymentEvidence`). Refunds are rows unique on (provider, provider refund id) and matched by our refund id sent as correlation id. **Refunded total = sum of succeeded refund rows, never an increment.** Statuses only move forward. Over-refund evidence is quarantined, never silently capped.
3. **Unknown outcome** — timeouts/retryable errors → `unknown`, money stays reserved, a reconciler settles it. Never `failed`.
4. **Inbox + outbox** — verify → store → ack fast; a worker applies, parks (retry with backoff) or dead-letters. Delete the duplicate `catalog/webhook-inbox.ts` and the timestamp watermark.
5. **`retrieve` is optional** (Opus dropped "fetch on every webhook" in R3) — used for unknown outcomes, webhooks without ids, and scheduled reconcile.
6. **Money** — integer minor units + UPPERCASE ISO-4217 + exponent table everywhere (catalog too; drop `*Cents` names). Disputes are their own dimension, not a payment status.
7. **PCI** — hosted checkout / client tokenization only; servers never see card numbers. 3-D Secure = resumable `requires_action` with `next_action_json` stored. Saved cards + subscriptions = later.
8. **Agent tools** — read tools auto-run; money-moving tools (refund, capture, void) need human approval bound to the exact payment, amount, currency and idempotency key, single use, re-checked in the service (not only the tool). Built on existing `createApprovalHandler` (`core/src/approval.ts:55`).
9. **Delete** `store/store-plugin.ts` (spike, `Math.random()` ids); split `lipay-plugin.ts` into kernel modules then delete it; move `providers/lipay-gateway.ts` to a LiPay plugin.
10. **Prove plugin registration first** — a plugin manifest grants no trust (`agent-plugins/src/lifecycle/manifest.ts:10`); provider plugins must register through `defineExecutablePluginContribution` (`contribution-loader.ts:108`) with host-controlled trust + revocation. Unproven today.

## Still open (with the cheapest test to settle each)
| Question | Positions | Cheapest test |
|---|---|---|
| Must providers echo our correlation id? | Opus: yes, else park until the attempt settles. Others: match by refund id + reservation | PayPal sandbox refund with `custom_id` — does the webhook echo it? |
| How big is the v1 provider contract? | Opus: minimal (capture/void optional, no versioning). Codex: more ops + recover-by-key | Build Stripe + PayPal authorize→capture sandbox adapters against the minimal one; grow only on failure |
| Missing tax/shipping port | Codex/Opus: blocks checkout. Gemini: allowed for explicit non-physical kinds | Mostly agreed: explicit exemption per product kind; test membership passes, physical fails |
| Money as `number` or `bigint` | Codex: bigint. Others: safe integer | Decide in L1; property test at max amounts |
| Existing `@jini-ai/capability-providers` payments port (found mid-R3) | **Opus + Sonnet agree: deprecate it, keep the package for auth/storage/db/realtime.** It is full-refund-only, no idempotency (retry can double-charge), legacy Stripe Charges API, reports pending refunds as refunded, single-provider token. Absorb its verified Stripe wire details into the Stripe plugin; adopt core `token`/`manyToken` DI for commerce. Sonnet adds a compat bridge. Codex/Gemini: not asked in time | Owner OK to deprecate |

**Also found (Opus, coordinator-verified):** Jini daemon has ungated payment routes `POST /api/connectors/payments/charge` and `.../:id/refund` (`daemon/src/http/connectors.ts:396`, `:415`) — no approval, no idempotency. Inert today because the server wires `deps: {}` (`server/src/builtin-features.ts:518`). Must be deleted or rebuilt over `PaymentsPort` with a grant before any real provider is wired — a second, ungated way to move money.

## Build lots (for Opus cloud builders)
Order matters until L5; then lanes run in parallel. Every lot: 100% per-file coverage with fakes, complexity ≤10, ADR-066 TS migrations.

| Lot | What | Depends on | Parallel? |
|---|---|---|---|
| L0 | Prove provider-plugin registration via the contribution loader (fake provider plugin) + provider conformance test-kit skeleton | — | — |
| L1 | Money (+ exponents) and contracts: `provider.ts`, `payments-port.ts`, refund/payment state | L0 | — |
| L2 | Ledger rows + migration + repo (SQL + in-memory) | L1 | — |
| L3 | Accounting: single writer + derived totals + race/crash property tests (webhook-before-response, duplicate, reversed order, timeout→late success) | L2 | — |
| L4 | Operations: create intent, refund (replay check first, approval redeem, reserve, dispatch, settle), unknown + reconciler | L3 | — |
| L5 | Ingest: webhook route (fix workspace) → inbox → worker; outbox | L3 | with L4 |
| L6a/b/c | Provider plugins: LiPay (move + fix mapping), Stripe (PaymentIntents), PayPal | L4+L5 | yes, 3 lanes |
| L7 | Agent tools + approval binding; admin read models (props-only React) | L4 | with L6 |
| L8 | Catalog/checkout onto Money; delete spikes; capability-providers decision | L1 | with L6 |
| L9 | Example consumer: donations plugin | L6a + L7 | — |

**Needs the owner / not cloud-only:** recording real Stripe test-mode and PayPal sandbox webhook fixtures needs sandbox accounts + keys; LiPay's real payload doesn't exist yet. Admin screens need a local Chrome look.

## Owner additions after the debate (2026-10-21 ~15:30Z) — not yet designed
1. **Multiple databases with DB-specific adapters.** The ledger already goes through `@jini-ai/db` StorageKernel, which has SQLite, Postgres and PGlite kernels (drivers injected) — Supabase = Postgres, so it works through the Postgres kernel. Owner wants per-database adapters that use each DB's strengths: Postgres/Supabase JSONB + GIN indexes, PostGIS geospatial; SQLite equivalents where they exist.
2. **Geospatial:** where the purchase happened vs. where the buyer is (IP, billing/shipping, card country).
3. **Graph analysis for fraud** (shared cards/emails/devices/IPs/addresses across accounts) — "PayPal found fake purchases with graph analysis".
4. **Provider-specific adapters** for how Stripe vs PayPal vs LiPay do things (already in the design as provider plugins; extend to risk signals).

Coordinator recommendation:
- Keep the **money ledger portable and boring** (same tables on every DB) — correctness must not depend on PostGIS or a graph engine.
- Put geo + graph + analytics in a separate **commerce risk/analytics layer** fed by outbox events, behind its own ports (`RiskSignalStore`, `GeoPort`, `FraudGraphPort`), with per-DB adapters: Postgres/Supabase (JSONB+GIN, PostGIS, recursive CTEs or a graph extension), SQLite (JSON + R*Tree / bounding boxes, recursive CTEs), and an optional external graph-DB adapter.
- **Ingest providers' own fraud signals** (Stripe Radar score, PayPal risk/seller protection, card country) as evidence first; our graph adds cross-provider patterns on top.
- **Privacy:** buyer location is personal data — consent, coarse location by default, retention limits.
- Needs a short design pass before lots (adds L10+ after L5).

## Gap check (one round, 2026-10-21 ~15:40Z) — all 4 agree (Gemini in at ~15:45Z); raw: ../commerce-gaps-2026-10-21/
**Add to v1 (all three):**
1. **Site + provider account + live/test mode on every money row**, credential slot, webhook URL (site in the path; today's inbox key `(provider_id, provider_event_id)` `lipay-plugin.ts:908` has no workspace) and agent approval. Can't be added cheaply later. (L1/L2)
2. **Synchronous pre-charge risk gate port** in the L1 contracts (allow/review/deny, deadline, fail-open/closed policy, no-op default). v1 blocking = the provider's own fraud tools (Stripe Radar etc.); our graph feeds review, never auto-bans.
3. **"Statuses only move forward" is wrong for payments:** a Stripe refund can go succeeded→failed, a won dispute returns money. Only *evidence* is append-only; payment status is derived from attempts/refunds/disputes. Add `authorized`, `requires_action`, `unknown` states. (L1/L3)
4. **No personal data in money rows** — opaque party id; names/emails/IPs in an erasable table; raw webhook bodies purged after apply (keep a hash). Financial records kept for legal retention. (L2)
5. **Fee / net / settlement-currency columns now** (nullable); payout + balance-report reconciliation later. (L2; reconciliation after L6)
6. **Stuck-money alerts** (unknown age, dead letters, inbox/outbox lag, quarantine) + **webhook secret rotation** (several active secrets). (L4/L5)
7. **Refunds go to the original payment method only in v1**; store credit = later, a separate liability ledger.
**Changes to the plan:**
- **Risk layer storage: ONE portable implementation + an optional Postgres/Supabase accelerator (GIN, PostGIS) behind the same port — not a full adapter per database.** PostGIS exists on Supabase but not on every Postgres or PGlite; three adapters = three test matrices for an unproven feature. Graph needs hop limits + hub caps (a carrier IP links thousands), keyed-HMAC identifiers, coarse location.
- **L6 order: Stripe first** (becomes the reference/conformance suite), then PayPal; **LiPay stays a contract-tested fake** until its real API exists.
- Delete the daemon's payment routes after L7, updating `connectors.test.ts`; migrate (not alias) the old `amountCents`/lowercase contract.
- Postgres `bigint` comes back as a string in node-pg → one safe-integer row decoder (L2).
**Later / out of scope:** accounting journal as a projection from events (later), automated chargeback evidence (later), own FX engine (out), tax calculation (out), card vault (out), receipts/invoices owned by consumer plugins.
**Gemini additions:** (a) elevated risk → authorize with manual capture, then capture/void after async review; (b) move L8 (catalog onto Money, uppercase currency) BEFORE L4, else catalog checkout fails the currency check; (c) wants the ungated daemon payment routes deleted in L0 (Sonnet: after L7) — coordinator: delete in L0 since nothing is wired to them (`deps: {}`), updating `connectors.test.ts` in the same lot.
