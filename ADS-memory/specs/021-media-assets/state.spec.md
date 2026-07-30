# State Contract Spec: media-assets

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-021`
- Feature: `FEAT-021-media-assets`
- Version: `1.0.0`
- Content Hash: anchored in feature.spec.md
- Last Edited: `2026-07-15T00:00:00Z`

**As-built adaptation note:** the template describes a frontend Redux-shaped store. Media has no client-side state store (`orchestrator.spec.md` is OMITTED — see `spec-manifest.md`; `Media.tsx` holds only local `useState`). This file instead documents the real, durable-shaped server state — the five in-memory record tables `src/media/{types,transform-types}.ts` define and `repo.memory.ts` backs — following the same adaptation `015-integrations`'s `state.spec.md` made for its `WebhookSubscriptionRecord`/`WebhookDeliveryRecord` tables.

## Purpose
Defines persistent and derived state, legal transitions, and invariants for the `media` library's five record types, in a language-neutral format.

## 1) State Shape (per-workspace, scoped by `workspaceId` on every row)

| Table | Type | Adapter Today | Description |
|---|---|---|---|
| `media` | `array<MediaRecord>` | `InMemoryMediaRepo` | Editorial half — bespoke table (not the generic `entries` model; see Dependencies in `feature.spec.md`) |
| `asset_blobs` | `array<AssetBlobRecord>` | `InMemoryAssetBlobRepo` | Core-owned sidecar — physical bytes metadata, keyed `(workspaceId, sha256)` |
| `asset_renditions` | `array<AssetRenditionRecord>` | `InMemoryAssetRenditionRepo` | Core-owned sidecar — derived variants |
| `blob_gc_journal` | `array<BlobGcJournalEntry>` | `InMemoryBlobGcJournalRepo` | Core-owned sidecar — the two-phase GC protocol's crash-safety journal |
| `transform_registry` | `array<TransformDefinitionRecord>` | `InMemoryTransformDefinitionRepo` | Core-owned sidecar — named, append-only transform definitions |

**Persistence caveat (applies to every table above):** all five adapters are in-memory arrays that do not survive a process restart. This is a disclosed, standing limitation shared with every other admin-section library in this repo at the time of this build (Constitution Article IV, "disclosed rule-of-two gap" — see `feature.spec.md`'s Constitution Compliance table).

## 2) Entity Contracts

```yaml
MediaRecord:
  id: string (uuid)
  workspaceId: string (uuid)
  title: string
  alt: string
  caption: string
  credit: string
  source:
    sha256: string          # write-once: settable-once-from-absent (INV-02)
  status: enum[active, trashed]   # no "purged" status — purge is a hard row delete
  createdAt: string (date-time, ISO-8601)
  updatedAt: string (date-time, ISO-8601)
  version: integer                # increments on every mutating write (update/trash)

AssetBlobRecord:
  id: string (uuid)
  workspaceId: string (uuid)
  sha256: string                  # identity is (workspaceId, sha256) — per-workspace dedup
  storageKey: string              # ws/{workspaceId}/blobs/{sha256[0..2]}/{sha256} — no generation epoch (GAP-EPOCHS)
  createdByPrincipal: string      # required attribution, even for machine-triggered writes
  createdAt: string (date-time)
  status: enum[active, tombstoned]
  tombstonedAt: string (date-time) | null   # set only while status === tombstoned

AssetRenditionRecord:
  id: string (uuid)
  workspaceId: string (uuid)
  assetId: string (uuid)          # FK -> MediaRecord.id
  transformName: string
  version: integer                # matches a transform_registry (name, version)
  storageKey: string
  createdAt: string (date-time)

BlobGcJournalEntry:
  id: string (uuid)
  workspaceId: string (uuid)
  sha256: string
  storageKey: string
  journaledAt: string (date-time)

TransformDefinitionRecord:
  id: string (uuid)
  workspaceId: string (uuid)
  name: string
  version: integer                 # (workspaceId, name, version) is append-only-unique
  params:
    width: integer | null          # 1..8000 (MAX_TRANSFORM_DIMENSION_PX)
    height: integer | null         # 1..8000
    fit: enum[cover, contain, fill, inside, outside] | null   # requires both width AND height
    format: enum[jpeg, png, webp, gif]
  owner: string                    # registering module id; always "core" in this build (GAP-DECLARER)
  createdAt: string (date-time)
