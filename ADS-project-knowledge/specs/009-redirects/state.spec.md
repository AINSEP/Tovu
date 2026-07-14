# State Contract Spec: redirects

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-009`
- Feature: `FEAT-009-redirects`
- Version: `1.0.0`
- Content Hash: `anchored in feature.spec.md`
- Last Edited: `2026-07-12T00:00:00Z`

## Purpose
Defines the durable persisted state (the three core-owned tables ADR-033 §2 names) and the
admin-UI client state, in a language-neutral format. `RedirectRecord`/`RedirectRevision`/
`RedirectHitStats` field shapes are taken directly from `src/redirects/types.ts` (already
written, ADR-033-governed) — this file specifies the transitions and invariants over them,
not a redesign of the shapes.

## 1) Durable State Shape (per workspace)
| Table | Row Shape | Nullable Fields | Initial Value on Create | Description |
|---|---|---|---|---|
| `redirects` | `RedirectRecord` | `sourceEntryId`, `fromPathAtCapture`, `toPathAtCapture`, `createdByPluginId` | `status: 'active'`, `version: 1` | One row per rule |
| `redirect_revisions` | `RedirectRevision` | `pluginId` | one row per write (`seq: 1` on create) | Append-only ledger; never updated in place |
| `redirect_hits` | `RedirectHitStats` | `lastHitAt` | `hitCount: 0`, `lastHitAt: null` | Non-revisioned sidecar (explicitly narrows ADR-022 INV-3, ADR-027 precedent) |

## 2) Entity Contracts
```yaml
RedirectRecord:
  id: string (ulid)
  workspaceId: string (uuid)
  matchType: enum[exact, prefix, wildcard, regex]   # 'regex' reserved, write-rejected in v1
  fromPattern: string
  toTarget: string
  statusCode: enum[301, 302, 307, 308]
  status: enum[active, disabled]
  override: boolean
  priority: integer
  source: enum[manual, auto_slug_change, import]
  sourceEntryId: string (uuid) | null
  fromPathAtCapture: string | null
  toPathAtCapture: string | null
  createdByPrincipal: string (uuid)
  createdByPluginId: string | null
  createdAt: string (date-time)
  updatedAt: string (date-time)
  version: integer

RedirectRevision:
  redirectId: string (ulid)
  workspaceId: string (uuid)
  seq: integer
  state: RedirectRecord
  tombstoned: boolean
  actorId: string (uuid)
  pluginId: string | null
  recordedAt: string (date-time)

RedirectHitStats:
  redirectId: string (ulid)
  workspaceId: string (uuid)
  hitCount: integer
  lastHitAt: string (date-time) | null

# Admin UI client state (mirrors the template's generic FeatureItem shape,
# specialized to this feature)
AdminRedirectListState:
  rules: array<RedirectRecord>
  selectedRuleId: string | null
  loading: RedirectLoadingState
  errors: RedirectErrorState
  statusFilter: enum[active, disabled] | null
  sourceFilter: enum[manual, auto_slug_change, import] | null
  matchTypeFilter: enum[exact, prefix, wildcard] | null

RedirectLoadingState:
  fetchingRules: boolean
  creatingRule: boolean
  updatingRule: boolean
  tombstoningRule: boolean

RedirectErrorState:
  fetchRules: Error | null
  createRule: Error | null
  updateRule: Error | null
  tombstoneRule: Error | null
