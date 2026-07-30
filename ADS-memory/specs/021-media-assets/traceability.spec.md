# Traceability Matrix: media-assets

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-021 |
| feature_name | FEAT-021-media-assets |
| version | 1.0.0 |
| content_hash | anchored in feature.spec.md |
| last_edited | 2026-07-15T00:00:00Z |
| traceability_status | COMPLETE (as-built — every row resolved to a real file/function; two rows are intentionally `IMPLEMENTED (undesired)` per the disclosed authz gap, and a handful of exact-boundary cases are recorded as coverage gaps in §6.2 rather than left blank) |

**Purpose:** This matrix traces every REQ/AC/INV/EC from `feature.spec.md` to its real implementation and (where one exists) real test. As-built: the code and tests already exist, so this matrix is filled from direct source reads, not left "pending."

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|----------------|-----------|---------|--------|
| REQ-01 | Reject disallowed content type | — | `src/media/media-service.ts` | `uploadMedia` | `src/media/__tests__/media-service.test.ts` | `"uploadMedia rejects a disallowed content type"` | VERIFIED |
| AC-01 (REQ-01) | Disallowed content type -> 400 | P1 | `media-service.ts` | `uploadMedia` | `media-service.test.ts` + `src/server/__tests__/admin-media-routes.test.ts` | `"...rejects a disallowed content type"` / `"...upload rejects a disallowed content type with 400"` | VERIFIED |
| REQ-02 | Reject empty file | — | `media-service.ts` | `uploadMedia` | `media-service.test.ts` | `"uploadMedia rejects an empty file"` | VERIFIED |
| AC-02 (REQ-02) | Zero-length bytes -> throws | P1 | `media-service.ts` | `uploadMedia` | `media-service.test.ts` | `"uploadMedia rejects an empty file"` | VERIFIED |
| REQ-03 | Reject oversized file | — | `media-service.ts` | `uploadMedia` | `media-service.test.ts` | `"uploadMedia rejects a file over the size cap"` | VERIFIED |
| AC-03 (REQ-03) | Over-cap bytes -> throws | P1 | `media-service.ts` | `uploadMedia` | `media-service.test.ts` | `"uploadMedia rejects a file over the size cap"` | VERIFIED |
| REQ-04 | Dedup blob per (workspaceId, sha256) | — | `media-service.ts` | `uploadMedia` | `media-service.test.ts` | `"uploadMedia dedups identical bytes into one blob but two media rows"` | VERIFIED |
| AC-04 (REQ-04) | Same bytes twice -> 1 blob, 2 media rows | P1 | `media-service.ts` | `uploadMedia` | `media-service.test.ts` | `"uploadMedia dedups identical bytes into one blob but two media rows"` | VERIFIED |
| REQ-05 | Resurrect tombstoned blob on dedup | — | `media-service.ts` | `uploadMedia` | `media-service.test.ts` | `"uploadMedia resurrects a TOMBSTONED blob back to active instead of writing a duplicate"` | VERIFIED |
| AC-05 (REQ-05) | Tombstoned blob resurrected, no dup write | P1 | `media-service.ts` | `uploadMedia` | `media-service.test.ts` | `"uploadMedia resurrects a TOMBSTONED blob back to active instead of writing a duplicate"` | VERIFIED |
| REQ-06 | Bytes-before-row + companion "original" rendition | — | `media-service.ts` | `uploadMedia` | `media-service.test.ts` | `"uploadMedia stores bytes, a media row, and an 'original' rendition"` | VERIFIED |
| AC-06 (REQ-06) | Media + original rendition both exist, ordering held | P1 | `media-service.ts` | `uploadMedia` | `media-service.test.ts` | `"uploadMedia stores bytes, a media row, and an 'original' rendition"` | VERIFIED |
| REQ-07 | Title derivation, field trimming, initial status/version | — | `media-service.ts` | `uploadMedia`, `deriveTitleFromFilename` | `media-service.test.ts` | `"uploadMedia stores bytes, a media row, and an 'original' rendition"` (asserts title) | VERIFIED |
| AC-07 (REQ-07) | `cat.png` -> title `"cat"` | P1 | `media-service.ts` | `deriveTitleFromFilename` | `media-service.test.ts` | (same as REQ-07) | VERIFIED |
| REQ-08 | Write-once `source.sha256` | — | `media-service.ts` | `resolveWriteOnceSource` | `media-service.test.ts` | `"resolveWriteOnceSource allows absent -> set..."` | VERIFIED |
| AC-08 (REQ-08) | Changing sha256 throws; absent -> set works | P1 | `media-service.ts` | `resolveWriteOnceSource` | `media-service.test.ts` | `"resolveWriteOnceSource allows absent -> set..."` | VERIFIED |
| REQ-09 | List returns all statuses | — | `media-service.ts` | `listMedia` | `admin-media-routes.test.ts` | ladder test's list assertions | VERIFIED |
| AC-09 (REQ-09) | Active + trashed both returned | P1 | `media-service.ts` | `listMedia` | `admin-media-routes.test.ts` | ladder test | VERIFIED |
| REQ-10 | `getMediaById` throws on unknown id | — | `media-service.ts` | `getMediaById` | `media-service.test.ts` | `"getMediaById throws MediaNotFoundError for a missing id"` | VERIFIED |
| AC-10 (REQ-10) | Unknown id -> `MediaNotFoundError` | P1 | `media-service.ts` | `getMediaById` | `media-service.test.ts` | `"getMediaById throws MediaNotFoundError for a missing id"` | VERIFIED |
| REQ-11 | Update editorial fields only, bump version | — | `media-service.ts` | `updateMediaMetadata` | `media-service.test.ts` | `"updateMediaMetadata updates only alt/caption/credit/title and bumps version"` | VERIFIED |
| AC-11 (REQ-11) | Caption/credit updated, version +1 | P1 | `media-service.ts` | `updateMediaMetadata` | `media-service.test.ts` + `admin-media-routes.test.ts` | above + ladder test's PATCH assertion (`version === 2`) | VERIFIED |
| REQ-12 | Update throws on unknown id | — | `media-service.ts` | `updateMediaMetadata` | `media-service.test.ts` | `"updateMediaMetadata throws MediaNotFoundError for a missing id"` | VERIFIED |
| AC-12 (REQ-12) | Unknown id -> `MediaNotFoundError` | P1 | `media-service.ts` | `updateMediaMetadata` | `media-service.test.ts` | `"updateMediaMetadata throws MediaNotFoundError for a missing id"` | VERIFIED |
| REQ-13 | Trash idempotent soft-delete | — | `media-service.ts` | `trashMedia` | `media-service.test.ts` | `"trashMedia soft-deletes and is idempotent on a second call"` | VERIFIED |
| AC-13 (REQ-13) | Second trash call is a no-op | P1 | `media-service.ts` | `trashMedia` | `media-service.test.ts` | `"trashMedia soft-deletes and is idempotent on a second call"` | VERIFIED |
| REQ-14 | Purge 409s unless trashed | — | `media-service.ts` | `purgeMedia` | `media-service.test.ts` + `admin-media-routes.test.ts` | `"purgeMedia 409s (MediaStillReferencedError)..."` / premature-purge assertion | VERIFIED |
| AC-14 (REQ-14) | Purge before trash -> 409 + referencing list | P1 | `media-service.ts` | `purgeMedia` | `media-service.test.ts` + `admin-media-routes.test.ts` | (same) | VERIFIED |
| REQ-15 | Purge removes rows, tombstones blob (no byte delete) | — | `media-service.ts` | `purgeMedia` | `media-service.test.ts` | `"purgeMedia removes the media row immediately but only TOMBSTONES an unshared blob..."` | VERIFIED |
| AC-15 (REQ-15) | Row removed, blob tombstoned not deleted | P1 | `media-service.ts` | `purgeMedia` | `media-service.test.ts` | (same) | VERIFIED |
| REQ-16 | `isBlobUnreferenced` predicate | — | `src/media/blob-gc.ts` | `isBlobUnreferenced` | `src/media/__tests__/blob-gc.test.ts` | `"isBlobUnreferenced is true when..."` / `"...false while an ACTIVE..."` / `"...still false while a TRASHED..."` | VERIFIED |
| AC-16 (REQ-16) | true/false cases for active/trashed/none | P1 | `blob-gc.ts` | `isBlobUnreferenced` | `blob-gc.test.ts` | (same three) | VERIFIED |
| REQ-17 | Tombstone-pass gated + idempotent | — | `blob-gc.ts` | `tombstoneBlobIfUnreferenced` | `blob-gc.test.ts` | `"tombstoneBlobIfUnreferenced tombstones..."` / `"...refuses to tombstone a still-referenced blob"` | VERIFIED |
| AC-17 (REQ-17) | Unreferenced tombstoned, referenced refused | P1 | `blob-gc.ts` | `tombstoneBlobIfUnreferenced` | `blob-gc.test.ts` | (same) | VERIFIED |
| AC-18 (REQ-17) | Re-tombstone is a no-op | P2 | `blob-gc.ts` | `tombstoneBlobIfUnreferenced` | `blob-gc.test.ts` | `"tombstoneBlobIfUnreferenced is idempotent on an already-tombstoned row"` | VERIFIED |
| REQ-18 | Delete-pass grace + re-check gated | — | `blob-gc.ts` | `runBlobGcDeletePass` | `blob-gc.test.ts` | `"runBlobGcDeletePass refuses to run before gc_grace has elapsed"` / `"...no-ops on a blob that was never tombstoned"` | VERIFIED |
| AC-19 (REQ-18) | Grace not elapsed -> no delete | P1 | `blob-gc.ts` | `runBlobGcDeletePass` | `blob-gc.test.ts` | `"runBlobGcDeletePass refuses to run before gc_grace has elapsed"` | VERIFIED |
| AC-20 (REQ-18) | Never-tombstoned row -> no-op | P1 | `blob-gc.ts` | `runBlobGcDeletePass` | `blob-gc.test.ts` | `"runBlobGcDeletePass no-ops on a blob that was never tombstoned"` | VERIFIED |
| AC-21 (REQ-18) | Bytes survive row-delete until unlink-pass | P1 | `blob-gc.ts` | `runBlobGcDeletePass`, `runBlobGcUnlinkPass` | `blob-gc.test.ts` | `"write-before-insert / unlink-after-delete-commit ordering..."` | VERIFIED |
| REQ-19 | `resolveGcGraceMs` formula | — | `blob-gc.ts` | `resolveGcGraceMs` | `blob-gc.test.ts` | exercised indirectly by every grace-period test | VERIFIED |
| AC-22 (REQ-19) | Grace = 30d when snapshot stub is undefined | P2 | `blob-gc.ts` | `resolveGcGraceMs` | (direct code read; indirectly exercised) | n/a — no dedicated unit test isolates this pure function alone | TESTED (indirect) |
| REQ-20 | Unlink-pass live-row re-check | — | `blob-gc.ts` | `runBlobGcUnlinkPass` | `blob-gc.test.ts` | `"runBlobGcUnlinkPass skips (does not unlink) a journal entry whose sha256 has a live row again..."` | VERIFIED |
| AC-23 (REQ-20) | Live row re-exists -> skip unlink | P1 | `blob-gc.ts` | `runBlobGcUnlinkPass` | `blob-gc.test.ts` | (same) | VERIFIED |
| AC-24 (REQ-20/REQ-22) | Concurrent upload/delete-pass race -> no loss/orphan | P1 | `blob-gc.ts`, `blob-gc-lock.ts` | `runBlobGcDeletePass`, `uploadMedia`, `withSha256Lock` | `blob-gc.test.ts` | `"concurrent purge (delete-pass) racing an upload on the same sha256 never loses or orphans bytes..."` | VERIFIED |
| REQ-21 | `runBlobGcCycle` batch wrapper | — | `blob-gc.ts` | `runBlobGcCycle` | `blob-gc.test.ts` | `"runBlobGcCycle deletes every eligible tombstoned blob and drains the journal in one call"` | VERIFIED |
| AC-25 (REQ-21) | Batch deletes + drains in one call | P2 | `blob-gc.ts` | `runBlobGcCycle` | `blob-gc.test.ts` | (same) | VERIFIED |
| REQ-22 | `withSha256Lock` FIFO serialization | — | `src/media/blob-gc-lock.ts` | `withSha256Lock` | `blob-gc.test.ts` | `"withSha256Lock serializes calls for the same key..."` / `"...runs different keys fully concurrently"` / `"...does not let one key's rejection poison later calls..."` | VERIFIED |
| AC-26 (REQ-22) | FIFO / concurrent-keys / non-poisoning | P1 | `blob-gc-lock.ts` | `withSha256Lock` | `blob-gc.test.ts` | (same three) | VERIFIED |
| REQ-23 | `runMonthlyOrphanSweepStub` named no-op | — | `blob-gc.ts` | `runMonthlyOrphanSweepStub` | n/a | n/a — never called anywhere, confirmed by direct source read + repo-wide grep for its name | IMPLEMENTED (stub, no test — matches its own doc comment's stated scope) |
| REQ-24 | Append-only `registerTransform` | — | `src/media/transform-registry.ts` | `registerTransform` | `src/media/__tests__/transform-registry.test.ts` | `"registerTransform mints version 1..."` / `"...append-only: redefining a name mints a new version..."` | VERIFIED |
| AC-27 (REQ-24) | v1 then v2, v1 unchanged | P1 | `transform-registry.ts` | `registerTransform` | `transform-registry.test.ts` | (same two) | VERIFIED |
| AC-28 (REQ-24) | Duplicate (ws,name,version) throws | P1 | `src/media/repo.memory.ts` | `InMemoryTransformDefinitionRepo.insert` | `transform-registry.test.ts` | `"InMemoryTransformDefinitionRepo.insert rejects a duplicate (workspaceId, name, version)"` | VERIFIED |
| AC-29 (REQ-24) | Concurrent registration -> strictly increasing | P1 | `transform-registry.ts`, `transform-lock.ts` | `registerTransform`, `withTransformRegistryLock` | `transform-registry.test.ts` | `"registerTransform serializes concurrent registrations of the same name into strictly increasing..."` | VERIFIED |
| REQ-25 | `assertValidTransformParams` bounds | — | `src/media/transform-types.ts` | `assertValidTransformParams` | `transform-registry.test.ts` | `"registerTransform rejects invalid params (bad format..."` | VERIFIED |
| AC-30 (REQ-25) | Bad format / out-of-range dims -> throws | P1 | `transform-types.ts` | `assertValidTransformParams` | `transform-registry.test.ts` | (same) | VERIFIED |
| REQ-26 | `isLatestTransformVersion` | — | `transform-registry.ts` | `isLatestTransformVersion` | `transform-registry.test.ts` | `"isLatestTransformVersion is true only for the current max version of a name"` | VERIFIED |
| AC-31 (REQ-26) | v1 false, v2 true | P1 | `transform-registry.ts` | `isLatestTransformVersion` | `transform-registry.test.ts` | (same) | VERIFIED |
| REQ-27 | `isReferencedByPublishedContent` stub | — | `transform-registry.ts` | `isReferencedByPublishedContent` | `transform-registry.test.ts` | `"isReferencedByPublishedContent is a disclosed stub that always reports false"` | VERIFIED |
| AC-32 (REQ-27) | Always false | P2 | `transform-registry.ts` | `isReferencedByPublishedContent` | `transform-registry.test.ts` | (same) | VERIFIED |
| REQ-28 | `resolveMediaRendition` not-found/gone mapping | — | `src/media/rendition-service.ts` | `resolveMediaRendition` | `src/media/__tests__/rendition-service.test.ts` | `"resolveMediaRendition: unknown assetId -> not-found"` / `"...trashed asset -> gone (410)"` / `"...unregistered transform name -> not-found..."` | VERIFIED |
| AC-33 (REQ-28) | Unknown assetId -> not-found | P1 | `rendition-service.ts` | `resolveMediaRendition` | `rendition-service.test.ts` + `src/server/__tests__/media-rendition-route.test.ts` | `"...unknown assetId -> not-found"` + `"...unknown assetId is a 404..."` | VERIFIED |
| AC-34 (REQ-28) | Trashed -> gone even with existing rendition | P1 | `rendition-service.ts` | `resolveMediaRendition` | `rendition-service.test.ts` + `media-rendition-route.test.ts` | `"...trashed asset -> gone (410)"` + route test | VERIFIED |
| AC-35 (REQ-28) | Unregistered transform -> not-found | P1 | `rendition-service.ts` | `resolveMediaRendition` | `rendition-service.test.ts` | `"...unregistered transform name -> not-found..."` | VERIFIED |
| REQ-29 | Serve-if-exists | — | `rendition-service.ts` | `resolveMediaRendition` | `rendition-service.test.ts` | `"...serve-if-exists — an already-generated rendition serves without calling the transformer again"` | VERIFIED |
| AC-36 (REQ-29) | Existing rendition served without regen | P1 | `rendition-service.ts` | `resolveMediaRendition` | `rendition-service.test.ts` + `media-rendition-route.test.ts` | (same) + 200/immutable-cache test | VERIFIED |
| REQ-30 | Bounded anonymous lazy generation | — | `rendition-service.ts` | `resolveMediaRendition` | `media-rendition-route.test.ts` | `"...an older, never-generated transform version is a short-TTL 404..., while the latest version generates on first request"` | VERIFIED |
| AC-37 (REQ-30) | Older non-latest -> 404; latest -> 200+generate | P1 | `rendition-service.ts` | `resolveMediaRendition` | `media-rendition-route.test.ts` | (same) | VERIFIED |
| REQ-31 | Single-flight generation | — | `rendition-service.ts`, `transform-lock.ts` | `resolveMediaRendition`, `withRenditionLock` | `rendition-service.test.ts` | `"...single-flight — two concurrent requests..."` / `"...five concurrent requests...exactly one transform call (adversarial fan-in)"` | VERIFIED |
| AC-38 (REQ-31) | 5 concurrent -> 1 transform call | P1 | `rendition-service.ts` | `resolveMediaRendition` | `rendition-service.test.ts` | `"...five concurrent requests for the same ungenerated rendition still produce exactly one transform call (adversarial fan-in)"` | VERIFIED |
| REQ-32 | Two `ImageTransformerPort` adapters | — | `src/media/image-transformer.ts`, `image-transformer.sharp.ts` | `InMemoryImageTransformer.transform`, `SharpImageTransformer.transform` | `src/media/__tests__/image-transformer.sharp.test.ts` | `"SharpImageTransformer.transform actually resizes and re-encodes real image bytes"` / `"...rejects genuinely invalid image bytes..."` | VERIFIED |
| AC-39 (REQ-32) | Real resize/re-encode; rejects invalid bytes | P1 | `image-transformer.sharp.ts` | `SharpImageTransformer.transform` | `image-transformer.sharp.test.ts` | (same two) | VERIFIED |
| AC-40 (REQ-32) | Sharp unavailable -> `ImageTransformUnavailableError` | P2 | `image-transformer.sharp.ts` | `loadSharpFactory`, `SharpImageTransformer.transform` | `image-transformer.sharp.test.ts` | `"ImageTransformUnavailableError stays exported and instantiable for environments without 'sharp'"` | VERIFIED |
| REQ-33 | `computeBlobStorageKey` sharding | — | `src/media/blob-key.ts` | `computeBlobStorageKey` | `src/media/__tests__/blob-store.test.ts` | `"computeBlobStorageKey shards by the first two hex chars of the hash"` | VERIFIED |
| AC-41 (REQ-33) | 2-hex-char shard | P2 | `blob-key.ts` | `computeBlobStorageKey` | `blob-store.test.ts` | (same) | VERIFIED |
| REQ-34 | Two `BlobStorePort` adapters | — | `blob-store.fs.ts`, `blob-store.memory.ts` | `LocalFsBlobStore`, `InMemoryBlobStore` | `blob-store.test.ts` | `"InMemoryBlobStore satisfies the BlobStorePort contract"` / `"LocalFsBlobStore satisfies the BlobStorePort contract"` | VERIFIED |
| AC-42 (REQ-34) | Both satisfy the port contract identically | P1 | `blob-store.fs.ts`, `blob-store.memory.ts` | (same classes) | `blob-store.test.ts` | (same two) | VERIFIED |
| REQ-35 | Workspace-id guard on every admin route | — | `src/server/routes/admin/media/{list,upload,update,trash,delete}.ts` | each route's registrar | `src/server/__tests__/admin-media-routes.test.ts` | `"admin media routes: 404s for an unknown workspace id and an unknown media id"` | VERIFIED |
| AC-43 (REQ-35) | Wrong workspaceId -> 404 | P1 | (same 5 files) | (same) | `admin-media-routes.test.ts` | (same) | VERIFIED |
| REQ-36 | Upload route JSON+base64 contract | — | `src/server/routes/admin/media/upload.ts` | `registerAdminMediaUploadRoute` | `admin-media-routes.test.ts` | ladder test's upload assertion | VERIFIED |
| AC-44 (REQ-36) | Valid upload -> 201 | P1 | `upload.ts` | `registerAdminMediaUploadRoute` | `admin-media-routes.test.ts` | ladder test | VERIFIED |
| REQ-37 | Error-class-to-status mapping | — | `update.ts`, `trash.ts`, `delete.ts` | each route's registrar | `admin-media-routes.test.ts` | ladder test (409/200 sequence) + unknown-id test | VERIFIED |
| AC-45 (REQ-37) | Unknown id on trash -> 404 | P1 | `trash.ts` | `registerAdminMediaTrashRoute` | `admin-media-routes.test.ts` | `"...404s for an unknown workspace id and an unknown media id"` | VERIFIED |
| REQ-38 | Public rendition route contract | — | `src/server/routes/site/media-rendition.ts` | `registerMediaRenditionRoute` | `src/server/__tests__/media-rendition-route.test.ts` | all 5 tests in this file | VERIFIED |
| AC-46 (REQ-38) | Cosmetic slug/ext -> identical bytes | P1 | `media-rendition.ts` | `registerMediaRenditionRoute` | `media-rendition-route.test.ts` | `"...slug/ext are cosmetic..."` | VERIFIED |
| AC-47 (REQ-38) | Malformed spec -> 400 | P1 | `media-rendition.ts` | `registerMediaRenditionRoute` | `media-rendition-route.test.ts` | `"...unknown assetId is a 404, and a malformed transform spec is a 400"` | VERIFIED |
| REQ-39 | No authz on any admin media route | — | `list.ts`, `upload.ts`, `update.ts`, `trash.ts`, `delete.ts` | (absence of any `authorize`/permission call) | n/a | n/a — no test exercises this; confirmed by direct source read + repo grep (`grep -rn "authorize\|permission" src/server/routes/admin/media/*.ts` returns nothing) | IMPLEMENTED (undesired — disclosed gap, see OQ-01) |
| AC-48 (REQ-39) | Zero-grant principal still succeeds on every route | P1 | (same 5 files) | (absence) | n/a | n/a — confirmed by direct source read, not by a passing/failing test (no test asserts a 403 either way) | IMPLEMENTED (undesired, untested either direction) |
| REQ-40 | Only `media.write` registered, unreferenced | — | `src/identity/permissions.ts` | permission descriptor array | n/a | n/a — confirmed by direct source read + repo-wide grep for `"media.write"` (zero references outside `permissions.ts`) | IMPLEMENTED (undesired — disclosed gap, see OQ-02) |
| AC-49 (REQ-40) | Exactly one `media.*` descriptor, unreferenced | P2 | `permissions.ts` | (same) | n/a | n/a | IMPLEMENTED (undesired) |
| REQ-41 | Admin Media screen layout/actions | — | `apps/admin/src/sections/Media.tsx` | `Media` | n/a | n/a — no dedicated frontend component test exists in this repo pass | IMPLEMENTED (no direct test — see `traceability.spec.md` §6.2) |
| AC-50 (REQ-41) | Row fields + status-dependent action label | P2 | `Media.tsx` | `Media` | n/a | n/a | IMPLEMENTED (no direct test) |
| REQ-42 | No `<img>` thumbnail rendering | — | `Media.tsx` | `Media` | n/a | n/a — confirmed by direct source read (no `<img>` tag in the file) | IMPLEMENTED (confirmed by source read, not a test) |
| AC-51 (REQ-42) | No image element present | P3 | `Media.tsx` | `Media` | n/a | n/a | IMPLEMENTED (confirmed by source read) |

---

## 2. Invariant Traceability

| INV ID | Invariant | Test File | Test ID | Status |
|--------|-----------|-----------|---------|--------|
| INV-01 | `MediaRecord` never removed except by `purgeMedia` | `media-service.test.ts` | `"trashMedia soft-deletes and is idempotent..."` + `"purgeMedia removes the media row immediately..."` | VERIFIED |
| INV-02 | `source.sha256` write-once | `media-service.test.ts` | `"resolveWriteOnceSource allows absent -> set..."` | VERIFIED |
| INV-03 | Bytes exist before media row saved | `media-service.test.ts` | `"uploadMedia stores bytes, a media row, and an 'original' rendition"` | VERIFIED |
| INV-04 | `withSha256Lock` FIFO, non-poisoning | `blob-gc.test.ts` | `"withSha256Lock serializes calls..."` (3 tests) | VERIFIED |
| INV-05 | Delete-pass gated on grace + fresh re-check | `blob-gc.test.ts` | `"runBlobGcDeletePass refuses to run before gc_grace has elapsed"` | VERIFIED |
| INV-06 | Unlink-pass never removes bytes for a live row | `blob-gc.test.ts` | `"runBlobGcUnlinkPass skips (does not unlink)..."` | VERIFIED |
| INV-07 | `transform_registry` append-only | `transform-registry.test.ts` | `"...append-only: redefining a name..."` + `"InMemoryTransformDefinitionRepo.insert rejects a duplicate..."` | VERIFIED |
| INV-08 | No anonymous generation outside latest/referenced bound | `media-rendition-route.test.ts` | `"...an older, never-generated transform version is a short-TTL 404..."` | VERIFIED |
| INV-09 | Exactly one transform call under concurrency | `rendition-service.test.ts` | `"...five concurrent requests...exactly one transform call (adversarial fan-in)"` | VERIFIED |
| INV-10 | Lookup ignores slug/ext | `media-rendition-route.test.ts` | `"...slug/ext are cosmetic..."` | VERIFIED |
| INV-11 | `purgeMedia` never removes a non-trashed row | `media-service.test.ts` | `"purgeMedia 409s (MediaStillReferencedError)..."` | VERIFIED |

---

## 3. Edge Case Traceability

| EC ID | Edge Case | Test File | Test ID | Status |
|-------|-----------|-----------|---------|--------|
| EC-01 | Same bytes uploaded twice -> 2 media rows, 1 blob | `media-service.test.ts` | `"uploadMedia dedups identical bytes into one blob but two media rows"` | VERIFIED |
| EC-02 | Purge with a sibling sharing the hash -> bytes kept | `media-service.test.ts` | `"purgeMedia keeps blob bytes when a sibling row still shares the same hash (adversarial: shared-hash aggregate)"` | VERIFIED |
| EC-03 | Dedup upload races GC delete-pass | `blob-gc.test.ts` | `"concurrent purge (delete-pass) racing an upload on the same sha256 never loses or orphans bytes..."` | VERIFIED |
| EC-04 | Non-latest never-generated transform version | `media-rendition-route.test.ts` | `"...an older, never-generated transform version is a short-TTL 404..."` | VERIFIED |
| EC-05 | Trashed asset's already-generated rendition | `media-rendition-route.test.ts` | `"...a trashed asset's rendition responds 410 no-store, even for an already-generated rendition"` | VERIFIED |
| EC-06 | 5 concurrent requests, same ungenerated rendition | `rendition-service.test.ts` | `"...five concurrent requests...exactly one transform call (adversarial fan-in)"` | VERIFIED |
| EC-07 | PATCH metadata on a trashed asset succeeds | n/a | n/a — no test isolates this specific scenario (status is never asserted as a precondition in `updateMediaMetadata`'s tests) | IMPLEMENTED (confirmed by source read — `updateMediaMetadata` has no status check at all; see §6.2) |
| EC-08 | `sharp` unavailable at generation time | `image-transformer.sharp.test.ts` | `"ImageTransformUnavailableError stays exported and instantiable for environments without 'sharp'"` | VERIFIED |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| `WORKSPACE_NOT_FOUND` | every admin media route's inline workspace-id check | `admin-media-routes.test.ts` | `"...404s for an unknown workspace id..."` | VERIFIED |
| `MEDIA_NOT_FOUND` | `media-service.ts` (`MediaNotFoundError`) | `admin-media-routes.test.ts` | `"...404s for...an unknown media id"` | VERIFIED |
| `MEDIA_VALIDATION_ERROR` | `media-service.ts` (`MediaValidationError`) | `admin-media-routes.test.ts` | `"...upload rejects a disallowed content type with 400"` | VERIFIED |
| `MEDIA_STILL_REFERENCED` | `media-service.ts` (`MediaStillReferencedError`) | `admin-media-routes.test.ts` | ladder test's premature-purge 409 assertion | VERIFIED |
| `TRANSFORM_VALIDATION_ERROR` | `transform-types.ts` (`TransformValidationError`) | `transform-registry.test.ts` | `"registerTransform rejects invalid params..."` | VERIFIED (not HTTP-reachable — registration-time only) |
| `MALFORMED_RENDITION_URL` | `media-rendition.ts` inline check | `media-rendition-route.test.ts` | `"...a malformed transform spec is a 400"` | VERIFIED |
| `RENDITION_NOT_FOUND` | `rendition-service.ts` (`{outcome: "not-found"}`) | `media-rendition-route.test.ts` | `"...unknown assetId is a 404..."` | VERIFIED |
| `MEDIA_GONE` | `rendition-service.ts` (`{outcome: "gone"}`) | `media-rendition-route.test.ts` | `"...a trashed asset's rendition responds 410 no-store..."` | VERIFIED |
| `IMAGE_TRANSFORM_UNAVAILABLE` | `image-transformer.sharp.ts` (`ImageTransformUnavailableError`) | `image-transformer.sharp.test.ts` | `"ImageTransformUnavailableError stays exported and instantiable..."` | VERIFIED (503-mapping itself confirmed by direct route-source read, not a dedicated route test) |
| `INTERNAL_ERROR` | every route's catch-all | n/a | n/a — no test deliberately triggers an uncaught internal error | IMPLEMENTED (no dedicated test — standard for a catch-all branch) |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Anonymous lazy-generation bound (OR-gate) | § 1.1 | `media-rendition-route.test.ts` | `"...an older, never-generated transform version is a short-TTL 404..."` | VERIFIED |
| Blob dedup vs. new-row-per-upload | § 1.2 | `media-service.test.ts` | `"uploadMedia dedups identical bytes into one blob but two media rows"` | VERIFIED |
| Write-before-insert / unlink-after-delete-commit | § 2.1 | `blob-gc.test.ts` | `"write-before-insert / unlink-after-delete-commit ordering..."` | VERIFIED |
| GC phase ordering (tombstone -> delete -> unlink) | § 2.2 | `blob-gc.test.ts` | `"runBlobGcDeletePass no-ops on a blob that was never tombstoned"` | VERIFIED |
| Lock acquisition FIFO ordering | § 2.3 | `blob-gc.test.ts` | `"withSha256Lock serializes calls for the same key (no interleaving)"` | VERIFIED |
| Default: `gc_grace` = 30 days | § 3 | `blob-gc.test.ts` | (indirect, via every grace-gating test) | TESTED (indirect) |
| Default: SVG excluded from upload allowlist | § 3 | `media-service.test.ts` | (indirect — allowlist tested via the "disallowed content type" case, not an SVG-specific case) | TESTED (indirect) |
| Limit: transform dims `[1, 8000]` | § 4 | `transform-registry.test.ts` | `"registerTransform rejects invalid params..."` | VERIFIED (not boundary-exact — see §6.2) |
| Dedup: blob-level only, never media-record-level | § 5.1 | `media-service.test.ts` | `"uploadMedia dedups identical bytes into one blob but two media rows"` | VERIFIED |
| Tie-break: concurrent transform registration | § 6.1 | `transform-registry.test.ts` | `"registerTransform serializes concurrent registrations of the same name into strictly increasing..."` | VERIFIED |
| Single-flight rendition generation | § 6.2 | `rendition-service.test.ts` | `"...five concurrent requests...exactly one transform call (adversarial fan-in)"` | VERIFIED |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

*(None — every REQ-* in `feature.spec.md` has a real implementation, including the two "disclosed gap" requirements REQ-39/REQ-40, whose "implementation" IS the documented absence of a behavior.)*

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| — | — | — | — |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| AC-48 (REQ-39) | The authz-absence gap has no test in either direction (no test asserts a 403 that would currently fail, nor one asserting 200-for-anyone that would currently pass-but-shouldn't-need-to-exist) — adding a red test for the desired 403 behavior belongs to the OQ-01 follow-up implementation pass, not this documentation pass. | Next Media-touching implementation pass (OQ-01) | Coordinator/human |
| REQ-41/AC-50, REQ-42/AC-51 | No frontend component-level test exists for `Media.tsx` anywhere in this repo pass (consistent with every other admin-section `.tsx` file — none have dedicated component tests; backend/route coverage is exhaustive instead). | Not scheduled — matches standing repo convention, not a Media-specific gap | N/A |
| Exact-boundary values named in `behavior.spec.md` §7 (upload byte cap at exactly 10 MiB, transform dimension at exactly 8000, `gc_grace` at the exact millisecond boundary) | Only the "over the boundary" side is directly tested; the "exactly at the boundary" side is confirmed correct by direct source read (`>` vs `>=` operators) but has no dedicated boundary test. | Low priority — behavior is unambiguous from the source, a nice-to-have hardening test | TDD Agent (if/when this feature gets a dedicated TDD pass) |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| `INTERNAL_ERROR` | No test deliberately forces an uncaught exception on any media route (standard for a generic catch-all — matches every sibling admin section's precedent, e.g. `015-integrations`). | Not scheduled — standing repo convention | N/A |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| GAP-ENTRIES, GAP-ORIGIN, GAP-INGRESS, GAP-ENTRYREFS, GAP-EPOCHS, GAP-SCHEDULER, GAP-DECLARER, GAP-OUTOFPROCESS, GAP-PRESIGN, GAP-REMOTE (see `feature.spec.md` Scope) | Future implementation spec (OQ-03) | Explicitly named, ADR-027-consistent deferrals — not requirements of THIS as-built spec, which documents the walking skeleton as shipped | ADR-027 itself (each gap traces to a named ADR-027 deferral or an explicitly-scoped-out task boundary recorded in `src/media/INFO.md`) |
| GAP-AUTHZ (REQ-39/REQ-40) | Next implementation pass (OQ-01/OQ-02) | Real, undisclosed-until-this-spec security gap — deferred to implementation, NOT because it is low priority, but because a spec-only pass cannot itself change route code | Coordinator/human (not yet approved — this is the open, unresolved recommendation of this spec pass) |

---

## 7. Untraced Requirements

*(Cross-check: every REQ-01..REQ-42 and every AC-01..AC-51 above appears in Section 1. None are missing.)*

| REQ/AC ID | Reason Not In Matrix |
|-----------|---------------------|
| — | — |

---

## 8. Traceability Completeness Checklist

- [x] All REQ-* from feature.spec.md appear in the Section 1 matrix
- [x] All AC-* from feature.spec.md appear in the Section 1 matrix
- [x] All INV-* from feature.spec.md appear in the Section 2 matrix
- [x] All EC-* from feature.spec.md appear in the Section 3 matrix
- [x] All error codes from errors.spec.md appear in the Section 4 matrix
- [x] All behavior rules from behavior.spec.md appear in the Section 5 matrix
- [x] Section 6.1 (unimplemented) is empty
- [x] Section 6.2 (untested) entries are all disclosed, low-priority, and non-blocking for an as-built documentation pass
- [x] Section 6.3 (untested error codes) entry is disclosed and matches standing repo convention
- [x] Section 7 (untraced) is empty

**[x] TRACEABILITY COMPLETE** — every requirement is either implemented-and-tested, or implemented-with-a-disclosed-and-justified test gap (never a silent gap). This spec documents shipped behavior; it does not certify new tests.

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Spec Agent | 2026-07-15 | As-built brownfield pass — see `spec-manifest.md` Brownfield References for every source file read |
| TDD Agent | — | — | Not dispatched this pass (documentation-only; no new tests certified) |
| Programmer Agent | — | — | Not dispatched this pass |
| Code Review Agent | — | — | Not dispatched this pass |
| Coordinator | — | — | Reserved for Planning Preflight |
