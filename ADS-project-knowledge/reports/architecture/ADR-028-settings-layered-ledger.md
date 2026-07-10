# ADR-028: Settings — Layered Settings Ledger (Schemas-as-Data Registry + Per-Scope Value Tables + Append-Only Revisions)

- Status: PROPOSED 2026-07-09 (3-round settings swarm debate → round-1 external audit `TM-settings-001` FAIL (agy 4 / Codex 8.1 / Fable 8.2; 4 blockers) → all blockers+highs+lows folded here as normative text → round-2 diff-only re-audit PENDING)
- Author: Leon Aburime / Coordinator (Opus 4.8 Primary) with peers Codex `gpt-5.5` (xhigh), Gemini 3.1 Pro (`agy`), Fable
- Extends: **ADR-022** (settings reuse the content model's single write chokepoint + append-only revision discipline + bounded/total validation language, but on their OWN tables — NOT the `entries` table), **ADR-021** (`authorize()` fail-closed, flat permission strings + code-side catalog, composite `(workspace_id,id)` FKs, disable-only principals)
- Relates: ADR-007 (`workspaceId` in every value row, cache key, AND the definition cache), ADR-003/023/024 (plugin-owned settings gated on capability-taxonomy-v1; core-only subset ships now), ADR-020 (theme presets become `theme.{id}` settings), ADR-025 (plugin/theme settings *panels* run origin-isolated), ADR-015 (Drizzle behind the repo port; SQLite now, Postgres next), ADR-009 (cache invalidation is one layer key, no fan-out)
- Sources: debate `reports/swarm-consensus/runs/20260709-settings-architecture-consensus-report.md` (R1–R2 positions) + `reports/swarm-consensus/runs/20260709-settings-r3-design-report.md` (R3 concrete design — the audited artifact); audit packet `.local-artifacts/external-audit/packets/20260709T041512Z-settings-design-audit-packet.md` (`TM-settings-001`); raw outputs `.local-artifacts/external-audit/runs/20260709-settings/`; fold plan `.local-artifacts/handoff/20260710T042154Z-handoff.md`

## Context

Tovu needs a Settings admin section — a place to configure core behavior, per-workspace
overrides, per-user preferences, and (later) plugin/theme configuration. The first architectural
question was **where settings live**. A 3-round swarm debate (4/4 consensus) **rejected
settings-as-entries** (Option A) on the authority-surface argument: the `content.write`
permission reaches *agents*, so folding settings into `entries` would let a delegated content
agent flip security-relevant configuration through the content write path. Instead settings get a
**dedicated "Layered Settings Ledger"**: their own tables that **reuse ADR-022's chokepoint /
append-only-revision / bounded-validation discipline** without inheriting the `entries` authority
surface.

A round-1 external audit (`TM-settings-001`, risk_tier=high, score_floor=8.5) **endorsed the
architecture** but returned **FAIL** — all three auditors landed below the floor (agy 4, Codex
8.1, Fable 8.2) and surfaced 4 validated blockers plus a set of highs/mediums/lows. **None
required an architectural change**; every finding had a drafted fix. This ADR is the converged
design **with all audited fixes folded in as normative text**. It stays inside accepted ADRs; it
does not reopen the settings-vs-entries decision (4/4 consensus, do not relitigate).

## Decision

### 1. Placement, scope, and the core-only gate

Settings are a **core capability** with three tables in the per-site `content.db`:
`setting_definitions` (schemas-as-data registry) + three per-scope value tables
(`setting_values_global` / `_workspace` / `_user`) + `setting_revisions` (append-only ledger).
Resolution is a strict layer precedence `user ?? workspace ?? global ?? default`.

**What ships now (core-only subset — greenlit independently):** the tables, the resolver, the
single write chokepoint, the full `settings.*` human permission catalog (§7), and **core / site /
theme** definitions. `PresentationSettingsRepoPort` retires into `core.presentation.activeThemeId`;
theme presets become `theme.{themeId}` settings.

**What is gated:** the **plugin** path — plugin-owned definitions, capability-checked writes, and
ADR-025 sandboxed panels — is **BLOCKED until capability-taxonomy-v1** (ADR-024 §6). The `secret`
path is **BLOCKED until the Integrations / secret-store ADR** (§6). Both gates are enforced at
registration, not by convention.

### 2. Data model — corrected DDL (all four blockers + F-series folded)

```sql
CREATE TABLE setting_definitions (
  setting_id    TEXT NOT NULL,               -- ULID, stable logical identity across versions/renames
  version       INTEGER NOT NULL DEFAULT 1,
  workspace_id  TEXT,                          -- NULL = platform def (core/plugin/theme); non-null = site-owned
  namespace     TEXT NOT NULL,               -- core.* | plugin.{id} | theme.{id} | site.*
  key           TEXT NOT NULL,
  owner_kind    TEXT NOT NULL CHECK(owner_kind IN ('core','plugin','site','theme')),
  owner_id      TEXT,
  schema_json   TEXT NOT NULL CHECK(json_valid(schema_json)),          -- ADR-022 bounded/total language
  default_json  TEXT CHECK(default_json IS NULL OR json_valid(default_json)),
  scopes        INTEGER NOT NULL CHECK(scopes BETWEEN 1 AND 7),        -- bitmask global=1 ws=2 user=4
  secret        INTEGER NOT NULL DEFAULT 0 CHECK(secret IN (0,1)),
  status        TEXT NOT NULL CHECK(status IN ('active','alias','deprecated','tombstone')),
  alias_of_key  TEXT, alias_of_ns TEXT,       -- rename seam; status='alias' ⇒ these set (depth ≤1)
  coercion_json TEXT,                          -- total coercer old_version→version; NULL on v1
  created_at    TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (setting_id, version),
  CHECK ((status='alias') = (alias_of_key IS NOT NULL)),
  -- ✔B3/F1: constrains ALIAS MARKER ROWS ONLY (they are always fresh-ULID version=1),
  --         so it never blocks renaming an already-retyped (version>1) setting.
  CHECK (NOT (status='alias' AND version>1)),
  -- ✔B2: a site-owned def (workspace_id NOT NULL) may NOT declare the global scope bit.
  CHECK (workspace_id IS NULL OR (scopes & 1) = 0),
  -- ✔F3(c): owner_kind fences the namespace + platform/site placement (shadowing made impossible).
  CHECK (
    (owner_kind='core'   AND namespace LIKE 'core.%'   AND workspace_id IS NULL) OR
    (owner_kind='plugin' AND namespace LIKE 'plugin.%' AND workspace_id IS NULL) OR
    (owner_kind='theme'  AND namespace LIKE 'theme.%'  AND workspace_id IS NULL) OR
    (owner_kind='site'   AND namespace LIKE 'site.%'   AND workspace_id IS NOT NULL)
  )
);
-- ✔B2/F6/#6: one active-or-alias per (ns,key) per tenant-partition. Platform defs (NULL ws)
--            are singletons; site defs partition per workspace. Sentinel '*' is reserved/forbidden
--            as a real workspace id (asserted at startup) so it can never collide with a tenant.
CREATE UNIQUE INDEX ux_def_active
  ON setting_definitions(namespace, key, COALESCE(workspace_id,'*')) WHERE status IN ('active','alias');

-- ✔B1: NO namespace/key columns on value tables. setting_id is the ONLY authoritative value key
--      after definition resolution. Rename touches ns/key on the DEFINITION only; values stay put.
CREATE TABLE setting_values_global (
  setting_id TEXT NOT NULL,
  value_json TEXT, state TEXT NOT NULL DEFAULT 'set' CHECK(state IN ('set','cleared')),
  def_version INTEGER NOT NULL, seq INTEGER NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  origin_plugin_id TEXT, PRIMARY KEY(setting_id)
);
CREATE TABLE setting_values_workspace (
  setting_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
  value_json TEXT, state TEXT NOT NULL DEFAULT 'set' CHECK(state IN ('set','cleared')),
  def_version INTEGER NOT NULL, seq INTEGER NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  origin_plugin_id TEXT, PRIMARY KEY(workspace_id, setting_id),
  -- ✔B4: RESTRICT, not CASCADE — tenant teardown MUST go through the ledgered purge service (§5).
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT
);
CREATE TABLE setting_values_user (
  setting_id TEXT NOT NULL, workspace_id TEXT NOT NULL, principal_id TEXT NOT NULL,
  value_json TEXT, state TEXT NOT NULL DEFAULT 'set' CHECK(state IN ('set','cleared')),
  def_version INTEGER NOT NULL, seq INTEGER NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  origin_plugin_id TEXT, PRIMARY KEY(workspace_id, principal_id, setting_id),
  -- ✔B4 + ADR-021 §4 composite isolation; RESTRICT (principals are disable-only anyway, ADR-021 §5).
  FOREIGN KEY(workspace_id, principal_id) REFERENCES principals(workspace_id, id) ON DELETE RESTRICT
);
-- Resolver reads a namespace bundle via a UNION view that JOINs the current definition for ns/key
-- (values carry NO ns/key of their own — ✔B1). Global rows project workspace_id = NULL; any consumer
-- filtering the bundle MUST read `workspace_id = ? OR workspace_id IS NULL` (✔F6) or read per-layer.
CREATE VIEW setting_values AS
  SELECT d.namespace, d.key, g.setting_id, NULL AS workspace_id, NULL AS principal_id,
         'global' AS scope, g.value_json, g.state, g.def_version, g.seq, g.updated_by, g.updated_at, g.origin_plugin_id
    FROM setting_values_global g JOIN setting_definitions d ON d.setting_id = g.setting_id AND d.status='active'
  UNION ALL
  SELECT d.namespace, d.key, w.setting_id, w.workspace_id, NULL,
         'workspace', w.value_json, w.state, w.def_version, w.seq, w.updated_by, w.updated_at, w.origin_plugin_id
    FROM setting_values_workspace w JOIN setting_definitions d ON d.setting_id = w.setting_id AND d.status='active'
  UNION ALL
  SELECT d.namespace, d.key, u.setting_id, u.workspace_id, u.principal_id,
         'user', u.value_json, u.state, u.def_version, u.seq, u.updated_by, u.updated_at, u.origin_plugin_id
    FROM setting_values_user u JOIN setting_definitions d ON d.setting_id = u.setting_id AND d.status='active';

CREATE TABLE setting_revisions (           -- append-only; NEVER cascade-deleted (immutable ledger)
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_kind TEXT NOT NULL CHECK(entity_kind IN ('definition','value')),
  setting_id TEXT NOT NULL, scope TEXT, workspace_id TEXT, principal_id TEXT,
  -- ✔F5: 'coerce' added for the background repair op (read-path coercion is pure, never ledgered).
  op TEXT NOT NULL CHECK(op IN ('register','alias','retype','deprecate','tombstone','set','clear','purge','coerce')),
  before_json TEXT, after_json TEXT, def_version INTEGER NOT NULL,
  actor TEXT NOT NULL, origin_plugin_id TEXT, change_set_id TEXT, created_at TEXT NOT NULL
);
CREATE INDEX ix_rev_setting ON setting_revisions(setting_id, seq);
```

**Postgres port:** 1:1 — JSON→`jsonb` (drop `json_valid`), `INTEGER 0/1`→`boolean`,
`AUTOINCREMENT`→`bigserial`, partial/`COALESCE` unique indexes native, composite FKs native, view
identical, `ON DELETE RESTRICT` native.

### 3. Rename / alias / retype — the authoritative marker-row mechanism (✔B1+B3, from Fable F1)

The round-1 design's rename text was ambiguous against `PRIMARY KEY(setting_id, version)`. This
ADR pins Fable's coherent mechanism; **rename is a same-tx pair**:

1. **UPDATE the active definition row's `(namespace,key)`** to the new name — **same `setting_id`,
   same `version`** — ledgered `entity_kind='definition' op='alias'`. Because the identity
   (`setting_id`) never moves, **value rows stay attached** (they key on `setting_id` only — §2/B1).
2. **INSERT an alias marker row** at the OLD name with a **fresh ULID, `version=1`,
   `status='alias'`, `alias_of_ns/key = new name`**.

The `CHECK (NOT (status='alias' AND version>1))` therefore constrains **only marker rows** (always
v1) → it **never blocks renaming a previously-retyped (`version>1`) setting** (the B3 brick). The
resolver resolves the marker → new name → active def (depth ≤1) **before** value lookup; a read by
the old key is alias-transparent.

Normative registry state-machine rules (enforced at the chokepoint, not just the CI canary):
- **No rename+retype in one op:** the orchestrator asserts `new_def.schema_json == old_def.schema_json`
  on a rename (schema change is a separate `retype` op).
- **Sequential rename** (A→B then B→C): retarget **all prior markers to the newest active key in
  the same tx**; **reject alias-to-alias** — a marker's `alias_of` MUST point to an `active` def,
  preserving depth ≤1 (✔F6).
- **Retype** (`version+1` insert as `active`): **flip the prior active version to `deprecated` in
  the same tx** (else it collides with `ux_def_active`) (✔F6); rejected unless every prior version
  carries a total coercer.

### 4. Write path — one chokepoint, no side door

`SettingsWriteService.set/clear` is the ONLY value-mutation path; repo methods are
package-private. `BEGIN IMMEDIATE` → `authorize()` **first** (ADR-021, fail-closed, never disclose
the current value to an unauthorized caller) → resolve def + alias → assert `scope ∈ scopes`,
def not tombstoned, value passes `validateTotal(schema)`, secret-shape guard (§6) → upsert the
value row **and** append a `setting_revisions` row **in the same tx** → COMMIT → invalidate exactly
one layer cache key (§8). **Every** definition-lifecycle op (register/alias/retype/deprecate/
tombstone), every value op (set/clear), the tenant **purge** (§5), and the background **coerce**
repair (§6) route through this chokepoint and emit a same-tx revision. The CI canary (extending
ADR-022 §4a) asserts no row-change in any of the four tables exists without a matching same-tx
revision, and that no module outside the write service mutates the value/definition tables.

### 5. Deletion, tenant teardown, and GDPR (✔B4 — never-brick / chokepoint integrity)

The value-table FKs are **`ON DELETE RESTRICT`**, not `CASCADE` — a raw workspace/principal delete
**cannot** silently drop value rows without a ledgered revision (the I-B chokepoint-integrity
violation the audit caught). Cleanup is an **explicit purge service**: `authorize()` once →
enumerate every affected `setting_values_*` row → append a redacted `op='purge'` revision per row →
delete/tombstone the rows — **all in one transaction**. The immutable `setting_revisions` ledger is
**never** cascade-deleted; GDPR erasure redacts `before/after_json` in the purge revision while
preserving the append-only seq chain. This is also the resolution of the round-1 orphan-revision /
GDPR punch-list item. (Principals are disable-only per ADR-021 §5, so the user-scope purge is a
deliberate compliance operation, never an implicit side effect.)

### 6. Secrets and value totality (✔#5, F4, F5, F7)

- **Secret gate is NORMATIVE:** until the secret-store ADR lands, **`registerDefinitions` rejects
  any `secret:true` definition.** If the secret path is ever enabled: writes are **per-key PATCH
  only** (never block-PUT); the write-shape guard **rejects** the redaction sentinel (`••••`),
  plaintext, and any `value_json` that is not a valid `secretRef`; revisions, exports, and the cache
  store **only** the `secretRef` or redacted metadata — never plaintext. For a `secret:true` def,
  `default_json` MUST be `NULL` or `secretRef`-shaped, enforced at `registerDefinitions`, and
  definition revisions inherit that guarantee (✔F7).
- **Totality (I-D):** for every **non-secret** def, `registerDefinitions` **rejects a NULL
  `default_json`** for each declared scope — a live key always has a validated fail-safe default, so
  `getEffective` never throws or returns undefined. A genuinely-optional setting declares an
  explicit typed default the schema admits (which may be JSON `null` iff the schema is nullable — I4:
  clear ≠ null). Factory-reset is therefore **provably bootable** (✔F4).
- **Coercion (✔F5):** read-path coercion of a stale `def_version` value is **pure / in-memory with
  NO write-back**. The optional background **repair** that rewrites coerced rows routes through the
  chokepoint with a same-tx `op='coerce'` revision per row under one `change_set_id`, and is a
  CI-canary scenario. A **non-identity** retype (e.g. enum rename) emits an operator-visible
  "N values coerced, review" notice — coercion is never silent.

### 7. Permissions — the full `settings.*` catalog (✔F3)

ADR-021 flat strings, code-side catalog. The round-1 set covered only value writes; this ADR
enumerates the **definition-lifecycle** and **read** surfaces the audit found missing (the
authority hole one layer down):

- **Value writes (per scope):** `settings.global.write`, `settings.workspace.write`,
  `settings.user.self.write` (own layer). Writing **another** principal's user layer requires
  `settings.user.write` (operator/admin).
- **Definition lifecycle:** `settings.definitions.manage` — governs `registerDefinitions`, rename/
  alias, **retype** (ships a coercer), deprecate, and **tombstone** (kills a core key). High
  privilege, human-only, never delegated to a content agent.
- **Reset:** `settings.reset.global` / `settings.reset.workspace` / `settings.reset.user` — a mass
  clear is its own permission, separate from single-key writes.
- **Reads:** `settings.read` (effective resolver read) · `settings.read.raw` (per-layer raw values —
  seeing that a workspace overrides global) · `settings.read.revisions` (the ledger) ·
  `settings.read.definitions` (the registry).

**Namespace fencing + no shadowing (✔F3(b),(c)):** `registerDefinitions` fences registrations by
`owner_kind` (§2 CHECK) — plugin sync forces `plugin.{id}`, theme sync forces `theme.{id}`, and
**site-owned registrations are fenced to `site.*` only** (mirroring the plugin fence). A site/
workspace actor therefore **cannot** register into `core.*`/`plugin.*`/`theme.*` to shadow a
platform def's schema, secret flag, or default. Because owner namespaces are disjoint, **def-
resolution precedence is moot by construction** (there is never a site def and a platform def at the
same `(ns,key)`).

### 8. Cache, definition cache, and API (✔#6/#7)

Layer cache keys `settings:{global | ws:{wsId} | user:{wsId}:{pid}}:{ns}` hold per-layer maps;
`getEffective` merges ≤3 in memory. A global write invalidates **one key — no tenant fan-out**; a
definition change bumps a per-namespace epoch folded into the key (lazy). **The definition cache is
itself workspace-qualified** — site-owned defs are per-workspace data, so ADR-007 applies to the
def cache, not just the value cache (✔#7). **SQLite enforcement (✔#6):** `PRAGMA foreign_keys=ON`
per connection with a **startup assertion**; the `'*'` sentinel in `ux_def_active` is reserved/
forbidden as a real workspace id (startup-asserted). API surface: `registerDefinitions /
getEffective / set / clear` over `SettingsRepoPort` (in-memory + SQLite adapters — rule-of-two); no
separate `SettingsPort` service abstraction (one evaluator, ADR-021 precedent).

## Consequences

- **The authority surface is closed at both layers.** Settings never touch `entries`, so
  `content.write` (reachable by agents) can't flip configuration; and the new `settings.*` catalog
  now governs definition lifecycle + reads, closing the one-layer-down hole F3 caught.
- **Never-brick holds.** The only irreversible-ish operations — rename, retype, tombstone, tenant
  purge — all go through the chokepoint with same-tx revisions; RESTRICT FKs make an unledgered
  cascade impossible; factory-reset is provably bootable because every non-secret key has a
  validated default.
- **Rename can't corrupt or brick.** Values key on stable `setting_id` (never on ns/key), so a
  renamed setting's values stay attached; the marker-row mechanism keeps the alias CHECK from ever
  bricking an already-retyped setting.
- **No cross-tenant leak.** Site-owned defs are structurally barred from the global scope and from
  platform namespaces (two independent CHECKs), so a tenant can neither land a value in the shared
  global table nor shadow a platform def.
- **Reuse, not duplication:** chokepoint, append-only revisions, bounded validation, ULIDs, and the
  CI canary all come from ADR-022 — settings adopt the discipline on their own tables.
- **DX cost, accepted:** every settings mutation flows through one write service and one revision;
  there is no fast path, no raw repo write, no cascade shortcut.

## Open (carried gates + owed items)

- **Plugin settings** — blocked on **capability-taxonomy-v1** (ADR-024 §6); core-only subset ships
  now. When it lands: plugin-owned defs, `capability(plugin)` write checks, and ADR-025 sandboxed
  panels turn on.
- **Secret path** — blocked on the **Integrations / secret-store ADR** (the next admin section);
  the `secretRef` write-shape + default-shape contract is frozen here (§6) so enabling it later is
  additive.
- **RI: plugin-setting → content entry** — a `ref`-typed setting stores an entry id as an **opaque
  scalar, no FK/cascade**, validated-on-use (falls to default if the target is gone), modeled on the
  ADR-022 rebuildable ref-index. Owed: spec it.
- **CI-canary extension** — a migration canary that boots an old DB → registers → writes/clears each
  scope → resolves defaults → renames → retypes → tombstones → factory-resets → verifies append-only
  revisions + alias-depth ≤1. Owed with the core-only spec.
- **Resolver property-test spike** — the day-scale test asserting I1–I5 + alias-transparency (set →
  rename → resolve by old AND new key across all scopes = same effective value).

## Debate + Audit record

Design converged in a 3-round swarm debate (Primary/Codex/agy/Fable) — Option A (settings-as-
entries) killed on the authority-surface argument; R3 produced the concrete DDL/resolver/migration/
cache design that went to audit. Round-1 external audit (`TM-settings-001`, risk=high, floor 8.5)
returned **FAIL**: **agy 4** (3 blockers: rename ns/key corruption, cross-tenant global-scope leak,
alias-CHECK bricks rename-after-retype), **Codex 8.1** (1 blocker: CASCADE bypasses the chokepoint;
+ normative secret gate + SQLite enforcement), **Fable 8.2** (0 blockers but the authoritative
marker-row rename mechanism (F1) + a new must-fix F3: the permission set lacked definition-lifecycle
perms). All findings had drafted fixes; **none needed an architectural change**. This ADR folds them
all: B1 (drop ns/key from value tables), B2 (site-def global-scope CHECK), B3 (marker-row rename +
corrected CHECK reading, F1), B4 (RESTRICT + ledgered purge service), plus highs #5 (normative
secret gate) / F3 (full permission catalog + namespace fencing) and mediums/lows #6, F4–F7. A
**round-2 diff-only re-audit** (same `TM-settings-001`, Prior-Round Disposition Ledger, auditors
Codex `gpt-5.5` xhigh + agy Gemini 3.1 Pro + a fresh Fable internal verifier) is **pending**; on a
PASS (no unresolved blocker AND all scores ≥8.5) this ADR moves to ACCEPTED. Full trace in the
linked debate + audit reports and `.local-artifacts/handoff/20260710T042154Z-handoff.md`.
