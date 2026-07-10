# Settings Architecture — Round 3 Design & Audit Report

**Date:** 2026-07-09 · **Round:** 3 (concrete design + adversarial self-critique) · Companion to the R1–R2 consensus report.
**Swarm:** Primary (Opus 4.8) · Codex `gpt-5.5` xhigh · Gemini 3.1 (`agy`) · Fable subagent.
**Purpose:** design as much of the Settings system as concretely as possible to surface implementation issues before the ADR/spec. It worked — **8 concrete issues surfaced, 2 with independent multi-peer confirmation.**
**Raw designs:** `primary.r3.md`, `codex.r3.md`, `agy.r3.md`, `fable (agent transcript)` in this run dir.

## Converged concrete design (all four agree on the shape)

### Tables (per-site `content.db`)
`setting_definitions` (schemas-as-data registry) · `setting_values` (row-per-key, partial-unique per scope) · `setting_revisions` (append-only ledger). Consolidated DDL, folding the R3 fixes (⚠️ marks a surfaced-issue fix):

```sql
CREATE TABLE setting_definitions (
  setting_id    TEXT NOT NULL,               -- ULID, stable logical identity across versions/renames
  version       INTEGER NOT NULL DEFAULT 1,
  workspace_id  TEXT,                          -- NULL = platform def (core/plugin/theme); non-null = site-owned
  namespace     TEXT NOT NULL,               -- core.* | plugin.{id} | theme.{id} | site.*
  key           TEXT NOT NULL,
  owner_kind    TEXT NOT NULL CHECK(owner_kind IN ('core','plugin','site','theme')),
  owner_id      TEXT,
  schema_json   TEXT NOT NULL CHECK(json_valid(schema_json)),   -- bounded/total language (ADR-022 amendment)
  default_json  TEXT CHECK(default_json IS NULL OR json_valid(default_json)),  -- defaults live here
  scopes        INTEGER NOT NULL CHECK(scopes BETWEEN 1 AND 7), -- bitmask global=1 ws=2 user=4 (Codex)
  secret        INTEGER NOT NULL DEFAULT 0 CHECK(secret IN (0,1)),
  status        TEXT NOT NULL CHECK(status IN ('active','alias','deprecated','tombstone')),
  alias_of_key  TEXT, alias_of_ns TEXT,       -- rename seam; status='alias' ⇒ these set (depth ≤1)
  coercion_json TEXT,                          -- total coercer old_version→version; NULL on v1
  created_at    TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (setting_id, version),
  CHECK ((status='alias') = (alias_of_key IS NOT NULL)),
  CHECK (NOT (status='alias' AND version>1))   -- ⚠️#1 forbid rename+retype in one op (Fable+agy)
);
-- ⚠️#5 cross-workspace uniqueness: platform defs (NULL ws) singleton, site defs per-workspace
CREATE UNIQUE INDEX ux_def_active
  ON setting_definitions(namespace, key, COALESCE(workspace_id,'*')) WHERE status IN ('active','alias');

-- ⚠️#2 user layer split into its OWN table so the composite ADR-021 §4 FK is a REAL declarative FK
--       (a table-wide FK fires on global/workspace rows where scope_id is NOT a principal — the bug
--        Codex + Fable + Primary independently hit). Global/workspace layers carry no principal FK.
CREATE TABLE setting_values_global (
  setting_id TEXT NOT NULL, namespace TEXT NOT NULL, key TEXT NOT NULL,
  value_json TEXT, state TEXT NOT NULL DEFAULT 'set' CHECK(state IN ('set','cleared')),
  def_version INTEGER NOT NULL, seq INTEGER NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  origin_plugin_id TEXT, PRIMARY KEY(setting_id)
);
CREATE TABLE setting_values_workspace (
  setting_id TEXT NOT NULL, workspace_id TEXT NOT NULL, namespace TEXT NOT NULL, key TEXT NOT NULL,
  value_json TEXT, state TEXT NOT NULL DEFAULT 'set' CHECK(state IN ('set','cleared')),
  def_version INTEGER NOT NULL, seq INTEGER NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  origin_plugin_id TEXT, PRIMARY KEY(workspace_id, setting_id),
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE     -- ⚠️#4 tenant cleanup
);
CREATE TABLE setting_values_user (
  setting_id TEXT NOT NULL, workspace_id TEXT NOT NULL, principal_id TEXT NOT NULL,
  namespace TEXT NOT NULL, key TEXT NOT NULL,
  value_json TEXT, state TEXT NOT NULL DEFAULT 'set' CHECK(state IN ('set','cleared')),
  def_version INTEGER NOT NULL, seq INTEGER NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  origin_plugin_id TEXT, PRIMARY KEY(workspace_id, principal_id, setting_id),
  FOREIGN KEY(workspace_id, principal_id) REFERENCES principals(workspace_id, id) ON DELETE CASCADE  -- ADR-021 §4
);
-- (A UNION view `setting_values` reassembles the three for the resolver's namespace-bundle reads.)

CREATE TABLE setting_revisions (           -- append-only; NOT cascade-deleted (immutable ledger)
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_kind TEXT NOT NULL CHECK(entity_kind IN ('definition','value')),
  setting_id TEXT NOT NULL, scope TEXT, workspace_id TEXT, principal_id TEXT,
  op TEXT NOT NULL CHECK(op IN ('register','alias','retype','deprecate','tombstone','set','clear','purge')),
  before_json TEXT, after_json TEXT, def_version INTEGER NOT NULL,
  actor TEXT NOT NULL, origin_plugin_id TEXT, change_set_id TEXT, created_at TEXT NOT NULL
);
CREATE INDEX ix_rev_setting ON setting_revisions(setting_id, seq);
```
**Postgres port:** 1:1 — JSON→`jsonb` (drop `json_valid`), `INTEGER 0/1`→`boolean`, `AUTOINCREMENT`→`bigserial`, partial/`COALESCE` unique indexes native, composite FKs native.

