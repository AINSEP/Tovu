# Behavior Rules Spec: media-assets

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
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

**Purpose:** This file captures the deterministic, rule-based behavior in the real `media` library and its routes that is not fully expressed by the acceptance criteria alone — dedup rules, ordering rules, the GC grace formula, numeric bounds, and the anonymous-generation tie-break bound. All statements below describe real, already-shipped behavior (as-built), sourced directly from `src/media/*.ts` and its tests.

---

## EARS Syntax Guide

(See the provider template for the full pattern reference; statements below use `shall`/`WHEN`/`IF...THEN` per that convention.)

---

## 1. Precedence Rules

### 1.1 Anonymous Lazy-Generation Bound (ADR-027 §4 amplification guard)

**Situation:** A `GET /m/{assetId}/{transformName}.v{version}/...` request targets a registered `(name, version)` with no existing `AssetRenditionRecord`.

**Sources in precedence order (either being `true` is sufficient — this is an OR-gate, not a strict precedence order):**
1. `isReferencedByPublishedContent(...)` — stubbed, always `false` in this build (GAP-ENTRYREFS).
2. `isLatestTransformVersion(...)` — the effective bound in this build, since source 1 is always `false`.

**Example:**
- Scenario: `banner` is registered at v1 then re-registered at v2 (params changed). Neither version has been generated yet.
- Input: a request for v1 arrives.
- Result: `isLatestTransformVersion(name="banner", version=1)` is `false` (max is 2) and `isReferencedByPublishedContent` is `false` → generation is NOT allowed → `404` (short-TTL). A request for v2 → `isLatestTransformVersion` is `true` → generation proceeds → `200`.

**Test requirement:** Covered by `"media rendition route: an older, never-generated transform version is a short-TTL 404 ..., while the latest version generates on first request"`.

---

### 1.2 Blob Dedup vs. New-Row-Per-Upload

**Situation:** `uploadMedia` is called with bytes whose sha256 already has an `asset_blobs` row (any status) in the workspace.

**Sources in precedence order:**
1. Existing `asset_blobs` row for `(workspaceId, sha256)` — if found (`active` or `tombstoned`), no new bytes are written; a `tombstoned` row is resurrected to `active` in the same locked section.
2. No existing row — new bytes are written via `blobStore.put`, then a new `asset_blobs` row is inserted.

**This precedence governs bytes only, never the `media` row** — a brand-new `MediaRecord` (and a brand-new `"original"` `AssetRenditionRecord`) is created by every `uploadMedia` call regardless of which branch above ran.

**Test requirement:** Covered by `"uploadMedia dedups identical bytes into one blob but two media rows"` and `"uploadMedia resurrects a TOMBSTONED blob back to active instead of writing a duplicate"`.

---

## 2. Ordering Rules

### 2.1 Write-Before-Insert / Unlink-After-Delete-Commit (ADR-027 §5 INV-1a)

**Field used for ordering:** blob byte existence relative to `asset_blobs` row existence, and `asset_blobs` row removal relative to blob byte removal.

**Order:**
1. On upload: bytes are written (or dedup-resolved) BEFORE the `media` row is saved. A `media` row never exists without corresponding bytes.
2. On GC: the `blob_gc_journal` entry is written and the `asset_blobs` row is removed together (delete-pass), and ONLY AFTER that removal has committed does a later, separate unlink-pass remove the bytes.

**Invariant:** No code path in this build ever removes blob bytes before (or without) first removing the corresponding `asset_blobs` row via a committed delete-pass.

**Test requirement:** Covered by `"write-before-insert / unlink-after-delete-commit ordering: bytes survive the row delete and are only removed by a later unlink-pass"`.

### 2.2 GC Phase Ordering

**Context:** The three-phase blob-GC protocol must run in a fixed order per sha256.

**Order:** tombstone-pass (`tombstoneBlobIfUnreferenced`) → delete-pass (`runBlobGcDeletePass`, grace-gated + re-checked) → unlink-pass (`runBlobGcUnlinkPass`, journal-driven, live-row-re-check).

**Tie-break:** N/A — phases are sequential preconditions (delete-pass no-ops unless the row is already `tombstoned`; unlink-pass only acts on journal entries the delete-pass created), not competing candidates.

**Invariant:** No phase may skip its predecessor's gate — e.g., the delete-pass cannot act on a row that was never tombstoned (verified by `"runBlobGcDeletePass no-ops on a blob that was never tombstoned"`).

### 2.3 Lock Acquisition Ordering (FIFO per key)

**Context:** Multiple callers contend for the same `withSha256Lock`/`withTransformRegistryLock`/`withRenditionLock` key.

