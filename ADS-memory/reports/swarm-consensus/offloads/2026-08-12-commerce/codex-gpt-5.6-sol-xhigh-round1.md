I’ll read the packet and every supplied source file in full, then return only the required debate format with path-and-line citations.
The packet’s central tension is clear: tri-dialect support is mandatory, while the existing implementation is SQLite-first and commerce is only a capability-reporting boundary. I’m now validating the exact schema and adapter details before taking a position.
ACK_PACKET_RECEIVED CTX-COMMERCE-2026-08-12 -- I received the packet and will work on it.

## Position

The JSONB hypothesis is **partly right as an escape hatch, but wrong as the foundation of the commerce model**. The best design is C: a relational commerce core with narrow, opaque JSON fields. It should have one semantic contract but three dialect-specific migration streams. That borrows D’s physical portability mechanism without allowing the schemas to acquire different meanings.

Tovu’s current schema already demonstrates the useful boundary: whole, evolving envelopes can remain JSON text, while query-critical fields such as `workspace_id`, status, and retry time are relational and indexed outside the document (`files/tovu/schema.ts:1066-1087`). Conversely, treating indexed JSON as portable is untenable: PostgreSQL, MySQL, and SQLite require different storage and indexing mechanisms (`PACKET.md:87-93`).

The stable relational core should include products or offerings, prices, orders and immutable order-line snapshots, invoices and invoice lines, payment attempts and transactions, refunds, subscriptions and subscription items, provider accounts, provider-object mappings, idempotency requests, and a webhook inbox. Every row must carry `workspace_id`; tenant identity must participate in natural keys, uniqueness constraints, and relationships rather than merely appearing as an unverified filter column. Existing subscription rows already use workspace scope, provider references, timestamps, and optimistic versions, but contain no financial history (`files/tovu/schema.ts:507-524`).

Provider-specific identifiers belong in a mapping keyed by workspace, provider account, object kind, and external identifier—not in an unqualified `external_ref`. Core records should use canonical provider-neutral states, with adapters translating provider states. That preserves the existing contract’s open provider identity and capability description (`files/tovu/commerce/contracts.ts:15-38`) while extending it without falsely advertising checkout or reconciliation, which are explicitly unavailable today (`files/tovu/commerce/status.ts:51-66`).

JSON should be limited to:

- Original provider request/event payloads needed for audit and replay.
- Unindexed merchant metadata.
- Provider-specific response details that core never interprets.
- Immutable snapshots whose variable portion is not used for selection, joins, authorization, or ordering.

Any JSON member that becomes operationally searchable must be promoted to a relational column through all three migration streams. The existing outbox does exactly this for `workspace_id` instead of extracting it from the event document (`files/tovu/schema.ts:1066-1087`).

Money should remain integer-based, but “cents” is too narrow a domain concept. Store an integer minor-unit amount together with currency and the applicable minor-unit exponent. Persist net, discount, tax, gross, refunded, and settlement amounts rather than repeatedly recomputing them. Proration becomes explicit signed invoice lines; partial refunds become immutable rows linked to the original payment; currency conversion records both currency amounts plus a fixed-decimal rate snapshot. Tovu’s current tier model hardcodes monthly and yearly cent values (`files/tovu/schema.ts:485-503`), while Open SaaS’s floating revenue totals and conversion of processor cents to a floating major-unit number are patterns not to copy (`files/opensaas/schema.prisma:66-78`; `files/opensaas/payment/stripe/paymentProcessor.ts:79-105`).

`member_tiers` should not be renamed into generic products. It includes membership-specific behavior such as welcome pages and portal visibility and supports exactly two price slots (`files/tovu/schema.ts:485-503`). Instead, a commerce offering or price should reference an entitlement target such as a member tier. Commerce owns financial subscription truth; the members domain owns access entitlement and may retain `member_subscriptions` as its projection. This introduces an explicit bridge but avoids making orders, invoices, refunds, and arbitrary pricing subordinate to a membership table.

