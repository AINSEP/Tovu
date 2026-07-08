# ADR-022: Content Model — Generic Entries + Content-Type Registry, JSON Extension Fields, Expression-Index Query Surface, Append-Only Revisions

- Status: ACCEPTED 2026-07-08 (from a 3-round swarm debate)
- Amended: 2026-07-08 (ADR-024 plugin execution & trust model, from a swarm planning debate) — adds **`pluginId` write-attribution** at the chokepoint and the **expression-language totality/bounded-cost** requirement (see Amendment below)
- Author: Leon Aburime / Coordinator (Opus 4.8 Primary) with peers Codex `gpt-5.5`, Gemini 3.1 (`agy`), Fable
- Extends: **ADR-003** (plugins-never-DDL + namespaced JSON extension) — this ADR *refines its query mechanism*
- Relates: ADR-021 (identity, `(workspace_id,id)` composite FKs), ADR-015 (Drizzle behind ports, SQLite→Postgres), ADR-010/020 (declarative content vs code), ADR-001 (commerce), ADR-008/009 (change-sets, decoupling)

## Context

Today content is one fixed `PostRecord`. Tovu needs a content model that (a) supports post,
page, and arbitrary future types; (b) lets plugins **and** site owners add fields/types;
(c) keeps reads fast and coherent; (d) is **reversible on a live end-user SQLite site** — no
change may require a risky migration or brick the site (the product's top guarantee). A
3-round adversarial swarm debate stress-tested the design and independently re-derived (and
refined) ADR-003's stance; this ADR records the resulting content-model decision.

## Decision

1. **Primitive — generic entries + content-types-as-data registry.** One `entries` table; a
   `content_types` registry where **types are data, not code**. `post`/`page` ship as seeded
   registry rows (core may special-case them in UI/routing, never in storage). Adding or
   changing a type is a registry edit — no code release, no schema migration.

2. **Storage split.** Universal fields as **real typed columns**:
   `id` (ULID), `workspaceId`, `type`, `slug`, `status`, `title`, `bodyJson` (TipTap doc),
   `publishedAt`, `updatedAt`, `version`. Custom/plugin/site-owner fields live in a
   **namespaced JSON column** `fields.ext.{owner}.*`, **validated on write** by the registry
   (implements ADR-003 §2; unregistered keys rejected — a validated bag is not a postmeta swamp).

3. **Query surface — core-provisioned expression indexes (refines ADR-003).** A field declared
   `queryable` gets a **core-provisioned, typed, partial (per-type), composite `(expr, id)`
   expression index** directly on its JSON path:
   `CREATE INDEX q_{type}_{ns}_{field} ON entries(CAST(json_extract(fields,'$.ext.{ns}.{field}') AS {type}), id) WHERE type='{type}'`.
   This **supersedes ADR-003's "generated column + index"** phrasing: the debate + local
   verification showed the generated column is ceremony — the expression index does the work.
   Properties: no schema mutation on `entries` (only `CREATE INDEX`/`DROP INDEX`); **engine-
   maintained → zero drift, no rebuild tooling**; normal single-table filter/sort/keyset
   pagination; uninstall = `DROP INDEX` (row data untouched); ports 1:1 to Postgres `jsonb`
   expression indexes. Budgeted cap of queryable fields per type. Rejected: a generated column
   on the primary table (schema mutation, DB-specific, cap-as-column-bloat) and a separate
   EAV projection/index table (self-joins, compound-sort/keyset pain, application-level
   consistency that needs rebuild tooling — the exact operational complexity deferred below).
   *Verified on the runtime (better-sqlite3, SQLite 3.49.2): the partial/typed/composite
   expression index builds; the planner uses it for a range-filter + compound-sort + keyset
   query; `DROP INDEX` leaves rows intact. (The peers' claim that SQLite rejects STORED
   generated columns via `ALTER TABLE` did **not** reproduce on 3.49.2 — moot, since the
   expression-index mechanism touches no columns.)*

4. **Never-brick foundations — v1 acceptance criteria (the genuinely hard-to-reverse part).**
   a. **Single write chokepoint.** Every mutation (entries, `entry_terms`, and the registry
      itself) goes through one repository layer that records a revision **in the same
      transaction**. No side-door SQL. Enforce with a **CI canary** (assert every row change
      has a same-transaction revision) — the guarantee is only as strong as this discipline.
   b. **Complete revisions.** Each revision captures full post-state (envelope + entire
      `fields` JSON incl. ext bag) + actor + timestamp + per-entry **monotonic sequence**.
      Append-only; remove = tombstone, rename = alias, type-change = new field version.
   c. **Stable identity.** ULIDs + monotonic revision numbers.
   Together the revision log is a coarse-grained event log, so the full event-sourcing /
   log-as-truth replay engine can be adopted **later behind the unchanged public API**.

5. **Taxonomy.** One generic layer: `taxonomies(hierarchical)` + `terms(parentId)` +
   `entry_terms`. Tags flat, categories hierarchical; any type opts in via the registry.
   Relations live in **real tables, not JSON**. Entry-to-entry references via a `ref` field
   type (JSON source of truth) with a derived, rebuildable `entry_refs` index.

6. **Deferred (designed-for, not built in v1).** The full event-sourcing replay engine,
   projection rebuild/compaction tooling, dynamic typed-column-per-field, and cross-type /
   faceted search. All adoptable later behind the stable API because the foundation (§4) is complete.

## Consequences

- **Fixes WordPress's worst structural sins:** unqueryable `postmeta` (→ validated +
  expression-indexed fields), brickable plugin/core updates (→ no plugin DDL + retain-on-
  uninstall + complete history), and content types bolted on as a hack (→ registry-as-data).