**Order:** Strict FIFO per key — each call's critical section runs only after every earlier-queued call for the same key has settled (succeeded or failed); different keys run fully concurrently with no ordering guarantee relative to each other.

**Invariant:** Verified by `"withSha256Lock serializes calls for the same key (no interleaving)"` and `"...runs different keys fully concurrently"`.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `maxUploadBytes` | `uploadMedia` optional | `DEFAULT_MAX_UPLOAD_BYTES` = 10 MiB (`10 * 1024 * 1024`) | A conservative walking-skeleton cap; this build's stand-in for the real streaming-size-cap half of the deferred `MediaIngressPolicy`. |
| `allowedMimeTypes` | `uploadMedia` optional | `DEFAULT_ALLOWED_MIME_TYPES` = `{image/jpeg, image/png, image/webp, image/gif}` | SVG is deliberately excluded — ADR-027 §6 requires sanitization at ingest before SVG is safe to store, and no sanitizer is built in this pass, so it is rejected rather than accepted unsanitized. |
| `MediaRecord.status` (new upload) | `uploadMedia` | `"active"` | New uploads are immediately usable; there is no draft/pending review state in this build. |
| `MediaRecord.version` (new upload) | `uploadMedia` | `1` | Matches the version-increments-on-write convention every mutating write (update/trash) then bumps from. |
| `AssetRenditionRecord` created by upload | `uploadMedia` | `transformName: "original"`, `version: 1` | A trivial passthrough rendition pointing at the source blob, so every asset has at least one resolvable rendition immediately, without waiting for any transform registration. |
| `TransformParams.fit` (implicit) | `SharpImageTransformer.transform` when `width`/`height` set but `params.fit` absent | `"cover"` | Matches `sharp`'s own most common default behavior; only applied when at least one dimension is set. |
| `gc_grace` | `resolveGcGraceMs` | `DEFAULT_GC_GRACE_MS` = 30 days (`30 * 24 * 60 * 60 * 1000` ms) | ADR-027 §5's stated default retention window; the snapshot-age conjunct is always `undefined` in this build so this default is currently the only effective value. |
| `runBlobGcUnlinkPass`'s "batch size" | n/a | drains ALL journal entries for the workspace in one call, no page size | Walking-skeleton scale — acceptable since nothing schedules this automatically anyway (GAP-SCHEDULER). |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| Upload byte size | ≤ `DEFAULT_MAX_UPLOAD_BYTES` (10 MiB) or injected override | `media-service.ts` (server) | Rejected with `MediaValidationError`/`400`, not silently truncated. |
| Minimum upload byte size | > 0 bytes | `media-service.ts` (server) | Empty file rejected with `MediaValidationError`/`400`. |
| Transform `width`/`height` | integer in `[1, 8000]` (`MAX_TRANSFORM_DIMENSION_PX`) when provided | `assertValidTransformParams` (registration time only) | Values outside range or non-integer rejected with `TransformValidationError`. This bounds the registered *definition*, not per-request caller input — there is no caller-supplied-dimension surface at all (ADR-027 §4's no-arbitrary-`?w=&h=` rule holds structurally, not just by validation). |
| `fit` requires both dimensions | `fit` set implies `width` AND `height` both set | `assertValidTransformParams` | Otherwise rejected with `TransformValidationError`. |
| `MAX_DELIVERY_ATTEMPTS`-equivalent for GC delete-pass retries | n/a — no attempt counter exists; `runBlobGcDeletePass` is idempotently safe to call any number of times (no-ops once ineligible) | n/a | Unlike `015-integrations`'s delivery worker, GC has no retry/backoff/dead-letter concept — every pass is a pure, re-runnable predicate check. |
| `gc_grace` minimum | `DEFAULT_GC_GRACE_MS` (30 days), never lower in this build | `resolveGcGraceMs` | The snapshot conjunct can only ever raise this value (`Math.max`), never lower it below the 30-day default. |
| Blob storage key shard width | first 2 hex characters of the sha256 | `computeBlobStorageKey` | Fixed, not configurable in this build. |
| Admin route request rate | unbounded (no rate limiter attached) | n/a | See `api.spec.md` §3, `NONE` profile. |

---

## 5. Deduplication Rules

### 5.1 What Counts as a Duplicate (blob-level only — NOT media-record-level)

A newly-uploaded blob is considered a duplicate of an existing blob if and only if:
1. They share the same `workspaceId` (dedup is strictly per-workspace — no cross-tenant byte sharing, ADR-027 §3).
2. Their sha256 hash is bit-for-bit identical.

**Not deduplicated at all:** `MediaRecord` rows. Uploading the same bytes N times always creates N distinct `MediaRecord` rows (N "library entries"), even though only one blob's bytes are ever stored. There is no name/title-based duplicate detection anywhere in this feature (unlike the generic-resource template example's name+parentId dedup) — this is a real, deliberate difference from the template's default assumption, not an omission.