Webhook safety requires a durable inbox with a uniqueness key such as workspace, provider account, and provider event ID. Receipt, domain mutation, and any local outbox event must commit atomically. Duplicate delivery then observes the existing inbox record. Out-of-order delivery must be resolved from provider sequence/version information or an authoritative provider read—not arrival order—and every transition attempt should remain auditable. Tovu already uses storage-level webhook deduplication and retry state elsewhere (`files/tovu/schema.ts:691-727`) and has a workspace-scoped idempotency constraint for change sets (`files/tovu/schema.ts:1020-1043`). Open SaaS’s direct webhook-to-User updates provide no equivalent inbox model (`files/opensaas/payment/stripe/webhook.ts:94-169`; `files/opensaas/payment/user.ts:47-65`).

There should be three physical migration histories because JSON representation, indexing, generated columns, and other DDL differ by dialect (`PACKET.md:87-93`). They should share logical migration IDs and an invariant manifest defining tables, relationships, uniqueness, nullability, state rules, and observable repository behavior. Existing SQLite history remains its lineage; PostgreSQL and MySQL need equivalent baselines, not fabricated replays of SQLite SQL. This is especially important because the staged PostgreSQL code explicitly contains only pure capability evaluation and says the actual adapter is deferred (`files/tovu/db-postgres-ops.ts:4-15`).

Tri-dialect equivalence must be demonstrated against real PostgreSQL, SQLite, and MySQL instances through fresh and upgrade migrations, schema-invariant inspection, repository contract tests, money golden vectors, workspace-isolation tests, and concurrent duplicate/out-of-order webhook scenarios. The minimum credible proof is one fixed-price purchase carried through product, price snapshot, order, payment attempt, duplicate webhook receipt, and refund on all three engines. Its rollback boundary is disabling the unproven commerce capability and retaining isolated additive financial records—not down-migrating live payments. That follows the current status model’s explicit refusal to claim unsupported capabilities (`files/tovu/commerce/contracts.ts:43-62`).

From Open SaaS, take only the abstraction ideas: a processor boundary, plan-to-provider-ID mapping, adapter-owned signature verification, checkout creation, and customer-portal access (`files/opensaas/payment/paymentProcessor.ts:20-37`; `files/opensaas/payment/paymentProcessorPlans.ts:4-41`; `files/opensaas/payment/stripe/webhook.ts:14-26,80-91`). Do not port its schema or interface verbatim. Its processor is a compile-time singleton with a closed provider union and Prisma `User` dependencies (`files/opensaas/payment/paymentProcessor.ts:1-37`); subscription state is stored directly on `User` (`files/opensaas/schema.prisma:10-29`); and its Wasp specification exposes User-bound actions and webhook routes (`files/opensaas/payment/payment.wasp.ts:14-27`). It is useful reference code, not out-of-the-box Tovu commerce.

## Option Assessment

- **A — JSONB-first:** Reject as the core. It weakens relational constraints, moves validation into application code, and makes indexed access depend on three different DDL strategies (`PACKET.md:87-93`). JSON is valuable only where Tovu does not need portable database semantics.

- **B — Fully relational lowest-common-denominator:** Reject in its absolute form. Stable commerce facts should be relational, but provider envelopes and genuinely opaque metadata should not cause schema migrations for every new optional field. Tovu’s outbox documents an appropriate reason to store an evolving envelope whole while denormalizing indexed fields (`files/tovu/schema.ts:1066-1073`).

- **C — Relational core plus narrow JSON:** Accept as the logical model. It aligns with Tovu’s established normalized-column-plus-JSON-text convention (`files/tovu/schema.ts:4-13`) while keeping commerce invariants queryable and portable.

- **D — Independent per-dialect schemas:** Reject if “independent” permits semantic divergence. Accept only its recognition that physical DDL and migrations must differ. A repository port cannot by itself prove equivalent uniqueness, transactions, ordering, or failure behavior; Tovu’s PostgreSQL adapter gap illustrates that an interface is not an implementation (`files/tovu/db-postgres-ops.ts:6-11`).

- **E:** No separate foundation is necessary. C plus a shared invariant contract and dialect-specific migrations covers the primary design.

## Failure Modes And Sacrifice

The largest hidden cost is not table count; it is maintaining three migration implementations and proving that constraint behavior stays equivalent. Tovu already has cases where Drizzle cannot express the desired SQLite partial uniqueness and enforcement moves into application code (`files/tovu/schema.ts:381-392`). Repeating such exceptions across three engines can quietly create different race behavior.

