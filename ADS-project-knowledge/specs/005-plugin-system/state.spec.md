# State Contract Spec: Plugin System — Artifact, Loader, One Hook, `ext.*` Fields (v1)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-005`
- Feature: `FEAT-005-plugin-system`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T04:10:00Z`

## Purpose
Defines the durable state this feature owns: the plugin **artifact/manifest format** (the ecosystem compatibility surface), the `ext` extension column on content records (ADR-003), the `plugin_activations` table (enabled state behind the gateway), the in-memory discovery record, and the schema-registry field declaration. The `@tovu/sdk` author-facing surface is included here because it is durable public API (ADR-005), even though it is a package export, not a DB row.

## 1) State Shape (durable)

| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `posts.ext` (column) | JSON text | no | `{}` | Namespaced plugin fields: `{ "{pluginId}": { …declared fields } }` (ADR-003) |
| `plugin_activations` (table) | `array<PluginActivationRecord>` | no | `[]` (seed enables nothing) | One row per workspace+plugin that has been enabled/disabled; enabled state + active version |
| `change_sets` / `change_set_items` | per SPEC-001 | no | `[]` | Enable/disable add rows with `operation "update"` (revertible) |
| install dir `plugins/<id>/<version>/` | filesystem | — | empty | Unpacked artifacts (SPEC-003 `plugins/` dir); on-disk, not runtime-mutable state |

## 2) Entity Contracts

```yaml
PluginManifest:                      # tovu.plugin.json — the ecosystem compatibility surface (ADR-004)
  id: string                         # ^[a-z0-9-]+$, 1..50, equals install folder name (EC-01)
  name: string
  version: string (semver)
  sdkRange: string                   # @tovu/sdk semver range; refuse activation outside it (REQ-03)
  engine: integer                    # plugin-contract version (1 in v1); unknown-key/forward-compat gate
  capabilities: array<string>        # subset of the v1 vocabulary: content.read | content.extend | hooks.attach (REQ-04)
  hooks: array<string>               # declared points consumed; v1 valid set = ["content.entry.beforeSave"] (REQ-05)
  fields:                            # ext field declarations (REQ-06)
    type: array
    items:
      path: string                   # must match ^ext\.{id}\.[a-z0-9_]+$
      type: enum[string, integer, number, boolean]
      queryable: false               # MUST be false in v1 (EC-04)
  integrity:                         # subresource-integrity style, REQUIRED day one (ADR-004 rule 6)
    type: object                     # { "server/index.mjs": "sha256-…", … } per packaged file
  # Parsed-and-stored, UNUSED in v1 (forward-compat, no behavior):
  adminSurfaces: array|null          # OQ-07
  contentTypes: array|null           # net-new types — OQ (not this slice)
  provenance: object|null            # sourceUrl + optional ed25519 signature — OQ-05
  dependencies: object|null          # other plugin ids + ranges — OQ-08

PluginActivationRecord:              # plugin_activations table (durable, behind the gateway)
  pluginId: string                   # part of composite key
  workspaceId: string                # structural scoping (ADR-007)
  version: string                    # the active (enabled) installed version — the "active pointer" (ADR-004)
  enabled: boolean
  updatedAt: string (date-time)      # from ClockPort

PluginDiscoveryRecord:               # in-memory, rebuilt each discovery (NOT persisted) — feeds PLUGINS_LIST
  id: string
  name: string
  version: string
  source: enum[built-in, site]
  status: enum[valid, invalid, incompatible]
  enabled: boolean                   # projected from plugin_activations
  errors: array<{ code, file: string|null, message }>

ExtColumnValue:                      # posts.ext shape (ADR-003)
  type: object
  additionalProperties:              # keyed by pluginId
    type: object                     # e.g. { "word-count": { "count": 5 } }

SdkSurface:                          # @tovu/sdk public exports (ADR-005) — the plugin author contract
  definePlugin: "(def: PluginDefinition) => Plugin"
  ContentEntryDraft: type            # the entry shape a beforeSave filter receives/returns
  HookContext: type
  HOOK_CONTENT_ENTRY_BEFORE_SAVE: "content.entry.beforeSave"   # name constant + typed signature
  capabilities: { CONTENT_READ, CONTENT_EXTEND, HOOKS_ATTACH } # the three tokens (REQ-04)