### Write path (one chokepoint, no side door)
`SettingsWriteService.set/clear` only; repo methods package-private. `BEGIN IMMEDIATE` → `authorize()` first (ADR-021, fail-closed, never disclose current value to an unauthorized caller) → resolve def + alias → assert scope∈scopes, not-tombstone, secret-shape → `validateTotal(schema)` → upsert value **+** append revision (same tx) → COMMIT → invalidate exactly one layer cache key. CI canary asserts every value/definition row-change has a same-tx revision.

### Resolver + the 5 invariants (all four converged, near-identical)
`user ?? workspace ?? global ?? default`, highest present non-cleared layer wins; alias resolved before value lookup (depth ≤1); stale `def_version` → total coercion or fall-through (never throw). Invariants: **I1** monotonic precedence · **I2** sparsity/independence (writing key K layer L changes only that) · **I3** totality (never throws/undefined for a live key; worst case = fail-safe default) · **I4** clear≠null (row-present authoritative; JSON-null real iff schema admits) · **I5** version-skew safety (unvalidated value never surfaced) [+ alias transparency]. Kill-test **passes** for all four → keep aliases+coercion (fallback if it ever fails a property test: shed to add+tombstone only).

### Migration ops (data-only, no DDL, all revertible live)
add=insert def · rename=new def + old→`alias` (values keyed by setting_id, untouched) · retype=version+1 + registered total coercer (rejected unless every old version has one; old value rows coerce on read) · remove=tombstone (values retained) · plugin-uninstall=deprecate/tombstone owned defs, retain values · **factory-reset(ns)**=clear value rows → resolver falls to registry defaults ⇒ **provably bootable** (defaults validated at registration, security defaults fail-safe). No `ALTER/CREATE/DROP`.

### Plugin flow + the gate
Manifest `settings[]` → sync forces `namespace=plugin.{pluginId}` → register through chokepoint. UI path A = core auto-renders form from schema (**zero plugin JS, ships now**); path B = ADR-025 sandboxed panel → postMessage RPC → gateway `authorize(human) ∩ capability(plugin)` → ADR-026 envelope. **ADR-024 §6 gate:** plugin path (capability check + panels + plugin-owned defs) **BLOCKED until capability-taxonomy-v1**. **Core-only subset ships now:** tables + resolver + write path + `settings.*` human perms + core/site/theme definitions (retire `PresentationSettingsRepoPort`).