```

## 3) Action Catalog (real service functions — the durable-state equivalent of the template's Redux actions)

| Action (function) | Payload (`input`) | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `uploadMedia` | `{workspaceId, bytes, filename, contentType, alt?, caption?, credit?, createdByPrincipal}` | content-type allowed, non-empty, under size cap | inserts/resurrects one `asset_blobs` row (locked), inserts one `media` row, inserts one `asset_renditions` row (`"original"`, v1) | throws `MediaValidationError` on any precondition failure — no partial state change |
| `listMedia` | `{workspaceId}` | none | none (read-only) | none — always returns (possibly empty) array |
| `getMediaById` | `{workspaceId, id}` | row exists | none | throws `MediaNotFoundError` |
| `updateMediaMetadata` | `{workspaceId, id, title?, alt?, caption?, credit?}` | row exists | updates the four editorial fields present in the input, bumps `version`, updates `updatedAt` | throws `MediaNotFoundError` |
| `trashMedia` | `{workspaceId, id}` | row exists | sets `status: "trashed"`, bumps `version`, updates `updatedAt` (no-op if already trashed) | throws `MediaNotFoundError` |
| `purgeMedia` | `{workspaceId, id}` | row exists AND `status === "trashed"` | removes all `asset_renditions` rows for the asset, removes the `media` row, then runs `tombstoneBlobIfUnreferenced` for its sha256 | throws `MediaNotFoundError` (unknown id) or `MediaStillReferencedError` (not yet trashed) |
| `tombstoneBlobIfUnreferenced` | `{workspaceId, sha256}` | blob row exists | sets `asset_blobs.status: "tombstoned"` + `tombstonedAt` IFF `isBlobUnreferenced` holds (locked) | no-op (not an error) if no row, already tombstoned, or still referenced |
| `runBlobGcDeletePass` | `{workspaceId, sha256}` | row is `tombstoned` AND `gc_grace` elapsed AND re-check unreferenced | inserts a `blob_gc_journal` row, removes the `asset_blobs` row (locked, same critical section) | no-op (not an error) on any precondition failure |
| `runBlobGcUnlinkPass` | `{workspaceId}` | none | for each journal entry: removes blob-store bytes (unless a live row re-exists for the sha256) and removes the journal entry | never throws for a normal entry; underlying `blobStore.remove` errors propagate |
| `registerTransform` | `{workspaceId, name, params, owner}` | non-blank name/owner, valid params | inserts a new `transform_registry` row at `(current max version for name) + 1` (locked) | throws `TransformValidationError` |
| `resolveMediaRendition` | `{workspaceId, assetId, transformName, version}` | none (all cases return an outcome, not a throw, except a genuine data-integrity gap) | may insert a new `asset_renditions` row (locked, single-flight) if generation is bounded-allowed | returns `{outcome: "not-found"\|"gone"\|"ok"}`; throws only on the unreachable-in-practice "source blob missing" integrity gap |

## 4) Query/Selector Contracts

| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `isBlobUnreferenced` | `{workspaceId, sha256}` | `boolean` | `true` when no media row (any non-purged status), no live `entry_refs` (stub), and no retained snapshot (stub) reference the hash |
| `isLatestTransformVersion` | `{workspaceId, name, version}` | `boolean` | `false` if `name` was never registered |
| `getLatestTransformDefinition` | `{workspaceId, name}` | `TransformDefinitionRecord \| null` | `null` if `name` was never registered |
| `isReferencedByPublishedContent` | `{workspaceId, name, version}` | `boolean` | always `false` (stub — GAP-ENTRYREFS) |
| `resolveGcGraceMs` | `{workspaceId, sha256}` | `integer` (ms) | always `DEFAULT_GC_GRACE_MS` (30 days) in this build, since the snapshot-age input is always `undefined` |

## 5) State Invariants

- [x] A `media` row's `status` only ever transitions `active -> trashed` (via `trashMedia`) or is removed entirely (via `purgeMedia`, only from `trashed`) — never `trashed -> active` (no "untrash" operation exists).
- [x] An `asset_blobs` row's `status` only ever transitions `active -> tombstoned` (tombstone-pass) or `tombstoned -> active` (dedup resurrect) — both under `withSha256Lock` — or is removed entirely (delete-pass, only from `tombstoned` after `gc_grace`).
- [x] A `blob_gc_journal` row's lifetime is exactly one delete-pass-to-unlink-pass window — created by the delete-pass, always removed by the unlink-pass (whether or not bytes were actually unlinked).
- [x] `transform_registry` rows are never updated or removed after insert (append-only, INV-07 in `feature.spec.md`).
- [x] `asset_renditions.(assetId, transformName, version)` is effectively unique in practice (single-flight generation prevents a genuine duplicate write under lock), though no adapter-level uniqueness constraint enforces it defensively the way `InMemoryTransformDefinitionRepo.insert` does for `transform_registry`.

## 6) Acceptance Checklist
- [x] All actions have explicit before/after behavior.
- [x] Selectors are deterministic and side-effect free (except `resolveMediaRendition`, which is documented as a selector-with-a-generation-side-effect in the Action Catalog, not listed twice).
- [x] Entity fields and enums align with `api.spec.md` and `ui.spec.md`.
