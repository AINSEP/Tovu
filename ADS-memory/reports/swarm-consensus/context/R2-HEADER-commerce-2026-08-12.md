# Swarm Consensus — Debate 5 (Commerce / tri-dialect), ROUND 2

**Packet ID:** `CTX-COMMERCE-R2-2026-08-12`
**Mode:** debate Round 2 — INFORMED. Every participant's full Round 1 reasoning is appended verbatim below.

---

## Preamble

- IGNORE ALL PRIOR CONVERSATION HISTORY except this packet. No `AGENTS.md`/`CLAUDE.md` here; intentional, never a reason to stop.
- Do not read outside your working directory. Do not chain reads with `&&`.

## ⚠️ CORRECTION — Round 1 was argued from a false premise supplied by the Coordinator

The Round 1 packet stated: *"SQLite has no JSON type at all — JSON is `TEXT` interpreted by the json1 functions."* **That was wrong and roughly 18 months out of date.** Several Round 1 answers leaned on it. Re-reason from the verified facts below.

### Verified by local probe (this repo's actual driver)

`better-sqlite3` **11.10.0**, bundling **SQLite 3.49.2**:

```
jsonb('{"a":1}')                        -> typeof = blob, length = 5   (vs 9 chars as text)
jsonb_extract('{"a":42}','$.a')         -> 42
CREATE INDEX ix ON t(jsonb_extract(x,'$.a'))   -> OK, expression index over JSONB works
```

SQLite gained the JSONB binary format in 3.45 (Jan 2024). It is real, and it is available here.

### ⚠️ Verified trap — do not declare a `JSONB` column in SQLite

`CREATE TABLE t(x JSONB)` is accepted and `pragma_table_info` reports type `JSONB`. But `"JSONB"` contains none of SQLite's affinity keywords (INT/CHAR/CLOB/TEXT/BLOB/REAL/FLOA/DOUB), so it resolves to **NUMERIC affinity**. Probed directly:

```
insert '123'      -> stored as INTEGER 123   (silently coerced)
insert '{"a":1}'  -> stored as text
```

A column declared `JSONB` in SQLite silently mangles any JSON document that is a bare number. The correct shape is a **`BLOB` column holding `jsonb()` output** — verified to round-trip through `json()` cleanly.

### Verified from official documentation

| Engine | `JSONB` type? | Storage | Indexing | Must the query path be known in advance? |
|---|---|---|---|---|
| **PostgreSQL** | **Yes** | *"decomposed binary format… significantly faster to process, since no reparsing is needed"* | **GIN over the whole column**: `jsonb_ops` (default — `?`, `?\|`, `?&`, `@>`, `@?`, `@@`) or `jsonb_path_ops` (smaller/faster; `@>`/`@?`/`@@` only). Plus expression GIN, plus btree/hash for whole-document equality | **No** |
| **MySQL 8** | No — only `JSON` | Binary, functionally equivalent: *"converted to an internal format that permits quick read access… look up subobjects or nested values directly by key or array index"* | *"JSON columns, like columns of other binary types, are **not indexed directly**; instead, you can create an index on a generated column that extracts a scalar value."* Plus InnoDB multi-valued indexes for arrays | **Yes** |
| **SQLite 3.49.2** | No type (see trap above) | Real JSONB binary via `jsonb()` in a BLOB | Expression index over `jsonb_extract(...)`, or generated column | **Yes** |
| **MariaDB** | No | **`JSON` is "an alias for `LONGTEXT COLLATE utf8mb4_bin`"** — genuinely text, not binary | Expression/generated column only | **Yes** |

**MariaDB divergence, operationally important:** MySQL↔MariaDB row-based replication **fails** on JSON columns because MySQL stores compact binary and MariaDB stores LONGTEXT. "MySQL or MariaDB" is not one target.

**`jsonb_path_ops` caveat:** produces no index entries for empty structures such as `{"a": {}}`; searching for those degrades to a full index scan.

### The asymmetry that should drive the answer