### Cache (layers only) + API
Keys `settings:{global|ws:{wsId}|user:{wsId}:{pid}}:{ns}` hold per-layer maps; `getEffective` merges ≤3 in memory. A **global write invalidates one key — no tenant fan-out** (all four converged). Definition change bumps a per-namespace epoch folded into the key (lazy, no eager fan-out). Public render merges global+workspace only. API: `registerDefinitions / getEffective / set / clear` over `SettingsRepoPort` (in-mem + SQLite; **no** `SettingsPort` service abstraction).

## 🔴 Surfaced-issues register (the payload of the round)
| # | Issue | Found by | Severity | Resolution |
|---|---|---|---|---|
| 1 | **rename+retype in one op** → alias+coercion skew, rollback data-loss | **Fable + agy** (indep.) | **must-fix** | Forbid; two sequential migrations; canary rejects `alias ∧ version>1` (folded into DDL CHECK) |
| 2 | **Composite user-FK can't be table-wide** — fires on global/workspace rows where scope_id isn't a principal → silently drops ADR-021 §4 isolation | **Codex + Fable + Primary** (indep.) | **must-fix** | **Split value tables per scope** (global/workspace/user), each with the correct real FK (folded into DDL) |
| 3 | **Secret round-trip destroys the secret** — read returns `••••`, block-PUT writes literal `••••` over the key | agy | must-fix | Per-key PATCH not block-PUT; reject the redaction sentinel + non-`secretRef` shape on write |
| 4 | **Workspace-delete orphans the immutable revision ledger** (values cascade, revisions can't) → GDPR/purge | agy | must-fix (governance) | Explicit tenant-purge policy for `setting_revisions`; sequence with the compliance/backup ADR |
| 5 | **Cross-workspace unique-index collision** for site-owned defs | Primary + Fable + agy | resolved | `UNIQUE(ns,key,COALESCE(workspace_id,'*'))` (folded) |
| 6 | **DB-stored defaults vs n-1 code** on rolling Postgres deploy → stale pod serves new default | agy | future | Moot for local-first SQLite; flag for hosted-Postgres topology (ties ADR-021 topology note) |
| 7 | **Definition registry is a *second* ADR-007-bound cache** (site-owned defs are per-workspace) | Primary | resolved | Definition cache key must carry `workspaceId` |
| 8 | **Non-identity coercion silently mis-maps** (enum rename → wrong value, no error); **lazy coercion-on-read causes writes during reads** | Fable + Codex | must-fix | Non-identity retype emits operator-visible "N values coerced, review" notice; coercion-repair is a **background maintenance command**, never on the read path |

## Updated punch-list (supersedes the R1–R2 list)
1. **Referential integrity, plugin-settings↔content entries** — **STILL-OPEN** (all four agree). Direction: a `ref`-typed setting stores an entry id as an **opaque scalar, no FK/cascade**, validated-on-use (falls to default if target gone) — model on ADR-022's rebuildable ref-index, not a hard FK. Owed: spec it.
2. **Capability-taxonomy sequencing** — **RESOLVED as a gate** (core ships now; plugin settings blocked on capability-taxonomy-v1).
3. **Secret-store dependency** — **STILL-OPEN**: `secretRef` contract frozen now, `secret:true` registrations rejected until the Integrations/secret-store ADR.
4. **Validation-language totality** — **RESOLVED-IF** the ADR-022 bounded language covers settings schemas *and* the coercers are in that same total language (stated).
5. **Resolver kill-test** — **RESOLVED-in-design** (I1–I5 stated 4×); owed the day-scale property-test spike.
6. **CI-canary extension** — **STILL-OPEN**: owed a migration canary that boots an old DB, registers, writes/clears each scope, resolves defaults, tombstones, resets, and verifies append-only revisions + alias-depth≤1.
7. **NEW → tenant-purge policy** for the immutable revision ledger (issue #4).
8. **NEW → secret write-shape guard** (issue #3).

## ADR-readiness call
The design is now **buildable and internally validated** — DDL, write path, resolver+invariants, migration ops, plugin flow, cache, and API all converged 4×, and the concreteness burned down most of the risk. **Remaining before the ADR:** fold the 4 must-fix issues (1–4) into the design (1, 2, 5 already folded into the DDL above) and answer the 3 STILL-OPEN punch-list items (RI-as-opaque-ref, secret-store dependency, CI-canary). Recommended: a short `/audit-work` pass on THIS design (not the position doc), then write the Settings ADR. **Core-only subset is greenlit to spec independently of the plugin/secret gates.**
