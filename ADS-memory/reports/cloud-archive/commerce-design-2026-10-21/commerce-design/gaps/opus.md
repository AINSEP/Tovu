ACK_PACKET_RECEIVED CTX-commerce-gaps-2026-10-21 -- I received the packet and will work on it.

The software-architect skills file loaded (`AI-Dev-Shop/agents/software-architect/skills.md`, v2.3.1).

**1. Gaps, ranked by which would hurt first**

1. **Webhooks cannot tell which site they belong to.** The route is `/payments/webhook/:providerId` (`commerce/src/payments/lipay-plugin.ts:60-61`), but credentials are looked up per workspace (`ports.ts:243-255`). With two sites on one install, the inbound path has no way to know whose signing secret to check. Rows already carry `workspace_id` (`lipay-plugin.ts:541`), but the inbox dedupe key is `(provider_id, provider_event_id)` (`:908`), with no workspace. Fix: put the workspace in the URL and scope every key by workspace. **v1, L1, S.**
2. **Test mode and live mode are not separated.** No mode column exists anywhere (grep found nothing). A test webhook or a test-key refund could touch live rows. Fix: add `mode` to every money row, to credential slots and to the webhook route, and bind it into agent approvals. **v1, L1/L2, S.**
3. **The state set is missing states the design itself relies on.** The current statuses (`state-machine.ts:21-40`) have no `requires_action`, `unknown` or `authorized`. Without `authorized`, capture and void (L7) have nothing to act on. **v1, L1, S.**
4. **Alerts on stuck `unknown` money, dead letters and an aging inbox.** These need metrics, an age threshold and an operator view. Silent stuck money is the first thing a real customer reports. **v1, L4, S.**
5. **Webhook secret rotation.** There is one `webhookSecret` slot (`providers/lipay-gateway.ts:179-194`). Verify against a list (current plus previous, with an expiry). **v1, L1 contract + L6, S.**
6. **GDPR erasure vs append-only records.** The inbox stores raw payloads (`lipay-plugin.ts:934`), which contain email, name and IP. Fix: keep money rows free of personal data (point to a `party_id`), keep personal data in a table that can be erased, and expire raw inbox bodies after they are applied (keep a hash). **v1 schema decision, L2, S.** Retention settings per table come **later, S.**
7. **Fees, net amount and settlement currency.** Without these, no accounting export or payout matching is possible. Add nullable `fee_minor`, `net_minor`, `settlement_currency` and `settlement_minor` now and fill them when the provider reports them. **v1 columns in L2, S.** Payout and balance-report reconciliation (including a sweep for payments the provider has that we don't, such as ones made in its dashboard) comes **later, after L6, M.**
8. **Accounting export.** Produce a double-entry journal as a projection from outbox events. Do not turn the ledger into double-entry. **Later, M.**
9. **Chargeback evidence submission.** Add it as a provider capability. Dispute rows already exist. **Later, L.**
10. **Multi-currency and FX.** Charge in the shopper's currency and record the settlement amounts from gap 7; we never convert currency ourselves. Provider currency quirks (Stripe's special cases such as HUF and TWD) belong in the provider plugins. **v1 as described, S.** Converting currency ourselves is **out of scope.**
11. **Refunds to the original method only in v1.** A failed refund (for example, a closed card) needs an operator path. Store credit is a liability ledger owned by catalog/consumers: **out of scope.**
12. **Receipts, invoices and tax.** These belong to consumers. L9 donations needs tax receipts, so plan them there. Tax calculation is **out of scope.**

**2. Layer 2 risks**

- **Blocking before capture can't run off the outbox, which is eventually consistent.** Add a synchronous `PreChargeRiskPort` to L1 contracts. It is called by the payments service before the provider call (or before capture when capture is manual), has a deadline and a configured fail-open or fail-closed policy, and ships with a no-op default. Its decision is stored as evidence on the attempt row, written by the single writer, so Layer 2 still never writes money records. In v1, the provider's own fraud tools (for example Stripe Radar) do the real blocking.
- **Hub nodes will blow up the fraud graph.** A carrier NAT IP or a shared corporate card links thousands of accounts. Recursive CTEs need hop limits, degree caps and down-weighting of hubs. This is a real defect in the design as written.
- **Privacy.** Never put raw IPs, emails or card fingerprints into the graph; use keyed HMACs of them. Store location coarsely (country, region, a coarse geohash). Give it its own retention window, and record a legitimate-interest basis.
- **Per-database adapters are not worth it.** Build one portable implementation (plain tables, recursive CTEs, bounding-box columns with plain indexes) that runs on SQLite and Postgres. Add an optional Postgres accelerator (GIN, PostGIS) behind the same port, using the same conformance tests. PostGIS is available on Supabase but not guaranteed on self-hosted Postgres or PGlite. Three adapters would mean three times the test matrix for a feature nobody has used yet.

**3. Things in layers 1 and 3 or the lot order I think are wrong**

- **"Statuses only move forward" is false for some objects.** A Stripe refund can go from `succeeded` to `failed` later, and a won dispute puts funds back. A payment-level `failed` also shouldn't be terminal (`state-machine.ts:30`) when a later attempt can succeed. Only *evidence* is monotonic; payment status should be derived from attempts, refunds and disputes. Fix in L1.
- **Today's out-of-order check compares `occurred_at` against the latest applied event** (`lipay-plugin.ts:937-950`). Stripe timestamps have one-second resolution, so ties drop real events. L3 must replace it with the design's forward-only evidence plus `retrieve` snapshots.
- **Postgres `bigint` comes back as a string in node-pg.** "Identical on every database" needs one row decoder that rejects anything that isn't a safe integer. This is L2, S.
- **LiPay in L6 is building against an API that doesn't exist.** Keep LiPay as the deterministic fake provider used for the L3 race and crash tests. Do Stripe first in L6, PayPal second, and real LiPay later.
- **The risk-layer port must be in L1**, even though its implementation comes after L5.
- **Before deleting the daemon routes** (`daemon/src/http/connectors.ts:396-415`), list who calls them and update `connectors.test.ts`.
- **Agent approvals must also bind workspace and mode.** This is L7, S.

<<SWARM_END>>