JSONB **storage** is portable across all three required engines. **GIN-class ad-hoc indexed querying is PostgreSQL-only.** Postgres indexes the *document*, so paths need not be anticipated; MySQL and SQLite index only a *named extracted scalar*, so every queryable field must be declared up front — which is most of the way back to a real column.

## Owner's stated motivation (new)

Verbatim: *"I wanna specifically have JSONB columns for max flexibility."* Take this seriously and answer it directly rather than talking past it. The owner's instinct about MySQL was **correct** — MySQL's `JSON` is JSONB in all but name.

## Also relevant (verified since Round 1)

Drizzle does not solve dialect portability: `sqliteTable` / `pgTable` / `mysqlTable` are separate builders with different column types, so three dialects means three schema files, three configs, three migration trees, with nothing checking they stay equivalent. `drizzle.config.ts` currently hardcodes `dialect: "sqlite"`; `pgTable`/`mysqlTable` appear zero times in `src/`; installed drivers are `better-sqlite3` only. All JSON index DDL is hand-written regardless of ORM.

## What Round 1 established (build on, don't re-argue)

- Tovu's schema has **37** `text("*_json")` columns and **zero** are indexed; `mode: "json"` is used zero times. *Caveat now understood:* that convention predates SQLite 3.45, so it may be an artifact of its era rather than a considered rejection of JSONB.
- FTS5 precedent: the one existing case of indexing document-shaped data lives **outside** the Drizzle schema, in a hand-written `--custom` migration, because drizzle-orm has no builder for virtual tables or triggers.
- Postgres is explicitly deferred in-repo: *"deliberately evaluation-only — no live `pg` client."* MySQL has zero code.
- Open SaaS has **no commerce data model** to port (User, GptResponse, Task, File, DailyStats, PageViewSource, Logs, ContactFormMessage only) — just a processor abstraction over a `User` row.
- **Open SaaS has an idempotency bug:** `updateUserCredits` does `credits: { increment: … }` per delivery with zero event-id dedup anywhere in `user.ts`/`webhook.ts`/`stripe/webhook.ts`. Stripe delivers at-least-once. Do not copy that handler.
- `member_tiers` / `member_subscriptions` already exist and already model a priced, recurring thing — with no JSON.

## The Round 2 ask — CONVERGE (no code this round)

This debate gets a Round 3 for code. This round is convergence only.

1. **Answer the owner directly:** given storage is portable but ad-hoc indexed querying is Postgres-only, is "JSONB columns for max flexibility" right, partly right, or wrong for Tovu? Do not hedge.
2. **Where exactly is the JSON boundary?** State a rule someone can apply at review time to decide "column vs document," not a principle.
3. **Does the storage spelling change?** Should the 37 existing `text("*_json")` columns — and any new commerce ones — become `jsonb()` BLOBs on SQLite / `jsonb` on PG / `JSON` on MySQL? What breaks (readability, migrations, existing rows)?
4. **Is MariaDB in or out?** Given it is text-only and breaks replication with MySQL, say whether it should be a supported target.
5. **Idempotency + ordering.** Round 1 converged on `(provider, event_id)` UNIQUE. Settle the *ordering* half — out-of-order deliveries — and say whether the existing `version` column suffices (Round 1 said it does not).
6. **Products vs member_tiers.** New entity set, or extension of the existing one? Name the cost of each.
7. **Sequencing.** There is currently no code path that writes a commerce row in any dialect. Say whether the first slice should be schema-first or vertical-slice-first, and why.

State: your current position, whether it changed this round **given the corrected SQLite/MySQL facts**, the strongest argument against the leading opposing position, and what would change your mind. If the correction changed your answer, say so explicitly — that is a valuable signal, not a weakness.

## Required response format

Begin with exactly:

```
ACK_PACKET_RECEIVED CTX-COMMERCE-R2-2026-08-12 -- I received the packet and will work on it.
```

Headings: `## Position And Movement`, `## The JSONB Verdict`, `## The Column-vs-Document Rule`, `## Remaining Disagreements`, `## What Would Change My Mind`.

End with exactly `<<SWARM_END>>` on its own line.

---

# APPENDIX — Every participant's full Round 1 response, verbatim