```

## 3) Action Catalog (state-changing operations)

| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `SET_PLUGIN_ENABLED` (new) | workspaceId, pluginId, enabled | plugin discovered AND (when enabling) `status "valid"` | upsert `PluginActivationRecord` + 1 applied change set (via gateway); loader loads/unloads the module | unknown id ⇒ `PLUGIN_NOT_FOUND` 404; invalid ⇒ `PLUGIN_INVALID` 422; incompatible ⇒ `PLUGIN_INCOMPATIBLE` 422; each ⇒ no row change, no change set |
| `WRITE_EXT_FIELD` (new, internal) | entryId, pluginId, field, value | plugin enabled AND field declared AND value matches declared type | writes `posts.ext.{pluginId}.{field}` inside the entry save (same tx as SPEC-002 update) | type mismatch ⇒ validation error; capability breach ⇒ `CAPABILITY_DENIED` ⇒ save fails `PLUGIN_HOOK_FAILED`, entry unchanged (EC-06/EC-10) |
| `ENTRY_CREATE`/`UPDATE` (extended) | per SPEC-002 | as SPEC-002 | as SPEC-002 + enabled `beforeSave` filters run, possibly writing `ext` | throwing filter ⇒ fail-closed, no entry change, no change set (EC-10) |

## 4) Status Lifecycle

### Plugin (per workspace)
```
(discovered) ──valid──▶ disabled ──enable (gateway)──▶ enabled ──disable/revert──▶ disabled
     │                                                     │ (module loaded, hooks attached)
     ├─invalid──▶ (listed, cannot enable — fix required)
     └─incompatible──▶ (listed, cannot enable — sdkRange)
ext.{pluginId} data: written only while enabled; retained inert across disable (INV-03)
```
Illegal states (rejected): enabling an `invalid`/`incompatible` plugin; loading a plugin that fails integrity; a `plugin_activations` row for an undiscovered plugin id (dangling ⇒ treated as disabled at boot, logged).

## 5) Selector Contracts (reads)

| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `discoverPlugins` | install dir (opt) | `PluginDiscoveryRecord[]` | built-ins only in legacy mode (EC-09) |
| `listPlugins` | `{ workspaceId }` | `PluginDiscoveryRecord[]` with `enabled` projected | empty beyond built-ins |
| `getActivation` | `{ workspaceId, pluginId }` | `PluginActivationRecord` or null | null ⇒ never enabled (treated as disabled) |
| `readExt` | `PostRecord` | `ExtColumnValue` | `{}` when no plugin wrote |
| `listHookPoints` | — | declared hook points + signatures | v1: exactly `content.entry.beforeSave` (`tovu hooks list`, AC-15) |

## 6) Invariants (state-level)

- `posts.ext` must always parse as a JSON object keyed by pluginId; values match the owning plugin's declared field types.
- A plugin field path must always be namespaced to that plugin's own id (`ext.{selfId}.*`); cross-namespace writes are rejected (`FIELD_PATH_INVALID`).
- `plugin_activations.version` must reference an installed version; enabled state is authoritative over the on-disk `active` pointer (the pointer is derived from the row).
- No plugin action ever alters table structure — the only schema changes are core migrations that add `ext` and `plugin_activations` (INV-01, ADR-003).
- Every enable/disable row transition has exactly one corresponding applied change set (INV-05); seeded state enables nothing.
- Disabling/removing a plugin never deletes `ext.{pluginId}` data (INV-03).

## 7) Persistence Notes

### Drizzle schema migration (additive, adopted 2026-07-06 — ADR-015)
Two additive changes, made by editing `src/infra/db/schema.ts` then `drizzle-kit generate` (never hand-written SQL):

```ts
// posts: add the namespaced extension column (ADR-003)
export const posts = sqliteTable("posts", {
  // …existing columns (incl. kind from SPEC-002)…
  ext: text("ext", { mode: "json" }).notNull().default("{}"),   // NEW — ext.{pluginId}.{field}
});

// NEW table: enabled state behind the gateway (mirrors presentation_settings)
export const pluginActivations = sqliteTable(
  "plugin_activations",
  {
    pluginId: text("plugin_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    version: text("version").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.pluginId] })]
);
```

- `drizzle-kit generate` emits the additive migration under `drizzle/`; applied by Drizzle `migrate()` (idempotent via `__drizzle_migrations`). Each generate increments `runtimeSchemaVersion` (SPEC-003 §7).
- The memory adapter mirrors both: an `ext` map on records and an in-memory activations map.

### Postgres forward-compatibility (ADR-003 / ADR-015)
- `posts.ext` → `jsonb`; the future queryable-field path (OQ-04) uses expression indexes on `jsonb` — the JSON layout must map 1:1 (adapter contract tests).
- `plugin_activations` maps directly; no `ext`-specific DDL is ever plugin-driven.

### `@tovu/sdk` package
- New workspace package `packages/sdk` (or `@tovu/sdk`); `package.json` `exports` blocks deep imports into `@tovu/core` (ADR-005 rule 1). The public-API snapshot test (REQ-08/AC-10) is the executable spec of this surface.