### 5.2 How Duplicates Are Handled

**At upload time:** The dedup check-then-act sequence (`blobRepo.findByHash` → write-or-resurrect) runs entirely inside `withSha256Lock(sha256, ...)`, so it cannot interleave with a concurrent GC delete-pass or another concurrent upload for the same hash.

**A `tombstoned` match is resurrected, not treated as absent** — this is the one case where "duplicate" handling has a side effect beyond "skip the write": it also cancels a pending GC.

**User-facing behavior:** None — dedup is fully transparent to the uploading admin; the response always looks like a normal successful upload regardless of which branch ran.

### 5.3 Idempotency vs. Deduplication

Distinct concepts here too: `trashMedia` and `tombstoneBlobIfUnreferenced` are *idempotent* (repeat calls are safe no-ops), which is different from blob *deduplication* (repeat uploads of identical bytes still mint new `MediaRecord` rows every time — never idempotent at the media-record level, since there is no idempotency-key mechanism on the upload route at all).

---

## 6. Tie-Break Logic

### 6.1 Concurrent Registration of the Same Transform Name

**When does this apply:** Two `registerTransform` calls for the same `(workspaceId, name)` arrive concurrently.

**Tie-break rule:** `withTransformRegistryLock` keyed `(workspaceId, name)` makes the calls strictly sequential; whichever call acquires the lock first reads the current max version and inserts `max + 1`; the second call then reads the NEW max (including the first call's just-inserted row) and inserts one higher than that. There is no scenario where both calls could compute the same version — the lock removes the race entirely rather than resolving a collision after the fact.

**Rationale:** A version-numbering race would violate the append-only invariant (INV-07) outright (two rows at the same version), so this is closed structurally (serialization) rather than by a resolvable tie-break.

**Invariant:** Verified by `"registerTransform serializes concurrent registrations of the same name into strictly increasing..."`.

### 6.2 Concurrent Rendition Generation Requests (single-flight, not a tie-break per se)

**When does this apply:** N concurrent requests for the same not-yet-generated `(sha256, transformName, version)`.

**Rule:** The first to acquire `withRenditionLock` generates; every other request, once it acquires the lock in turn, performs a double-checked `renditionRepo.findOne` and finds the winner's row already present, reusing it instead of calling `imageTransformer.transform` again. There is no "winner" in the competitive sense — all N requests eventually succeed with identical bytes.

**Invariant:** Exactly one `imageTransformer.transform` call occurs regardless of N. Verified by `"five concurrent requests for the same ungenerated rendition still produce exactly one transform call (adversarial fan-in)"`.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| Upload byte length is exactly `DEFAULT_MAX_UPLOAD_BYTES` (10 MiB, the boundary) | Accepted — the check is `byteLength > maxUploadBytes`, strictly greater-than, so the exact cap value passes. | Not directly tested at the exact boundary in this pass (only "over the cap" is asserted); a boundary test is a coverage gap, not a behavior gap — see `traceability.spec.md` §6.2. |
| Transform `width` is exactly `8000` (`MAX_TRANSFORM_DIMENSION_PX`) | Accepted — the check is `value > MAX_TRANSFORM_DIMENSION_PX`. | Not directly tested at the exact boundary; see `traceability.spec.md` §6.2. |
| Transform `width: 8001` | Rejected with `TransformValidationError`. | Yes (covered by the general "rejects invalid params" test, though not necessarily this exact boundary value). |
| `gc_grace` elapses to the exact millisecond boundary | `runBlobGcDeletePass`'s check is `elapsedMs < graceMs` (strictly less-than blocks), so exact-boundary elapsed time is treated as eligible. | Not directly tested at the exact millisecond boundary. |
| Two batch items in the same `uploadMedia` call share bytes | N/A — `uploadMedia` has no batch/multi-file mode; this scenario cannot occur. | N/A |
| All precedence sources absent for anonymous-generation bound (neither latest nor referenced) | Generation is NOT allowed; the route returns `404` (short-TTL cache). | Yes — see §1.1's test requirement. |
| Rate limit window resets | N/A — no rate limiting exists on any media route (`api.spec.md` §3). | N/A |
| A `withSha256Lock` critical section throws | The lock is released regardless (the tail promise settles on both success and failure paths), and the next queued caller for the same key still runs. | Yes — `"withSha256Lock does not let one key's rejection poison later calls on the same key"`. |
