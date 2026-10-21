ACK_PACKET_RECEIVED CTX-commerce-gaps-2026-10-21 -- I received the packet and will work on it. (software-architect/skills.md loaded.)

**Existing code the design must absorb, not duplicate.** `packages/commerce/src/payments/` already has `ports.ts` (Money, idempotencyKey at :124/:149, a provider-event id used as inbound idempotency key at :165), `state-machine.ts` (a status machine kept in code, not the schema; its header says it is safe only while "lipay is the sole writer through one connection", :11-14), `lipay-plugin.ts` and `providers/lipay-gateway.ts`. `ports.ts:243` already notes that per-workspace merchant credentials are a real multi-tenant requirement. The state machine is a single-writer assumption the new design replaces. Lot L1 and L3 must say whether they migrate or replace it. Otherwise there will be two status machines.

**1. Gaps, ranked by "hurts first"**

1. **Live/test separation and tenant/site scoping on every row (S/M, v1, L1-L2).** Both are columns that cannot be added cheaply after money rows exist. Add `livemode` and `site_id` (or tenant) to payments, refunds, disputes, inbox and outbox, with uniqueness keyed on `(site_id, provider, provider_id)`. I found no tenant or `livemode` field in `ports.ts` (grep). Test-mode webhooks landing in a live ledger is a classic production incident.
2. **Stuck-money observability (S, v1, L4-L5).** Add metrics and alerts for `unknown` payments older than N minutes, dead-lettered inbox rows, outbox lag, over-refund quarantine count, and parked webhooks. Without these the reconciler is silent.
3. **Provider-config and webhook secret rotation (S, v1, L5).** Accept multiple active secrets per provider with a key id, and verify against all of them during a rotation window. Store secrets by reference only.
4. **Reconciliation against provider reports and payouts/settlement (M, v1 skeleton at L4, full later).** `retrieve` snapshots per payment are not a daily balance reconciliation. Add a settlement table (provider payout id, gross, fees, net, currency, date) and a matcher that flags payments with no payout and payouts with no payments. Provider fees need a column on payments from the start (S, v1), or net revenue is wrong.
5. **GDPR erasure vs append-only (M, v1 design, later build, L2).** Keep PII out of the money rows: payments hold only an opaque `customer_ref`, and PII (email, address, IP) lives in a separate erasable table. Layer 2 stores hashed or salted identifiers with a retention TTL. Decide this now. Retrofitting means rewriting history. Legal retention of financial records (typically 6-10 years) and erasure must not collide, so the money rows hold nothing erasable.
6. **Refund destination and store credit (S/M, v1 type, later impl, L4).** Model `refund.destination` (`original_method | store_credit | manual`). Store credit is not a provider refund and must not enter "refunded total = sum of succeeded provider refund rows". Make it a separate ledger entry type, or the invariant breaks.
7. **Chargeback evidence submission (M, later, L6+).** v1 only records disputes and their deadlines (`evidence_due_by`), with an alert as the deadline nears. Submitting evidence goes in a later lot.
8. **Multi-currency and FX (M, later).** v1 stores the presentment currency and amount, plus the settlement currency and amount when the provider reports them. No own FX engine (out of scope). Never sum across currencies. Refund over-limit checks must be per currency.
9. **Accounting export (M, later, after L4).** Don't build double-entry now. Keep a derived, append-only `ledger_entries` journal as a projection from the single writer (outbox consumer), so it can be rebuilt. Export CSV or journal for accountants later.
10. **Receipts, invoices, tax documents (L, later).** Emit `payment.succeeded` and `refund.succeeded` events. Receipts become an outbox consumer. Tax calculation and invoices are out of scope for v1 (use the provider's tax product).
11. **Data retention (S, later, L5).** Inbox payloads (raw webhook bodies contain PII) need a purge window. Ledger rows are kept.

**2. Layer 2 risks**

- **Pre-capture blocking is the real hole.** Outbox-fed risk cannot block anything. Add a synchronous `RiskGate` port, called by the single writer's authorize step with a hard timeout and a configurable fail-open or fail-closed policy. It returns allow, review, or deny plus reasons, and it reads risk data but never writes money rows. Provider-native checks (Radar, PayPal) are the realistic v1 gate. The custom graph then feeds async review, not the hot path (S port in v1 at L3, M implementation later).
- **Location privacy.** Purchase location and buyer location are personal data. Store coarse geohash or city rather than exact coordinates, set a TTL, require a consent or legitimate-interest basis, and make it erasable by subject key. This is an argument for hashing graph identifiers (cards by provider fingerprint, never PAN).
- **Per-DB adapters are not worth it in v1.** Ship one portable implementation (SQL tables of edges, recursive CTE depth-capped at 3, bounding-box geo with haversine in code), plus an optional Postgres accelerator behind the same port. Three adapters means three test matrices before any fraud signal has proven useful. The risk layer is already scheduled after L5, so keep it there.
- Graph false positives (shared household cards, shared office IPs) block real customers. Output must be a score with explanations and human review, never automatic bans.

**3. Defects in layers 1/3 and lot order**

- **Webhooks lack a defined out-of-order story.** "Statuses only move forward" is right, but a refund webhook arriving before its payment's success needs a park-with-backoff rule keyed on a missing parent. State it in L3.
- **Agent approval binding.** The approval must also bind `site_id` and `livemode`, or a test-mode approval can authorize a live refund. Add expiry (S).
- **Deleting the daemon's `/api/connectors/payments/*` routes** (`daemon/src/http/connectors.ts:396,405,415`) is a breaking change with live tests (`__tests__/connectors.test.ts:791`). Do it after L7, not before, behind a changelog note. The capability-providers `PaymentsProvider` uses `amountCents` (`payments.ts:15-23`) and lowercase currency, which conflicts with the UPPERCASE Money rule, so the migration must convert, not alias.
- **Lot order:** move the observability, `livemode` and `site_id` columns into L1/L2, and the RiskGate port into L3. L6 in parallel across three providers risks three divergent interpretations of the writer's contract, so land Stripe first and use it as the conformance suite for PayPal and LiPay.
- LiPay is not live, so its adapter must be contract-tested against a recorded fake and flagged experimental.

**Out of scope:** an own FX engine, tax calculation, a card vault, an own acquiring/payout rail.

<<SWARM_END>>