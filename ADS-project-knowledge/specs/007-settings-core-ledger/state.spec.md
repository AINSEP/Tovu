# State Contract Spec: Settings (Core-Only Layered Ledger)

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-007`
- Feature: `FEAT-007-settings-core-ledger`
- Version: `0.3.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-11T20:00:00Z`

## Purpose
Defines the persistent server state (tables), legal transitions, resolver selectors, and state
invariants for the core-only Settings ledger, in a language-neutral format. Authoritative DDL is in
ADR-028 §2; this file is the spec-level contract.

## 1) State Shape (persistent tables in per-site `content.db`)
| Table | Key | Nullable Cols | Initial | Description |
|---|---|---|---|---|
| `setting_definitions` | `(setting_id, version)` | `workspace_id`, `default_json`, `alias_of_ns/key`, `coercion_json`, `owner_id` | empty | Schemas-as-data registry: one active/alias/deprecated/tombstone row per version |
| `setting_values_global` | `(setting_id)` | `value_json`, `origin_plugin_id` | empty | Global-layer values; no `namespace`/`key` columns (keyed by `setting_id` only) |
| `setting_values_workspace` | `(workspace_id, setting_id)` | `value_json`, `origin_plugin_id` | empty | Workspace-layer values; FK `workspace_id → workspaces(id) ON DELETE RESTRICT` |
| `setting_values_user` | `(workspace_id, principal_id, setting_id)` | `value_json`, `origin_plugin_id` | empty | User-layer values; composite FK `(workspace_id, principal_id) ON DELETE RESTRICT` |
| `setting_revisions` | `seq` (autoincrement) | `scope`, `workspace_id`, `principal_id`, `before_json`, `after_json`, `change_set_id` | empty | Append-only ledger; never cascade-deleted |

## 2) Entity Contracts
```yaml
SettingDefinition:
  setting_id: string (ULID)          # stable logical identity across versions/renames
  version: integer                   # 1 for alias markers
  workspace_id: string|null          # null = platform (core/theme); non-null = site-owned
  namespace: string                  # core.* | theme.{id} | site.*
  key: string
  owner_kind: enum[core, site, theme]
  schema_json: string (json)         # ADR-022 bounded/total validation language
  default_json: string (json)|null   # non-null required for non-secret defs in this subset
  scopes: integer                    # bitmask global=1 ws=2 user=4 (1..7)
  secret: boolean                    # must be false in this subset
  status: enum[active, alias, deprecated, tombstone]
  alias_of_ns: string|null
  alias_of_key: string|null
  coercion_json: string (json)|null  # total coercer old_version -> version; null on v1
  created_at: string (date-time)
  updated_at: string (date-time)

SettingValue:
  setting_id: string (ULID)
  workspace_id: string|null          # present on workspace/user layers
  principal_id: string|null          # present on user layer only
  value_json: string (json)|null
  state: enum[set, cleared]
  def_version: integer
  seq: integer
  updated_by: string (principal id)
  updated_at: string (date-time)

SettingRevision:
  seq: integer                       # monotonic, autoincrement
  entity_kind: enum[definition, value]
  setting_id: string
  scope: enum[global, workspace, user]|null
  op: enum[register, alias, retype, deprecate, tombstone, set, clear, purge, coerce]
  before_json: string (json)|null
  after_json: string (json)|null
  def_version: integer
  actor: string (principal id)
  created_at: string (date-time)
```

## 3) Action Catalog
| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `REGISTER_DEFINITION` | definition | namespace fence + scope + non-secret valid | insert `active` def (+ `deprecate` prior on retype) | reject `DEFINITION_INVALID` / `SECRET_NOT_SUPPORTED` |
| `RENAME_DEFINITION` | old key, new name | same schema; new name free | UPDATE active def ns/key (same setting_id/version) + INSERT v1 alias marker at old name | reject `RENAME_RETYPE_CONFLICT` / `ALIAS_DEPTH_EXCEEDED` |
| `RETYPE_DEFINITION` | new schema, coercer | coercer present for every prior version | insert version+1 `active`, flip prior active → `deprecated` | reject `DEFINITION_INVALID` |
| `TOMBSTONE_DEFINITION` | key | def exists | set status `tombstone` (values retained) | reject `DEFINITION_NOT_FOUND` |
| `SET_VALUE` | key, scope, value | authorized (self/other derivation §see behavior.spec §1.3 for scope=user); scope ∈ scopes; value valid; when scope=user and `principalId` ≠ caller, `principalId` must be an active `kind='user'` member of `workspace_id` (REQ-13/INV-09) | upsert value row (`state='set'`) + append `op='set'` revision (same tx) | reject `FORBIDDEN`/`SCOPE_NOT_ALLOWED`/`VALUE_VALIDATION_FAILED`/`PRINCIPAL_NOT_FOUND` |
| `CLEAR_VALUE` | key, scope | authorized (same self/other derivation); when scope=user and `principalId` ≠ caller, same membership check as `SET_VALUE` | set value row `state='cleared'` + append `op='clear'` revision (same tx) | reject `FORBIDDEN`/`PRINCIPAL_NOT_FOUND` |
| `RESET_NAMESPACE` | namespace, scope | authorized `settings.reset.*` | loop `CLEAR_VALUE` in reset-authorized context; each emits `op='clear'` | reject `FORBIDDEN` |
| `PURGE_TENANT` | workspace_id or principal | authorized once | append `op='purge'` redacted revision per row, delete rows (one tx) | reject `FORBIDDEN` |

## 4) Selector Contracts (resolver)
| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `getEffective` | key, scopeContext | resolved value | precedence `user ?? workspace ?? global ?? default`; validated default when no layer present; alias-transparent; coerces stale `def_version` in memory |
| `getLayer` | key, scope, scopeContext | value or absent | typed-absent when the specific layer has no non-cleared row |
| `resolveDefinition` | ns, key, workspaceContext | active definition | follows alias marker (depth ≤1) to the active def; typed-absent for tombstone |
| `getRevisions` | setting_id | ordered revisions | ascending `seq`; empty list when none |

## 5) State Invariants
- [ ] Every value row change has a same-`seq`-transaction `setting_revisions` row (INV-01).
- [ ] `getEffective` for a live key resolves to a value or the validated default, never undefined (INV-02).
- [ ] Values are keyed by `setting_id` only; a rename never changes value-row keys (INV-03).
- [ ] Alias markers are `version=1` and reference an `active` definition; depth ≤1 (INV-04).
- [ ] A non-null-`workspace_id` definition never has the global scope bit and lives under `site.*` (INV-05).
- [ ] `setting_revisions` is append-only; purge appends before delete; no cascade-delete (INV-06).
- [ ] `secret` is always false for accepted definitions (INV-08).
- [ ] A `setting_values_user` row is never written or addressable for a `(workspace_id, principal_id)`
      pair whose `principal_id` is not, at write time, an active `kind='user'` member of `workspace_id`
      (INV-09).

## 6) Acceptance Checklist
- [ ] All actions have explicit before/after behavior.
- [ ] Selectors are deterministic and side-effect free (read-path coercion is in-memory only).
- [ ] Entity fields and enums align with `api.spec.md`, `behavior.spec.md`, and `errors.spec.md`.