```

## 3) Action Catalog

### 3.1 Durable-state (chokepoint) actions — `RedirectRepoPort`
| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `SAVE_RULE` (`RedirectRepoPort.save`) | `{ record, revision }` | `record.fromPattern` passed `RedirectMatcher.validatePattern`; `record.toTarget` passed the open-redirect oracle if absolute; no loop introduced (REQ-13/REQ-14) | Insert-or-update `redirects` row + append `redirect_revisions` row, same transaction | Any precondition failure aborts before this action runs — `save` itself is not expected to be called with invalid state |
| `TOMBSTONE_RULE` (`RedirectRepoPort.tombstone`) | `{ workspaceId, id, revision }` | Rule exists and is not already tombstoned | Flip `status: 'disabled'`, append tombstone revision (`tombstoned: true`), same transaction | `REDIRECT_NOT_FOUND` if the rule does not exist |
| `CAPTURE_SLUG_CHANGE` (`SlugChangeCapture.onSlugChange`) | `SlugChangeCaptureInput` (routing-owned shape: `workspaceId, entryId, oldPath, newPath, actor, changeSetId`) | Called synchronously inside the content rename transaction; idempotent by `changeSetId` (REQ-17) | Insert `redirects` row (`source: 'auto_slug_change'`) + append revision, same transaction as the rename | Any throw aborts the enclosing rename transaction (REQ-16/EC-05) |
| `RECORD_HIT` (`RedirectHitSink.record`) | `{ workspaceId, redirectId, at }` | None (best-effort) | Upsert `redirect_hits` row: increment `hitCount`, set `lastHitAt` | Failure is swallowed/logged by the outbox handler; never rethrown to the request path (REQ-21) |

### 3.2 Admin-UI client actions
| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `FETCH_RULES_REQUEST` | optional filters | none | `loading.fetchingRules=true` | clear `errors.fetchRules` |
| `FETCH_RULES_SUCCESS` | `rules` | request in-flight | replace `rules` | clear `errors.fetchRules` |
| `FETCH_RULES_FAILURE` | error | request in-flight | `loading.fetchingRules=false` | set `errors.fetchRules` |
| `CREATE_RULE_REQUEST` | `CreateRedirectInput` | valid form input | `loading.creatingRule=true` | none yet |
| `CREATE_RULE_SUCCESS` | created `RedirectRecord` | create in-flight | append to `rules`, clear form | clear `errors.createRule` |
| `CREATE_RULE_FAILURE` | error (incl. field-level `REDIRECT_VALIDATION_ERROR`/`REDIRECT_TARGET_NOT_ALLOWED`) | create in-flight | `loading.creatingRule=false`, form retains input | set `errors.createRule` |
| `UPDATE_RULE_*` | `id + changes` | rule exists in `rules` | optimistic patch in list / reconcile / rollback | set/clear `errors.updateRule` |
| `TOMBSTONE_RULE_*` | `id` | rule exists and is active | optimistic `status: 'disabled'` / reconcile / rollback | set/clear `errors.tombstoneRule` |
| `SELECT_RULE` | `id \| null` | none | update `selectedRuleId` | none |
| `SET_FILTER` | `{ statusFilter?, sourceFilter?, matchTypeFilter? }` | none | update filter fields, re-fetch | none |

## 4) Selector Contracts
| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `selectRules` | full state | `array<RedirectRecord>` filtered client-side by active filters | empty array when no data |
| `selectSelectedRule` | full state | `RedirectRecord \| null` | null when no selection or missing rule |
| `selectIsLoading` | full state | `boolean` | OR of all `loading.*` flags |
| `selectLastError` | full state | `Error \| null` | latest non-null entry in `errors.*` |
| `selectDynamicRuleCount` | full state | `integer` | count of `rules` where `matchType in {wildcard}` and `status='active'` — surfaces proximity to the OQ-01 dynamic-set cap in the UI |

## 5) State Invariants
- [ ] A `redirects` row's `version` is monotonically increasing and equals the count of
  non-tombstoned + tombstone revisions recorded for it in `redirect_revisions`.
- [ ] A `redirect_revisions` row is never updated or deleted after insert (append-only).
- [ ] `redirect_hits.hitCount` for a given `redirectId` never decreases.
- [ ] `selectedRuleId` is `null` or exists in `rules`.
- [ ] Any `*_REQUEST` action sets only its matching loading flag.
- [ ] Any `*_SUCCESS`/`*_FAILURE` clears its matching loading flag.
- [ ] Optimistic rollback paths (`UPDATE_RULE_FAILURE`, `TOMBSTONE_RULE_FAILURE`) restore the
  pre-request rule values in `rules`.

## 6) Acceptance Checklist
- [x] All actions have explicit before/after behavior.
- [x] Selectors are deterministic and side-effect free.
- [x] Entity fields and enums align with `api.spec.md` and `ui.spec.md`.