- **Never-brick is structural**, but **contingent on the write-chokepoint discipline** (§4a)
  being enforced by the CI canary — otherwise a future data-fix hack silently breaks it.
- **Performance is index-backed for declared fields at self-hosted scale (~≤100k entries),
  but NOT yet benchmarked.** Owed: a 100k-entry WAL benchmark (`CREATE INDEX` build time +
  writer-block duration; p95 latency for a 3-predicate filter + 2-key compound sort + keyset
  page). Queries on *undeclared* fields scan. Do not market "highly performant" as proven.
- **Open — the plugin extensibility ceiling.** Because plugins cannot own tables (ADR-003),
  relational-heavy / commerce-scale plugins (WooCommerce-style faceted catalogs, directories)
  are not first-class in v1. This is a deliberate safety trade, **not yet settled** — the owner
  wants a compromise. The path already seeded in ADR-003 Consequences (core-mediated **tier
  promotion**: plugin-owned tables enter *core's* migration engine under the plugin namespace,
  as a reviewed/consented act — no plugin DDL) needs its own ADR. Tracked in `TODO.md §6`.
  **This ADR inherits ADR-003's ceiling; it does not resolve it.**

## Debate record

3 rounds, strong convergence. Q1 (foundation-now / defer the replay engine) **unanimous** —
reframed as "irreversible things first, not hardest thing first." Q2 (query surface) resolved
to **expression indexes** across the rounds (agy 0.98, Fable 0.8; Codex held a projection table
at 0.86 but on a premise falsified against the actual runtime). Full trace + all peer positions:
`ADS-project-knowledge/.local-artifacts/swarm-consensus/runs/20260708-content-model/`.

## Amendment (2026-07-08 — ADR-024, plugin execution & trust model)

The plugin-roadmap swarm debate added two requirements that land on this ADR:

1. **`pluginId` write-attribution at the chokepoint (§4a).** Every mutation recorded through the
   single write chokepoint stamps the **originating `pluginId`** (or `core`/actor) on the revision,
   in the same transaction. This is near-free to add now and enormously expensive to retrofit; it is
   required by plugin safe-mode quarantine (attribute a failing plugin), never-brick forensics
   ("which plugin wrote/corrupted this?"), the plugin uninstall/data-lifecycle (find a plugin's
   data), and marketplace trust disputes. The revision log thus attributes authorship, not just state.

2. **The expression language must be total and bounded-cost.** The expression language used for
   expression indexes (§3), write-time validation predicates, and any Tier-1 declarative computed
   field **must be side-effect-free, non-Turing-complete, and bounded in evaluation cost** — no
   escape hatches. Rationale (ADR-024 §5): ADR-024's Tier-1 ("declarative plugins are installable
   from anyone *today*, nothing to isolate") is only safe if the declarative surface cannot compute
   arbitrarily; otherwise Tier-1 silently becomes a DoS vector or executable code in disguise. This
   makes the query/validation language a **trust-boundary primitive**, not just a query convenience.

Full trace: `.local-artifacts/swarm-consensus/runs/20260708T195959Z-plugin-system-roadmap/consensus-report.md`.