Splitting financial subscriptions from member entitlements can produce drift: a paid subscription may fail to activate access, or a cancellation may revoke it twice. Clear ownership, a unique bridge, durable outbox delivery, and reconciliation are necessary. Treating both `member_subscriptions` and commerce subscriptions as writable authorities would be the worst form of the double model; the existing member row already carries its own status and version (`files/tovu/schema.ts:507-524`).

Other likely failures are tenant leakage from uniqueness keys that omit workspace, external-reference collision across provider accounts, integer overflow at aggregate scale, inconsistent rounding, unbounded sensitive provider payload retention, and webhook “processed” flags committed separately from domain changes. The current webhook-delivery table shows the appropriate combination of workspace-scoped deduplication, attempts, retry time, and terminal timestamps (`files/tovu/schema.ts:700-726`).

The genuine sacrifice is **no ad hoc indexed querying inside metadata or provider JSON**. When a metadata field becomes operationally important, Tovu must pay for a modeled column, three migrations, backfill semantics, and contract tests. That is deliberate loss of short-term flexibility in exchange for portable constraints and predictable queries.

## What Would Change My Mind

I would favor A if production-shaped evidence showed that the dominant commerce queries genuinely target unpredictable document members, and dialect-specific PostgreSQL, SQLite, and MySQL indexes delivered equivalent correctness, upgrade safety, and acceptable query plans. The current dialect differences make that an evidence burden, not a default assumption (`PACKET.md:87-93`).

I would favor B if the supported provider contract were deliberately closed and raw payload replay, arbitrary merchant metadata, and provider evolution were excluded requirements.

I would favor a stronger form of D if a shared invariant suite proved that materially different physical schemas reduced operational cost without observable semantic drift—and if all three complete adapters existed. The current PostgreSQL file explicitly defers the actual adapter, while the primary schema imports SQLite builders (`files/tovu/db-postgres-ops.ts:6-11`; `files/tovu/schema.ts:1-2`).

I would extend `member_tiers` directly instead of introducing commerce catalog entities if the product scope were permanently restricted to one membership entitlement, monthly/yearly prices, one active subscription per member, and no independent orders, invoices, refunds, or catalog. Its present fields support that narrower system (`files/tovu/schema.ts:485-524`).

I would take more from Open SaaS if it supplied a processor-neutral financial ledger, durable event idempotency, workspace isolation, and portable commerce entities. The staged version instead updates subscription and credit fields on a single User record (`files/opensaas/schema.prisma:18-23`; `files/opensaas/payment/user.ts:47-90`).

## Unlisted Option

A viable decomposition not listed is an **append-only financial journal plus relational current-state projections**. Provider events remain an inbox, money movements form an immutable journal, and order/subscription tables are projections with optimistic versions. This improves auditability and lets reconciliation rebuild current state without making every catalog edit event-sourced. Tovu already uses append-only revision ledgers and a durable outbox, so the pattern is locally established (`files/tovu/schema.ts:311-330`; `files/tovu/schema.ts:1066-1087`).

I would use this as a refinement of C where accounting-grade audit and reconstruction are requirements, not as justification for a document-first or fully event-sourced commerce system.

## Blind Spots

**(a) Viable option not listed:** The append-only financial-journal/projection hybrid above. A more operationally isolated variant could place that journal behind a commerce service boundary while retaining the same tri-dialect invariant contract.

**(b) Missing question:** What commerce is actually in scope, and who is merchant of record? Physical goods, inventory, shipping, tax jurisdictions, discounts, metered usage, digital entitlements, and marketplace payouts require materially different invariants. Open SaaS assumes one invoice or subscription line and delegates automatic tax to Stripe, illustrating how narrow its commerce assumptions are (`files/opensaas/payment/stripe/webhook.ts:133-146,211-223`; `files/opensaas/payment/stripe/checkoutUtils.ts:37-54`).

**(c) Framing assumption most likely wrong:** That database-native JSON flexibility is the main portability problem. The harder contract is consistent tenant isolation, money rounding, uniqueness, transactions, webhook ordering, migration behavior, and recovery across three engines. Tovu’s own outbox keeps the flexible event in JSON but extracts the fields needed for reliable selection and indexing (`files/tovu/schema.ts:1066-1087`). That is the correct separation: JSON preserves opaque information; relational structure preserves commerce truth.

<<SWARM_END>>