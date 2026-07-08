# ADR-023: Core-Mediated Plugin Data Modules — Declared Schema, Core-Executed DDL, Snapshot-Anchored Recovery (Split-Finalized)

- Status: PROPOSED 2026-07-08 (from a 2-round swarm debate; resolves the ceiling deferred by ADR-003/ADR-022 §Open / TODO §6)
- Author: Leon Aburime / Coordinator (Opus 4.8 Primary) with peers Codex `gpt-5.5`, Gemini 3.1 (`agy`), Fable
- Extends: **ADR-003** (lifts its "plugins never get DDL" ceiling, without handing plugins a DB handle) and **ADR-022** (its `entries`/ext-bag stays the default plugin data surface; this adds an opt-in tier above it)
- Relates: **ADR-024** (its Tier-2 isolation is the hinge of this ADR's split — see Decision §0), ADR-015 (Drizzle behind ports; core owns migrations), ADR-021 (`dataModule` is a capability, a separate axis from human authz), ADR-008 (change-sets / reversibility), ADR-011 (end-user SQLite on a non-expert's machine), TODO §6

## Context

ADR-003 forbade plugin DDL and ADR-022 kept that ceiling: plugin data lives in the
validated, expression-indexed `fields.ext.{owner}.*` bag. That bag carries most
extension needs, but it caps **relational-heavy / commerce-scale** plugins —
WooCommerce-style faceted catalogs, directories, booking systems — which want real
tables with joins, foreign keys, and compound indexes. ADR-022 recorded this as an
explicit unresolved Open ("the owner wants a compromise") and pointed at the
core-mediated **tier-promotion** path ADR-003 had already seeded. This ADR is that
compromise.

The governing constraint is unchanged from ADR-022 §4: the site is a **live end-user
SQLite file on a non-expert's machine** (ADR-011). No plugin action may require a risky
migration or leave the site unable to reach a working state. The question this ADR
answers is therefore *not* "can plugins have tables" but "**can plugins have tables
without giving up never-brick or the ADR-022 write chokepoint**."

A 2-round adversarial swarm debate stress-tested the design and converged tightly
(combined ~0.88; Q1 effectively unanimous). Full trace + decision ledger:
`.local-artifacts/swarm-consensus/runs/20260708T162852Z-plugin-extensibility-ceiling/consensus-report.md`.

## Decision

### 0. This decision is SPLIT along the isolation line (read first)

Because a Tier-3 in-process plugin can today touch `fs`/`env`/network directly
(ADR-024 §Context — the multi-site blast-radius fact), the guarantees below fall into
two classes with **different force**:

- **Recoverability half — holds unconditionally, now.** Who executes and who reverses
  schema change (§2, §4, §5, §6, §9) is a property of *core*, not of the plugin's trust
  level. A plugin that goes around core with raw `fs` writes still cannot defeat
  snapshot-before-DDL, because the snapshot is taken and the DDL is run *by core*. This
  half is the never-brick guarantee and is safe to finalize/accept as written.
- **Access-control half — ADVISORY until Tier-2 isolation ships (ADR-024 §4).** The
  capability gate (§3), typed-only writes (§7), and authorizer-sandboxed reads (§8)
  are **real containment for Tier-1/Tier-2 plugins and real intent for Tier-3**, but a
  Tier-3 in-process plugin can **bypass them** (open the DB file directly, ignore the
  repository, escape the authorizer) until real isolation exists. Until then these
  clauses are enforced-by-convention-and-API for trusted code, enforced-by-runtime only
  once ADR-024's per-site `utilityProcess` + capability sandbox lands. **They must not
  be marketed as enforced security boundaries for third-party code before that.**

Everything below is written to that split.

### 1. Lift the ceiling — eventually, not in v1 (the mechanism, not the engine)

Plugins **may** own real relational tables, but **only** by **declaring the desired
schema as data** that **core alone executes**. A plugin never authors a migration and
never holds a raw DB handle. v1 ships the **seams**, not the engine (§12).

### 2. Mechanism = core-mediated declarative tables (state-based reconciliation)

