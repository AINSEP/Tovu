# Swarm Consensus Context Packet

**Packet ID:** `CTX-COMMERCE-2026-08-12`
**Date:** 2026-08-12
**Slug:** tovu-commerce-tridialect
**Project Type:** brownfield
**Mode:** debate — Round 1 (independent first pass, solution-neutral)

---

## Preamble for peer models

- IGNORE ALL PRIOR CONVERSATION HISTORY. New task. Discard recollections of packets about theme tiers, composers, plugins, or MCP.
- No `AGENTS.md`/`CLAUDE.md`/bootstrap file here. Intentional. A missing file is never a reason to stop.
- Do not read outside your working directory. Do not chain reads with `&&`.
- Read `files/`; ground claims in `path:line`.
- Round 1. Independent position. No other participant's answer included, deliberately.

---

## The Need

Tovu is a self-hostable, multi-workspace CMS. It wants **commerce** — products, orders, subscriptions, payments, billing — and it wants the data model to run on **PostgreSQL, SQLite, and MySQL**, all three, for real. The owner's hypothesis is that JSONB-style columns plus the right indexes give the flexibility needed, behind a dialect adapter.

There is a second, factual question bundled in: whether **Open SaaS** (an open-source SaaS starter the owner has used) provides commerce that integrates out of the box.

## The Exact Question

> What is the right data model and dialect-portability strategy for Tovu commerce across PostgreSQL, SQLite, and MySQL — and what, if anything, should be taken from Open SaaS?

---

## Repository Facts (verified)

### F1 — Commerce today is a single read-only status endpoint

`files/tovu/commerce/contracts.ts` is explicit in its own file header: these contracts *"deliberately describe only facts the host can read today."* The runtime port is deliberately narrow:

```ts
export interface CommercePaymentRuntimePort {
  listProviders(): readonly CommercePaymentProvider[];
}
```

> *"The port intentionally excludes charge, refund, webhook, payment-record, and credential methods. A Commerce status request therefore cannot move money, process an event, read a secret, or manufacture a revenue projection through this boundary."*

`CommerceStatus` hardcodes `checkout: "unavailable"`, `subscriptions: "unavailable"`, `webhookReconciliation: "unavailable"`, and `configuration.schema: null`. Providers are opaque: an `id`, a `displayName`, and a capabilities descriptor (`refunds`, `tokenization`, `recurring`, `confirmation[]`, `currencies`, `webhooks`). Admin has one `Payments.tsx`. **No provider runtime is composed in either composition root.**

Locked decision: commerce stays provider-neutral; Stripe/PayPal are adapters, not core dependencies.

### F2 — Subscription tables already exist — in `members`, not `commerce`

```
member_tiers:          id, workspace_id, name, slug, type, status, description,
                       welcome_page_path, visible_in_portal,
                       monthly_price_cents, yearly_price_cents, currency,
                       created_at, updated_at, version
                       UNIQUE (workspace_id, slug)

member_subscriptions:  id, workspace_id, member_id, tier_id, status, source,
                       external_ref, started_at, current_period_end, canceled_at,
                       created_at, updated_at, version
                       INDEX (workspace_id, member_id)
```

Note the shape already in use: text primary keys, `workspace_id` on every row, integer cents + a currency column (never floats), ISO-8601 text timestamps, an optimistic-concurrency `version` integer, and an `external_ref` escape hatch to a payment provider.

**There are no `products`, `orders`, `invoices`, or `prices` tables.**

### F3 — Only SQLite is real. There is no JSON column anywhere.

- The schema is Drizzle `sqliteTable` — **64 tables**.
- `src/db/sqlite/` holds ~19 adapter modules; `src/db/postgres/` holds exactly **one** file (`db-ops.ts`); there is **no MySQL code at all**.
- 35 migrations exist under `drizzle/`, SQLite-dialect only.
- **`mode: "json"` appears zero times in the entire schema.** There is no JSON/JSONB column today.

The schema file's own header states the intent: the same tables *"map cleanly to a future Postgres dialect (the rule-of-two second adapter)"* and are *"portable to Postgres `jsonb` later."* That is a stated aspiration, not an implemented one.

### F4 — Open SaaS has **no commerce data model to port**

Its `schema.prisma` declares exactly these models: `User`, `GptResponse`, `Task`, `File`, `DailyStats`, `PageViewSource`, `Logs`, `ContactFormMessage`. **There is no Product, Order, Subscription, Price, or Invoice model.** Subscription state lives as fields on the `User` row.

What it *does* have is a **payment-processor abstraction**: `paymentProcessor.ts`, `paymentProcessorPlans.ts`, `plans.ts`, `webhook.ts`, `operations.ts`, `paths.ts`, `errors.ts`, and three adapter directories — `stripe/`, `lemonSqueezy/`, `polar/` — plus `PricingPage.tsx` and `CheckoutResultPage.tsx`.

