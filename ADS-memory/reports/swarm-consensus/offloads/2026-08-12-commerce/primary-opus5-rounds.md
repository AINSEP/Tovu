# Primary (Claude Opus 5) — Debate 5 (Commerce / tri-dialect)

## ⚠️ Protocol disclosure

No blind Round 1 position was frozen for this debate before dispatch — a Primary Participation failure. The Round 1 section is informed, not blind, and should be weighted accordingly. Round 2 below *is* properly frozen.

## ⚠️ And I supplied the peers a false premise

The Round 1 packet asserted *"SQLite has no JSON type at all."* That was wrong and ~18 months stale. Several Round 1 answers leaned on it, including as the central refutation of the owner's hypothesis. I verified the truth by direct probe and reissued corrected facts for Round 2. Recording it here because a Coordinator error that propagates into four peers' reasoning is the most damaging failure mode this format has, and it should be visible in the ledger rather than quietly fixed.

---

# Round 1 position (LATE — informed, not blind)

Relational core; JSON as a narrow escape hatch for provider-owned payloads; never indexed. Grounded in the repo's own convention: **37** `text("*_json")` columns, **zero** indexed, `mode: "json"` used zero times — and `member_tiers`/`member_subscriptions` already model a priced recurring thing with no JSON at all. Plus a portable `(provider, event_id)` UNIQUE idempotency table, since a unique index is one of the few DDL shapes byte-identical across all three engines.

---

# Round 2 position — FROZEN

Written after reading all Round 1 responses and after verifying the corrected dialect facts, before reading any Round 2 output.

## The JSONB Verdict — the owner is right about storage and wrong about flexibility

Direct answer, no hedge: **partly right, and right in the half he was pushing on.**

Right: MySQL's `JSON` is JSONB in all but name — the docs say it is *"converted to an internal format that permits quick read access… look up subobjects or nested values directly by key or array index."* SQLite 3.45+ has a genuine JSONB binary format, and this repo's driver (better-sqlite3 11.10.0 → SQLite 3.49.2) has it. Binary JSON storage is portable across all three required engines. My original objection on storage grounds is dead and I withdraw it.

Wrong: **the flexibility he wants is not the flexibility JSONB gives portably.** "Max flexibility" means querying fields you didn't plan for. Only Postgres delivers that — GIN indexes the *document*, so paths need not be anticipated. MySQL *"JSON columns… are not indexed directly; instead, you can create an index on a generated column that extracts a scalar value."* SQLite needs an expression index over `jsonb_extract`. Both require naming the path **up front** — which is most of the way back to declaring a column, at which point the document bought storage convenience, not query freedom.

So my position is unchanged in *conclusion* and completely changed in *reasoning*: not "SQLite can't do JSON" (false), but **"GIN-class flexibility is Postgres-only, so the product's core must not depend on it."**

## The Column-vs-Document Rule (applicable at review time)

> **If a query, an index, a constraint, a join, or a sort will ever touch it — it is a column. If it is read back whole by id and never sliced — it is a document. Never create an index that reaches into a document.**

The moment an index depends on the document, portability breaks and you are hand-writing three dialects of DDL. That rule is mechanically checkable in review, which is what makes it survive contact with schedule pressure — and it is what the repo already does 37 times.

The FTS5 precedent is the proof of what happens otherwise: the one existing case of indexing document-shaped data lives **outside** the Drizzle schema in a hand-written `--custom` migration, because drizzle-orm has no builder for virtual tables or triggers. That is the cost, once, for one dialect. A JSONB-indexed commerce model pays it on every filtered path, times three.

## Storage spelling

**New columns: `jsonb()` BLOB on SQLite / `jsonb` on PG / `JSON` on MySQL.** It is faster to read, validates on write, and costs nothing in portability since we are not indexing into it either way.

**Do not migrate the existing 37.** They work, they carry live data, and the gain is unmeasured. A 64-table rewrite for a read-speed improvement nobody has profiled is exactly the change that generates a long tail of incidents. Revisit if profiling ever shows JSON parse cost mattering.

**⚠️ And never declare the SQLite type as `JSONB`.** Verified by probe: `CREATE TABLE t(x JSONB)` is accepted and `pragma_table_info` reports `JSONB`, but the name matches none of SQLite's affinity keywords, so it resolves to **NUMERIC affinity** — inserting the string `'123'` stored **INTEGER 123**. Declaring `JSONB` is strictly worse than declaring `BLOB`. This is the single most actionable finding in the debate and it is invisible unless you probe it.

## MariaDB — out

Its `JSON` is *"an alias for `LONGTEXT COLLATE utf8mb4_bin`"*, genuinely text, not binary. Worse, MySQL↔MariaDB row-based replication **fails** on JSON columns because of that difference. "MySQL or MariaDB" is not one target and treating it as one will produce a support burden discovered in production. Support MySQL; state MariaDB is unsupported until someone asks with a real deployment.

## Remaining Disagreements

**Ordering, not just idempotency.** Round 1 converged on `(provider, event_id)` UNIQUE, and Sonnet correctly noted that stops *replay* but not *out-of-order* delivery, and that the existing `version` column gives optimistic concurrency between concurrent writers, not chronological ordering of externally-timestamped events. That needs a separate provider-event-sequence/timestamp column compared against the target row. Open SaaS demonstrates the failure directly — `updateUserCredits` does `credits: { increment: … }` with zero event-id dedup anywhere in its webhook path, so a Stripe retry double-credits. Verified. Do not copy it.

**Products vs `member_tiers`: extend, don't duplicate.** `member_tiers` already carries name, slug, status, `monthly_price_cents`, `yearly_price_cents`, `currency`, portal visibility. A parallel `products` table means two priced-thing models, two admin surfaces, and an inevitable reconciliation. The cost of extending is that memberships and one-time purchases share a table whose semantics stretch; I take that over the duplicate.

**Sequencing: vertical slice, not schema-first.** There is currently no code path that writes a commerce row in *any* dialect, MySQL has zero code, and Postgres is explicitly *"evaluation-only — no live `pg` client."* Designing three physical schemas against two adapters that do not exist is speculative work that also risks presenting unproven capability as ready. Prove checkout end-to-end on the one real dialect first; the second adapter is what tests portability, and you cannot test it against nothing.

## What Would Change My Mind

- A concrete present-tense reporting requirement needing ad-hoc queries over provider metadata — that promotes named fields to columns, or makes the case for Postgres-only commerce.
- A decision that commerce is Postgres-first in production with SQLite as dev/self-host only — then GIN is on the table and the whole calculus changes.
- A real, tested MySQL or Postgres adapter landing before commerce ships — that partly discharges the tri-dialect proof burden and would move me toward designing for three up front.

<<SWARM_END>>