A plugin declares its desired schema (tables, columns, indexes, declared FKs) as a
**manifest data structure**. Core diffs declared-state against live-state and executes
the DDL itself via a **core-owned migration journal + lock** — the same path core uses
for its own schema (ADR-015). Plugins never emit `ALTER`/`CREATE`; they emit a
description core is free to satisfy, refuse, or defer. *(Access-control caveat per §0
applies to "never emit" for Tier-3.)*

### 3. Table ownership is capability-gated (default-deny) — *advisory until isolation*

The ext-bag (ADR-022) is free to every plugin. **Owning tables** requires the plugin's
manifest to request a **`dataModule` capability**, which is **default-deny** and
**user-consented** at install. The gate is load-bearing not for *corruption* (§2 handles
that by construction) but for **operational blast radius** — a multi-hour rebuild, disk
exhaustion, or a lock storm on a non-expert's machine is a "brick" even when the file
stays valid. The capability **record** (not the consent dialog) is the mechanical anchor
to which core attaches the mandatory pre-DDL snapshot, disk preflight, maintenance-window
scheduling, and journal entry. *(Per §0, this gate is advisory for Tier-3.)*

### 4. Snapshot-before-any-DDL is the reversibility anchor — *holds unconditionally*

Core takes a **whole-file snapshot** (SQLite online backup API) **before every schema
change**. If the change fails, core **restores** and leaves the plugin **uninstalled**.
This is the never-brick primitive and does not depend on the plugin's trust tier.
Copy-on-write shadow-tables are a **later >~1GB optimization**, not v1 (CoW WAL
manipulation is riskier to build than a file copy).

### 5. Namespaced tables — collisions structurally impossible

All plugin tables live under a reserved namespace **`p_{pluginId}__*`** keyed on a
**stable, globally-unique plugin ID**. Two plugins cannot collide; core tables are never
shadowed. The namespace is a frozen v1 seam even before the engine exists.

### 6. Uninstall retains data (mirrors ADR-003)

Uninstall is **non-destructive**: a plugin's tables and rows are retained. **Purge** is a
separate, explicit user action. Reinstall reconciles against retained data. This mirrors
ADR-022's retain-on-uninstall stance and is part of the recoverability half.

### 7. Writes go through a typed, core-owned repository only — *advisory until isolation*

Plugin table **writes** use a **typed, core-owned repository** — **no raw write SQL**.
This preserves ADR-022's single write chokepoint, its append-only revision journal, and
its hooks (and carries the ADR-024 `pluginId` attribution stamp). A raw write path would
be an **invariant break**, not a preference; a commerce plugin loses nothing because its
writes are CRUD-shaped. *(Per §0, Tier-3 can bypass the repository until isolation.)*

### 8. Reads may be raw, but authorizer-sandboxed — *advisory until isolation*

Plugin **reads** may be **raw `SELECT`s** (manifest-declared named queries preferred),
scoped to `p_{pluginId}__*` plus core-published read views, and **bounded by
`sqlite3_set_authorizer` + `PRAGMA query_only` + a progress-handler timeout**. This gives
commerce-grade joins / recursive CTEs / window functions / faceting **without** a bespoke
ORM, while containing the runtime surface (lock storms, full scans, malformed statements).
*(Codex's one narrow hold-out preferred typed-only reads; the authorizer + query_only +
timeout bound was judged sufficient to admit raw reads. Per §0, Tier-3 can bypass the
authorizer until isolation.)*

### 9. Never-brick means "recoverable to a working state," not zero data loss

Restore is honest, not magical: on rollback core **re-snapshots first**, then restores,
and **names the exact discarded write window** to the operator. "Never-brick" =
*always recoverable to a working state*, **not** *zero data loss under every rollback*.
Recoverability half.

### 10. The data-migration gap is closed by a constrained transform DSL + backfill jobs

Schema evolution that must move data uses a **small, constrained transform DSL**
(`SELECT`-old → `UPSERT`-new, **in-namespace only**, pure row-local) plus **bounded,
resumable, core-run backfill jobs**. The DSL is deliberately tiny; the escape valve is a
post-migration **app-level backfill through the typed write API (§7)** — not
migration-logic smuggling into the DSL.

### 11. Reversibility primitive is a file copy by default (not CoW)

The default reversibility mechanism is the whole-file snapshot (§4). CoW shadow-tables are
a deferred large-DB optimization. Restated here because it is the seam v1 must not close.

### 12. v1 ships seams only — build the engine against real demand