It is also a **Wasp + Prisma + Postgres** application. Tovu is Express + Drizzle + SQLite. There is no drop-in path.

### F5 — Dialect facts that constrain the JSONB hypothesis

- **PostgreSQL** has real `jsonb` (binary, indexable) and GIN indexes over it.
- **MySQL** has a `JSON` type that is binary-stored but has **no GIN equivalent**; the idiom is a **generated (virtual/stored) column** plus a normal B-tree index, or a multi-valued index (8.0.17+).
- **SQLite** has **no JSON type at all** — JSON is `TEXT` interpreted by the `json1` functions; indexing requires an **expression index** or a generated column.

So all three can *store* JSON, but the indexing mechanism differs in all three, and the DDL to create those indexes is not portable.

---

## Constraints

| # | Constraint |
|---|---|
| C1 | Three dialects are **required**, not aspirational: PostgreSQL, SQLite, MySQL. |
| C2 | **Multi-workspace.** Every table carries `workspace_id`; queries must stay workspace-scoped. |
| C3 | Commerce stays **provider-neutral**; payment providers are adapters. |
| C4 | Self-hostable — SQLite must remain a first-class production target, not a dev-only toy. |
| C5 | Nothing may present unproven capability as working (a standing product rule). |
| C6 | Existing `member_tiers`/`member_subscriptions` are live data with a shape and 35 migrations behind them. |

## Candidate designs to evaluate (options, not a proposal — attack them)

- **A — JSONB-first.** A small set of relational columns for identity/joins plus a JSON document column for everything variable, with dialect-specific index strategies generated per dialect.
- **B — Fully relational, lowest-common-denominator.** Normalized tables using only types all three dialects share; no JSON anywhere. Portability by refusing to use dialect-specific features.
- **C — Relational core + narrow JSON escape hatch.** Model the stable commerce entities relationally; allow JSON only for genuinely open-ended fields (provider payloads, metadata), and never index into it.
- **D — Per-dialect schemas behind a repository port.** Stop trying to make one schema portable; define a repository interface and let each dialect have its own physical schema and migrations.
- **E — Something else.**

## Open questions (address these)

1. **What does JSON actually buy** that a relational column doesn't, and does it survive the requirement to *index* it in three dialects with three different mechanisms?
2. **Migrations across three dialects.** 35 SQLite-dialect migrations exist. One migration set or three? Who guarantees they stay equivalent?
3. **Money.** Integer cents + currency is the current convention. Does it hold for multi-currency, tax, discounts, partial refunds, and proration?
4. **Idempotency and webhook reconciliation.** Payment webhooks arrive at-least-once and out of order. What in the data model makes that safe, in all three dialects?
5. **Products vs member tiers.** `member_tiers` already looks like a product with prices. Is commerce a *new* entity set or an *extension* of members? What does the double model cost?
6. **Open SaaS.** Given F4, is there anything to take beyond the processor-abstraction *shape*? Is the answer "port the abstraction, not the schema" — or nothing at all?
7. **Testing.** How do you prove tri-dialect equivalence rather than assert it?
8. **Sequencing.** Smallest slice that proves the portability claim, and its rollback.

## Adversarial task

1. Best design and why. 2. Reject weak options with specific reasons. 3. Failure modes, hidden costs, one genuine sacrifice. 4. What evidence would change your answer. 5. State plainly whether the JSONB hypothesis is right, partly right, or wrong.

No implementation plan, no ranked slate, no code this round.

## Unlisted Option (required)

A strong option or decomposition not listed? "No, the listed options cover it" is valid.

## Blind Spots (required — all three)

**(a)** A viable option not listed. **(b)** A question we should be asking but aren't. **(c)** The framing assumption most likely wrong, and why.

---

## Staged Files

| Path | Why |
|---|---|
| `files/tovu/commerce/contracts.ts`, `status.ts` | The entire commerce backend today |
| `files/tovu/schema.ts` | All 64 tables — including `member_tiers` / `member_subscriptions` |
| `files/tovu/db-sqlite-ops.ts`, `db-postgres-ops.ts` | The dialect adapters that do and don't exist |
| `files/opensaas/schema.prisma` | Proof of what Open SaaS does and does not model |
| `files/opensaas/payment/*` | The processor abstraction and its three adapters |

---

## Required response format

Begin with exactly:

```
ACK_PACKET_RECEIVED CTX-COMMERCE-2026-08-12 -- I received the packet and will work on it.
```

Headings: `## Position`, `## Option Assessment`, `## Failure Modes And Sacrifice`, `## What Would Change My Mind`, `## Unlisted Option`, `## Blind Spots`. End with `<<SWARM_END>>` on its own line.