Do **not** build the reconciliation engine in v1. v1 commits only the load-bearing,
hard-to-retrofit seams:
- the reserved `p_{pluginId}__*` **table namespace**;
- a **`dataModule` manifest key** (recognized, and **rejected with a clear "data-tier
  coming later" error** until the engine ships);
- **stable, globally-unique plugin IDs**;
- **snapshot/restore that already covers unknown future plugin data** (whole-file);
- a **site-wide journaled migration timeline** (core's own, extended to admit plugin
  entries later);
- an **SDK data seam** a scoped repo can slot into.

The ext-bag (ADR-022) remains the v1 plugin data surface; ADR-003's manual tier-promotion
is the interim bridge. Ship the engine v-next **against a concrete demand plugin**, not
speculatively.

## Consequences

- **The ceiling in ADR-022 §Open / TODO §6 is resolved** — as a designed, sequenced path,
  not as "build it now." Commerce/directory plugins have a first-class future without v1
  taking on the reconciliation engine's risk.
- **Never-brick survives the concession** because it was never about *whether* plugin
  tables exist — it is about *who executes and reverses schema change*. Core keeps both.
- **The ADR-022 write chokepoint is preserved** through typed-only writes (§7) — plugin
  table mutations are attributable (ADR-024 `pluginId` stamp) and revisioned, same as
  entries.
- **The security story is honestly staged (§0):** recoverability is real today;
  access-control is advisory until ADR-024's Tier-2 isolation. Do not conflate the two in
  docs, marketing, or the capability consent UI.
- **Rejected alternatives:** per-plugin `ATTACH`ed database files (Candidate C3) — kills
  core↔plugin joins and FKs; kept only as an isolation *fallback*. "No plugin tables ever"
  (C4) — correct v1 *scope*, wrong as permanent *doctrine*. Raw plugin *writes* — endorsed
  by no voice; an invariant break.

## Open

- **Owed before "commerce-grade" is a claim:** a **faceted-catalog benchmark (~50k
  products)** on end-user SQLite — measuring how far the ext-bag (ADR-022) alone carries
  before the reconciliation engine is worth building. This is the sibling of ADR-022's
  owed 100k-entry benchmark and ADR-024's owed catalog-demand audit.
- **CoW shadow-table threshold** (§11): the exact DB-size cutoff and the WAL-manipulation
  design are deferred to when a real large-DB plugin exists.
- **Transform-DSL surface** (§10): the DSL's exact grammar is designed-now / frozen only
  when the engine is built; it must stay non-Turing-complete and bounded-cost (inherits
  ADR-022's expression-totality amendment).
- **The whole access-control half graduates from advisory → enforced only when ADR-024
  §4 (per-site `utilityProcess` + capability sandbox) ships.** Re-review this ADR's §0 at
  that milestone.

## Debate record

2-round swarm debate, tight convergence (combined ~0.88). R1 (blind): all four voices
independently reached the core-mediated declarative mechanism (Candidate 1) and rejected
both "no tables ever" as doctrine and per-plugin ATTACH as primary. Two forks surfaced:
the capability gate (agy "safe-by-construction, no gate" 0.90 vs Codex "gate for
blast-radius" 0.82 vs Fable/Primary "consent as UX") and raw SQL (Codex + Fable
independently raised that declarative DDL alone is insufficient — the ongoing read/write
path must also be core-mediated). R2 (informed): the gate went **unanimous** — agy
conceded the blast-radius argument (0.90→0.95, explicit position change) and Fable
reframed "consent is UX" → "the capability record is the enforcement anchor"; raw SQL
resolved to **typed-writes + authorizer-sandboxed reads** (writes 4/4; sandboxed raw
reads 3/4, Codex holding typed-only reads). N1 (never-brick = recoverable, not
zero-loss), N2 (transform DSL + backfill jobs), and the file-snapshot reversibility
primitive were unanimous with refinements. The **split-finalize disposition** (§0) is
ADR-024's roadmap-debate correction of this debate's earlier "pause ADR-023." R2
confidences: agy 0.95, Codex 0.86, Fable 0.85, Primary ~0.85. Full trace:
`.local-artifacts/swarm-consensus/runs/20260708T162852Z-plugin-extensibility-ceiling/consensus-report.md`.
