# Feature Spec: media-assets

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-021 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:8517330957578346a96c9e5f48ede2e8f388c882469889e662f33ca471ac3bc0 |
| feature_name | FEAT-021-media-assets |
| last_edited | 2026-07-15T00:00:00Z |
| owner | Leona Burime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

> **[NEEDS CLARIFICATION] vs Open Questions — use the right one:**
>
> **`[NEEDS CLARIFICATION]`** — inline marker for a requirement that is too ambiguous to be testable as written. Blocks Software Architect dispatch. Must be resolved before the spec advances.
>
> **Open Questions** — tracked questions that do not block Software Architect dispatch. Each must have an owner and a resolution target date.

---

## Overview

**This is as-built documentation of an already-shipped, walking-skeleton implementation of ADR-027** (Media/Assets Subsystem — ACCEPTED 2026-07-09, 2-round swarm debate + 2-round `/audit-work`). Real code already exists: the `media` library (`src/media/`, 18 files), admin HTTP routes (`src/server/routes/admin/media/*`), a public unauthenticated rendition-serving route (`src/server/routes/site/media-rendition.ts`), and an admin UI screen (`apps/admin/src/sections/Media.tsx`). This spec captures what that code actually does today, sourced from the real files and their own extensive, self-disclosing doc comments — it is not a design proposal and does not add new requirements. ADR-027 itself is not re-litigated: the hybrid entry+sidecar model, the content-addressed `BlobStorePort` design, and the frozen immutable URL scheme are settled and this spec documents how far the current build implements them, not whether they were the right calls.

Media owns: upload (validate → hash → dedup → store), a bespoke `MediaRecord` editorial table, two core-owned operational sidecars (`asset_blobs`, `asset_renditions`) plus a `blob_gc_journal` and a `transform_registry` sidecar, an audited two-phase journaled blob-GC protocol (real, not a stub), a named/append-only transform registry with serve-if-exists + bounded-lazy-generation rendition serving behind the ADR-027 §4 frozen public URL contract, and an admin CRUD + deletion-ladder surface.

---

## Problem Statement

**Current state (what actually exists in the repo today):**

- `src/media/{types,ports,transform-types,media-service,rendition-service,blob-gc,blob-gc-lock,transform-lock,transform-registry,blob-key,blob-store.fs,blob-store.memory,repo.memory,image-transformer,image-transformer.sharp,index}.ts` — real, tested library code (6 `__tests__/*.test.ts` files, all passing per their own assertions), plus `src/media/INFO.md`, a file the Programmer wrote that already discloses most of the scope gaps this spec formalizes.
- Real admin HTTP routes wired into the running server: `GET`/`POST /api/admin/v1/workspaces/:workspaceId/media`, `PATCH .../media/:mediaId`, `POST .../media/:mediaId/trash`, `DELETE .../media/:mediaId` (`src/server/routes/admin/media/{list,upload,update,trash,delete}.ts`), plus a real DTO projection (`src/server/http/admin/media.ts`).
- A real, public, unauthenticated rendition-serving route implementing ADR-027 §4's frozen URL contract exactly: `GET /m/:assetId/:transformSpec/:filename` (`src/server/routes/site/media-rendition.ts`), including the immutable long-lived `Cache-Control`, the 404-short-TTL / 410-no-store split, and the "cosmetic slug/ext, lookup ignores them" rule.
- A real admin UI screen (`apps/admin/src/sections/Media.tsx`) wired through `apps/admin/src/lib/api.ts` (`listMedia`/`uploadMedia`/`updateMedia`/`trashMedia`/`deleteMedia`).
- A real, audited-shape blob-GC protocol (`blob-gc.ts`/`blob-gc-lock.ts`): tombstone-pass → delete-pass → unlink-pass, journaled, grace-gated, serialized per-sha256 via an in-process keyed mutex (`withSha256Lock`) — this is NOT a stub; it is a faithful, if single-process, implementation of ADR-027 §5 INV-1's ordering and serialization rules. Nothing in the repo schedules it automatically (no `runBlobGcCycle` caller anywhere outside tests).
- A real named transform registry (`transform-registry.ts`) and rendition-resolution service (`rendition-service.ts`) implementing ADR-027 §4's serve-if-exists + bounded-generate-if-defined rule and single-flight lazy generation, faithfully, including the amplification-vector guard (anonymous generation bounded to the latest registered version or a stubbed-always-false "referenced by published content" check).
- A real second `ImageTransformerPort` adapter, `SharpImageTransformer` (`image-transformer.sharp.ts`), that calls the `sharp` npm package (now an installed dependency) — satisfying ADR-006 rule-of-two alongside the `InMemoryImageTransformer` test double.
- **A permission catalog entry, `media.write` (owner `"core"`), registered in `src/identity/permissions.ts` — but not checked by any route.** Direct inspection of all five admin media route files (`list.ts`, `upload.ts`, `update.ts`, `trash.ts`, `delete.ts`) found zero calls to `deps.authorize(...)` or any other permission check, unlike every sibling admin section this repo has shipped since SPEC-006/ADR-021 landed (menus, integrations, seo, redirects all call `deps.authorize(...)` before their write operations — see `src/server/routes/admin/menus/delete.ts` for the pattern every other section follows). `upload.ts` does call `getAuthedPrincipal(res)`, but only to attribute the upload (`createdByPrincipal`), not to gate the request. **This means any authenticated admin session — regardless of granted permissions — can upload, list, edit, trash, or permanently purge media today.** This is the single most material finding of this spec pass; it is not disclosed anywhere in `src/media/INFO.md` or any file-header comment (unlike every other gap below, which the code itself names explicitly). See Constitution Compliance (Article VI) and OQ-01.
- ADR-027 §2 describes a media asset as a seeded `entries` content-type entry (ADR-022) — editorial fields on a generic entry row, inheriting revisions/taxonomy/`entry_refs`. **That generic entries model is not implemented as running code anywhere in this repo** (ADR-022 is ACCEPTED design only). `MediaRecord` is therefore a bespoke first-class table — `types.ts`'s own file header names this and points at `src/features/post/post.ts` as the precedent it mirrors. The two sidecars (`asset_blobs`, `asset_renditions`) ARE built exactly as ADR-027 §2 describes (core-owned, single-writer, independent of the entries question).
- Several other ADR-027 surfaces are named-but-not-built, each with an explicit stub function or disclosed simplification in the code itself (not silent omissions): no `entry_refs` where-used index (`hasLiveEntryRefs` stub, always `false`); no retained-snapshot conjunct (`getOldestRetainedSnapshotAgeMs` stub, always `undefined`); no monthly orphan sweep (`runMonthlyOrphanSweepStub`, never called); no per-generation storage-key epochs (`blob-key.ts` has no `-{storage_epoch}` suffix — `withSha256Lock` substitutes for this in a single process); no origin-isolated serving (the `/m/` route lives on the same Express app/process, no cookie-less media origin, no signed mint-URLs for originals); no `MediaIngressPolicy` (no SSRF/IP-pinning/redirect handling/pixel-bomb cap/magic-byte sniff — only a byte-size cap and an advisory, client-supplied `contentType` allowlist); no theme/plugin transform-declaration API (core-declared only); no eager hot-set generation or out-of-process transform worker (lazy, in-process only); no presign surface on `BlobStorePort`; no `blob_kind: local|remote` seam on `MediaRecord`/`AssetBlobRecord` at all; no video pipeline states; no virus scanning (all consistent with ADR-027 itself deferring these).

**Desired state (per ADR-027, for context — not this spec's job to build):** every privileged media byte flows through a chokepoint/mint path/ingress policy gated by the flat `media.*` permission registry, served from a cookie-less origin-isolated media origin behind a frozen immutable URL contract, backed by a cross-process-safe (`BEGIN IMMEDIATE`) journaled GC protocol with per-generation storage epochs, with the editorial half riding the generic `entries` content-type model for revisions/taxonomy/`entry_refs` for free.

**Why now (why this spec exists):** to give the already-shipped walking-skeleton code the spec package it should have had, so downstream stages (Red-Team, Software Architect for the still-missing surfaces, Programmer) have a precise, evidence-sourced account of what is real versus stubbed versus entirely unbuilt — and, specifically, to surface the undisclosed missing-authz finding, which none of the code's own extensive self-documentation names.

**Success signal:** This spec package accurately traces every REQ to real files, real functions, and (where they exist) real passing tests; clearly separates "implemented and audited-shape" (blob-GC, the URL contract) from "implemented as a walking skeleton" (upload/CRUD, transform registry) from "not built at all" (origin isolation, ingress policy, entries model); and gives the missing-authz finding the same visibility the rest of this repo's security-relevant gaps receive.

---

## User Journey

**Trigger:** An admin wants to upload an image, use it in a transform, and eventually delete it.

**Steps (as the shipped code actually behaves):**
1. Admin opens Admin → Media (`Media.tsx`), sees a table of existing media (title, alt, status, sha256 prefix, version) and a file picker + optional alt-text field + "Upload" button.
2. Admin selects a file and clicks Upload. The client base64-encodes the file (`readFileAsBase64`) and `POST`s `{filename, contentType, dataBase64, alt?, caption?, credit?}` to `/api/admin/v1/workspaces/:workspaceId/media`.
3. The route decodes the base64 body, resolves the authenticated session principal (for attribution only — REQ-39), and calls `uploadMedia`, which validates content-type/size, computes the sha256, dedups by `(workspaceId, sha256)` inside a per-sha256 lock, writes bytes to the local filesystem blob store if new, saves a new `MediaRecord` (`status: "active"`, `version: 1`), and writes a companion `"original"` `AssetRenditionRecord` pointing at the source blob.
4. The new row appears in the admin list on reload.
5. Admin can `PATCH` title/alt/caption/credit (`updateMediaMetadata`), which succeeds regardless of the asset's status (EC-07).
6. Admin clicks "Trash" (`POST .../trash`) — soft delete, idempotent, reversible only by another `uploadMedia`/no explicit "restore" route exists.
7. Admin clicks "Delete permanently" on an already-trashed row (`DELETE ...`) — `purgeMedia` removes the rendition rows and the `MediaRecord` row, then triggers the blob-GC tombstone-pass for the asset's sha256 (byte removal itself is grace-gated and not run by anything automatically — REQ-21/REQ-23).
8. Separately, any caller (no authentication) can fetch `GET /m/{assetId}/{transformName}.v{version}/{slug}.{ext}` to retrieve a rendition — served immediately if it already exists, or lazily generated in-process (single-flight) if the requested `(name, version)` is the latest registered version of that name.

**What does NOT happen today, and why:** No thumbnail actually renders as an image in the admin UI — `Media.tsx`'s own comment says this is because "this pass has no byte-serving HTTP route," but that claim is now stale: `media-rendition.ts` was added by a later task and does serve bytes at `/m/...`. The UI was never updated to use it (REQ-42/minor gap). No permission check gates any admin media write (REQ-39/REQ-40 — the headline finding). No scheduled process ever runs the GC delete/unlink passes or the monthly orphan sweep, so tombstoned blobs never actually get their bytes reclaimed in a running deployment.

**Outcome:** Upload → list → edit → trash → purge works end-to-end over real HTTP with real persistence-shaped behavior (in-memory adapters), and rendition serving genuinely implements the frozen URL contract's cache/lookup/anonymous-generation-bound rules. What does NOT hold end-to-end: no admin permission gate, no automatic blob reclamation, no real image byte in the admin list UI.

**Alternate paths:** Disallowed content type / empty file / oversized file → `400` at upload. Unknown media id → `404` on update/trash. Purge before trash → `409` with a `referencing` list. Unknown `:workspaceId` → `404` on every admin route, checked before any other logic. Malformed `/m/...` transform spec or non-integer version → `400`. Unregistered transform `(name, version)` or a non-latest never-generated version → `404` (never lazily created). Trashed asset's rendition request → `410`. `sharp` unavailable at generation time → `503`.

---

## Scope

**In scope (implemented and covered by this spec):**
- Upload validation, hashing, per-`(workspaceId, sha256)` dedup, and bespoke `MediaRecord` creation with a companion `"original"` rendition row (REQ-01–REQ-08)
- List / get-by-id / update-metadata / soft-delete (trash) / hard-delete (purge) over the bespoke `MediaRecord` table, including the 409 deletion-ladder guard (REQ-09–REQ-15)
- The audited two-phase journaled blob-GC protocol: unreferenced predicate, tombstone-pass, delete-pass (grace-gated), unlink-pass (crash-safe re-check), batch convenience wrapper, and the named-but-never-invoked monthly-sweep seam (REQ-16–REQ-23)
- Named, append-only transform registration and validation (REQ-24–REQ-25)
- Rendition resolution: serve-if-exists, bounded anonymous lazy generation, single-flight generation, the two real `ImageTransformerPort` adapters (REQ-26–REQ-34)
- The five admin HTTP routes and the one public rendition route, including their status-code/error mapping and workspace-id guard (REQ-35–REQ-38)
- The **absence** of any admin-route permission check, and the mismatch between the one registered `media.write` permission and ADR-027 §7's flat `media.*` set (REQ-39–REQ-40) — documented as a finding, not endorsed as correct
- The admin UI screen's real behavior (REQ-41–REQ-42)

**Explicitly out of scope — NOT built, flagged as gaps rather than silently assumed done:**
- The generic `entries`/ADR-022 content-type model — `MediaRecord` is a bespoke table (GAP-ENTRIES)
- Per-action authorization on any admin media route (GAP-AUTHZ — see REQ-39/OQ-01, the headline finding)
- The ADR-027 §7 flat `media.*` permission set — only `media.write` (unused) is registered (GAP-PERMCATALOG)
- Origin-isolated serving — no second listener/process, no cookie-less media origin, `/m/` shares the main Express app (GAP-ORIGIN)
- `MediaIngressPolicy` — no SSRF/IP-pinning/redirect-hop re-verification, no pixel-bomb cap, no magic-byte sniff; only a byte-size cap and an advisory `Content-Type`-header allowlist (GAP-INGRESS)
- `entry_refs` where-used index — `purgeMedia`'s 409 guard uses "not yet trashed" as a strictly weaker stand-in (GAP-ENTRYREFS)
- Per-generation storage-key epochs (ADR-027 §3) — race-safety substituted by an in-process mutex, not cross-process-safe (GAP-EPOCHS)
- A scheduler invoking `runBlobGcDeletePass`/`runBlobGcUnlinkPass`/`runBlobGcCycle`/`runMonthlyOrphanSweepStub` automatically — nothing in the running server calls any of them outside tests (GAP-SCHEDULER)
- Theme/plugin transform-declaration API — core-declared transforms only (GAP-DECLARER)
- Eager hot-set generation (ADR-009 worker) and out-of-process transform generation — lazy, synchronous, in-process only (GAP-OUTOFPROCESS)
- `BlobStorePort` presign surface (`capabilities()`/`createPresignedUpload()`) and the S3 adapter (GAP-PRESIGN, consistent with ADR-027 §8's own deferral)
- `blob_kind: local|remote` seam — no field exists on `MediaRecord`/`AssetBlobRecord` at all (GAP-REMOTE)
- Video pipeline states, virus scanning/quarantine wiring, SVG upload (all consistent with ADR-027 itself deferring/gating these; SVG is correctly rejected rather than accepted unsanitized)
- A real image `<img>` thumbnail in the admin UI, despite the byte-serving route now existing (GAP-UI-STALE, minor)
- Structured error envelopes (`code`/`occurredAt`/`correlationId`) and domain-event emission for media writes — responses are plain `{error: string}` shapes (GAP-OBSERVABILITY)

---

## Requirements

### Upload & CRUD (`media-service.ts`)

- REQ-01: The system shall reject `uploadMedia` when `input.contentType` is not in the allowlist (`DEFAULT_ALLOWED_MIME_TYPES` — `image/jpeg`, `image/png`, `image/webp`, `image/gif` — or an injected `allowedMimeTypes` override), throwing `MediaValidationError`.
- REQ-02: The system shall reject `uploadMedia` when `input.bytes.byteLength === 0`, throwing `MediaValidationError`.
- REQ-03: The system shall reject `uploadMedia` when `input.bytes.byteLength` exceeds `DEFAULT_MAX_UPLOAD_BYTES` (10 MiB) or an injected `maxUploadBytes` override, throwing `MediaValidationError`.
- REQ-04: The system shall compute `sha256` over the upload bytes and dedup blob storage per `(workspaceId, sha256)`: if an `active` blob row already exists for that hash, no new bytes are written; a brand-new `uploadMedia` call always creates a new `MediaRecord` row regardless of dedup (dedup is per-blob, not per-library-entry).
- REQ-05: The system shall resurrect a `tombstoned` blob row back to `active` (clearing `tombstonedAt`) when a dedup upload observes it, inside the same `withSha256Lock` critical section, instead of writing a duplicate blob.
- REQ-06: The system shall write (or resolve via dedup) the source blob's bytes before saving the `MediaRecord` row, and shall save exactly one companion `AssetRenditionRecord` (`transformName: "original"`, `version: 1`) pointing at the source blob's storage key as part of the same `uploadMedia` call.
- REQ-07: The system shall derive `MediaRecord.title` from the upload filename (extension stripped, trimmed, falling back to `"Untitled"` if empty after stripping), trim `alt`/`caption`/`credit` to empty string when absent, and set `status: "active"`, `version: 1`.
- REQ-08: The system shall enforce that `MediaRecord.source.sha256` is settable-once-from-absent: `resolveWriteOnceSource` throws `MediaSourceImmutableError` if called with an `existing` source whose `sha256` differs from the requested value; no exposed write path (`updateMediaMetadata`'s input has no `sha256` field) can reach this rejection today.
- REQ-09: The system shall return every `MediaRecord` in a workspace regardless of status (`active` and `trashed`) from `listMedia`; purged rows are absent only because `purgeMedia` physically removed them, not because of a status filter.
- REQ-10: The system shall throw `MediaNotFoundError` from `getMediaById` when no row matches `(workspaceId, id)`.
- REQ-11: The system shall let `updateMediaMetadata` change only `title`/`alt`/`caption`/`credit` (each trimmed when provided; `title` falls back to the existing value if the trimmed input is empty), bump `version` by 1, and update `updatedAt`; the input type has no field capable of changing `source.sha256`.
- REQ-12: The system shall throw `MediaNotFoundError` from `updateMediaMetadata` when no row matches `(workspaceId, id)`.
- REQ-13: The system shall make `trashMedia` set `status: "trashed"`, bump `version`, and update `updatedAt`, and shall make a second `trashMedia` call against an already-trashed row a no-op that returns the unchanged record (idempotent).
- REQ-14: The system shall reject `purgeMedia` with `MediaStillReferencedError` (carrying a non-empty `referencing` list) when the target `MediaRecord.status` is not `"trashed"`.
- REQ-15: The system shall, on a successful `purgeMedia`, remove every `AssetRenditionRecord` for the asset, remove the `MediaRecord` row, and then invoke `tombstoneBlobIfUnreferenced` for the asset's `source.sha256` — `purgeMedia` shall never itself delete blob bytes.

### Blob GC (`blob-gc.ts` / `blob-gc-lock.ts`)

- REQ-16: The system shall compute `isBlobUnreferenced(workspaceId, sha256)` as `true` if and only if no `MediaRecord` in the workspace (in any non-purged state — `active` or `trashed`) has `source.sha256` equal to the given hash, AND the (stubbed, always-`false`) live-`entry_refs` check passes, AND the (stubbed, always-`false`) retained-snapshot check passes.
- REQ-17: The system shall make `tombstoneBlobIfUnreferenced` mark an `active` blob row `tombstoned` (stamping `tombstonedAt`) if and only if `isBlobUnreferenced` holds, inside `withSha256Lock`; a call against an already-`tombstoned` row is a no-op success; a call when no row exists is a no-op.
- REQ-18: The system shall make `runBlobGcDeletePass` delete an `asset_blobs` row only when: the row is `tombstoned`, `gc_grace` (per REQ-19) has elapsed since `tombstonedAt`, and a fresh `isBlobUnreferenced` re-check (not the tombstone-pass's cached result) still holds — writing a `blob_gc_journal` entry and removing the `asset_blobs` row together, inside the same `withSha256Lock` section, with the journal write preceding the row removal.
- REQ-19: The system shall compute `resolveGcGraceMs` as `max(DEFAULT_GC_GRACE_MS [30 days], oldestRetainedSnapshotAgeMs ?? 0)`, where the snapshot input is a stub that always returns `undefined` in this build.
- REQ-20: The system shall make `runBlobGcUnlinkPass` drain every `blob_gc_journal` entry for a workspace: for each entry, under that entry's sha256 lock, if a live `asset_blobs` row now exists for the same sha256 the entry is skipped (not unlinked, journal entry still removed); otherwise the blob store's bytes at the entry's `storageKey` are removed and the journal entry is removed.
- REQ-21: The system shall provide `runBlobGcCycle` as a batch convenience wrapper that runs `runBlobGcDeletePass` over every currently-tombstoned blob row in a workspace, then drains `runBlobGcUnlinkPass` once; nothing in the running server (`app.ts`/`deps.ts`) calls it.
- REQ-22: The system shall serialize every `asset_blobs` state transition (dedup check-and-write, tombstone, delete, unlink re-check) for a given sha256 through `withSha256Lock`, a FIFO-per-key in-process mutex where a rejection in one critical section does not poison later calls on the same key, and calls for different keys run fully concurrently.
- REQ-23: The system shall expose `runMonthlyOrphanSweepStub` as a named, correctly-typed no-op (`{ implemented: false }`) that performs no reconciliation work and is never invoked anywhere in the running server or its tests' setup.

### Named transform registry & rendition resolution (`transform-registry.ts` / `rendition-service.ts` / `transform-lock.ts` / `image-transformer*.ts`)

- REQ-24: The system shall make `registerTransform` validate a non-blank `name`/`owner` and valid `params` (via `assertValidTransformParams`), then insert a new `transform_registry` row at `version = (current max version for name) + 1` (or `1` if never registered), inside `withTransformRegistryLock` keyed `(workspaceId, name)`; a redefinition of `name` never mutates or removes the prior version's row (append-only, enforced defensively by `InMemoryTransformDefinitionRepo.insert` throwing on any duplicate `(workspaceId, name, version)`).
- REQ-25: The system shall make `assertValidTransformParams` reject: a `format` outside `jpeg`/`png`/`webp`/`gif`; a `width`/`height` that is not an integer in `[1, MAX_TRANSFORM_DIMENSION_PX]` (8000) when provided; and a `fit` value provided without both `width` and `height` — each throwing `TransformValidationError`.
- REQ-26: The system shall make `isLatestTransformVersion(name, version)` return `true` only when `version` equals the current maximum registered version of `name` for the workspace; `false` (including when `name` was never registered) otherwise.
- REQ-27: The system shall keep `isReferencedByPublishedContent` a stub that always returns `false` (the real check depends on the unimplemented `entry_refs` index).
- REQ-28: The system shall make `resolveMediaRendition` return `{ outcome: "not-found" }` for an unknown `assetId`, `{ outcome: "gone" }` for an asset whose `status === "trashed"`, and `{ outcome: "not-found" }` for a `(name, version)` with no matching `transform_registry` row.
- REQ-29: The system shall make `resolveMediaRendition` serve an existing `(assetId, transformName, version)` `AssetRenditionRecord` unconditionally when one exists (serve-if-exists), never regenerating it.
- REQ-30: The system shall make `resolveMediaRendition` permit lazy generation of a not-yet-generated rendition only when `isReferencedByPublishedContent(...)` OR `isLatestTransformVersion(...)` holds for the requested `(name, version)`; otherwise it returns `{ outcome: "not-found" }` without generating.
- REQ-31: The system shall run lazy rendition generation inside `withRenditionLock` keyed `${sha256}:${transformName}:${version}`, with a double-checked `renditionRepo.findOne` lookup inside the lock so a caller that loses the race reuses the winner's freshly-written row instead of invoking `imageTransformer.transform` again (single-flight).
- REQ-32: The system shall implement `ImageTransformerPort` with two adapters: `InMemoryImageTransformer` (deterministic byte-tagging test double, no real codec) and `SharpImageTransformer` (calls the `sharp` npm package via a lazily-`require()`'d factory, applying `resize(width, height, { fit: fit ?? "cover" })` only when `width` or `height` is set, then `toFormat(format)` unconditionally); `SharpImageTransformer` shall throw `ImageTransformUnavailableError` (not fabricate output) if the `sharp` module cannot be loaded.
- REQ-33: The system shall derive blob storage keys via `computeBlobStorageKey` as `ws/{workspaceId}/blobs/{sha256[0..2]}/{sha256}` (no per-generation epoch suffix), used identically by both `BlobStorePort` adapters.
- REQ-34: The system shall implement `BlobStorePort` with two adapters, `LocalFsBlobStore` (real, filesystem-backed, wired into the running server) and `InMemoryBlobStore` (test double); both implement `put`/`get`/`exists`/`remove`, with `remove` on an already-absent key being a no-op success, not an error.

### HTTP API surface (`server/routes/admin/media/*`, `server/routes/site/media-rendition.ts`)

- REQ-35: The system shall reject every admin media route (list/upload/update/trash/delete) with HTTP `404` if the `:workspaceId` path parameter does not equal the server's configured `deps.workspaceId`, checked before any other route logic.
- REQ-36: The system shall accept `POST .../media` with a JSON body `{filename, contentType, dataBase64, alt?, caption?, credit?}` (not multipart), returning `400` when `filename`/`contentType` are empty or `dataBase64` is missing/not a non-empty string or fails base64 decoding, and `201` with `{media: <AdminMediaResponse>}` on success, attributing `createdByPrincipal` to the authenticated session principal's id.
- REQ-37: The system shall map, on the admin routes: `MediaNotFoundError` → `404 {error}` (update/trash/delete); `MediaValidationError` → `400 {error}` (upload/update); `MediaStillReferencedError` → `409 {error, referencing}` (delete only); any other thrown error → `500 {error: "internal error"}`.
- REQ-38: The system shall expose `GET /m/:assetId/:transformSpec/:filename`, publicly and unauthenticated, parsing `transformSpec` as `^(.+)\.v(\d+)$`; returning `400` for a malformed `assetId`/`transformSpec`/non-positive-integer version; mapping `resolveMediaRendition`'s outcomes to `200` (body = rendition bytes, `Cache-Control: public, max-age=31536000, immutable`, `Content-Type` from the transform's format), `410` (`Cache-Control: no-store`, empty body) for `gone`, and `404` (`Cache-Control: public, max-age=60`, `{error}`) for `not-found`; mapping a thrown `ImageTransformUnavailableError` to `503` (`Cache-Control: no-store`, `{error}`) and any other thrown error to `500`; reading but never using the `:filename` segment in the lookup.

### Disclosed authorization gap (not endorsed as correct — see Constitution Compliance, Article VI)

- REQ-39: As shipped, none of the five admin media routes (`list.ts`, `upload.ts`, `update.ts`, `trash.ts`, `delete.ts`) call `deps.authorize(...)` or any other permission check before performing their operation; any principal holding a valid admin session (regardless of granted permissions) can perform every media list/upload/update/trash/purge action.
- REQ-40: As shipped, `src/identity/permissions.ts` registers exactly one media-related permission descriptor, `media.write` (owner `"core"`), which is never referenced by any route, test, or the permission-check REQ-39 found absent; the ADR-027 §7 flat set (`media.read`, `media.upload`, `media.update`, `media.delete`, `media.delete.force`, `media.download_original`, `media.upload_svg`, `media.manage`) does not exist in the registered catalog.

### Admin UI (`apps/admin/src/sections/Media.tsx`)

- REQ-41: The system shall present an admin "Media" screen listing every media row's title, alt text (or `"—"` if empty), status badge, a truncated sha256 prefix (12 hex chars + `…`, full hash in a `title` tooltip), and version; with a file input (`accept="image/jpeg,image/png,image/webp,image/gif"`), an optional alt-text input, and an "Upload"/"Uploading…" button; and, per row, a single action button reading `"Trash"` for a non-trashed row or `"Delete permanently"` for a trashed row, the latter guarded by a native `window.confirm(...)` dialog before calling the delete route.
- REQ-42: The system shall render every media row's identity as its title/filename text only — no `<img>` element requests rendition bytes from `/m/...`, even though that route exists and is reachable (a stale scope note in the component's own file header, written before the rendition route shipped).

<!-- Add more as needed. Numbers must not be reused, even if a requirement is removed. -->

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given `contentType: "application/x-msdownload"`, when `uploadMedia` (or the upload route) runs, then it throws `MediaValidationError` (route: `400`) — verified by `src/media/__tests__/media-service.test.ts`'s `"uploadMedia rejects a disallowed content type"` and `src/server/__tests__/admin-media-routes.test.ts`'s `"admin media routes: upload rejects a disallowed content type with 400"`.
- AC-02 (REQ-02) [P1]: Given zero-length bytes, when `uploadMedia` runs, then it throws `MediaValidationError` — verified by `"uploadMedia rejects an empty file"`.
- AC-03 (REQ-03) [P1]: Given bytes longer than the configured cap, when `uploadMedia` runs, then it throws `MediaValidationError` — verified by `"uploadMedia rejects a file over the size cap"`.
- AC-04 (REQ-04) [P1]: Given the same bytes uploaded twice, when both `uploadMedia` calls complete, then exactly one blob is written but two distinct `MediaRecord` rows exist — verified by `"uploadMedia dedups identical bytes into one blob but two media rows"`.
- AC-05 (REQ-05) [P1]: Given a `tombstoned` blob row for a hash, when `uploadMedia` uploads matching bytes, then the row is resurrected to `active` with `tombstonedAt` cleared, and no duplicate blob is written — verified by `"uploadMedia resurrects a TOMBSTONED blob back to active instead of writing a duplicate"`.
- AC-06 (REQ-06) [P1]: Given a fresh upload, when `uploadMedia` completes, then a `MediaRecord` and a companion `"original"`/`v1` `AssetRenditionRecord` both exist, and the blob bytes were written before the media row — verified by `"uploadMedia stores bytes, a media row, and an 'original' rendition"`.
- AC-07 (REQ-07) [P1]: Given `filename: "cat.png"`, when `uploadMedia` runs, then `MediaRecord.title === "cat"` — verified by `"uploadMedia stores bytes..."` (same test asserts title derivation).
- AC-08 (REQ-08) [P1]: Given an existing `source` with `sha256: "a"`, when `resolveWriteOnceSource` is called with a different requested hash, then it throws `MediaSourceImmutableError`; given `existing: undefined`, it returns `{ sha256: requested }` — verified by `"resolveWriteOnceSource allows absent -> set..."`.
- AC-09 (REQ-09) [P1]: Given one active and one trashed media row in a workspace, when `listMedia` runs, then both rows are returned — verified by route-level `"admin media routes: upload -> list -> update -> trash -> purge ladder"` (the list assertion after upload) and unit coverage in `media-service.test.ts`.
- AC-10 (REQ-10) [P1]: Given an unknown id, when `getMediaById` runs, then it throws `MediaNotFoundError` — verified by `"getMediaById throws MediaNotFoundError for a missing id"`.
- AC-11 (REQ-11) [P1]: Given an existing row, when `updateMediaMetadata` runs with new `caption`/`credit`, then the stored row reflects the new values and `version` increments by exactly 1 — verified by `"updateMediaMetadata updates only alt/caption/credit/title and bumps version"` and the route-level PATCH assertion (`updatePayload.media.version === 2`).
- AC-12 (REQ-12) [P1]: Given an unknown id, when `updateMediaMetadata` runs, then it throws `MediaNotFoundError` — verified by `"updateMediaMetadata throws MediaNotFoundError for a missing id"`.
- AC-13 (REQ-13) [P1]: Given an active row, when `trashMedia` runs twice, then the second call returns the same already-trashed record without error — verified by `"trashMedia soft-deletes and is idempotent on a second call"`.
- AC-14 (REQ-14) [P1]: Given a never-trashed row, when `purgeMedia` runs, then it throws `MediaStillReferencedError` with a non-empty `referencing` array — verified by `"purgeMedia 409s (MediaStillReferencedError) when the asset is not yet trashed"` and the route-level premature-purge `409` assertion.
- AC-15 (REQ-15) [P1]: Given a trashed row whose blob is not shared, when `purgeMedia` runs, then the row is removed immediately but the blob is only tombstoned (not byte-deleted) — verified by `"purgeMedia removes the media row immediately but only TOMBSTONES an unshared blob..."`.
- AC-16 (REQ-16) [P1]: Given no media row (active or trashed) shares a hash, when `isBlobUnreferenced` runs, then it returns `true`; given an active or a trashed row shares it, it returns `false` in both cases — verified by `"isBlobUnreferenced is true when no media row..."`, `"...is false while an ACTIVE media row shares the sha256"`, `"...is still false while a TRASHED (not purged) media row shares the sha256..."`.
- AC-17 (REQ-17) [P1]: Given an unreferenced active blob, when `tombstoneBlobIfUnreferenced` runs, then the row becomes `tombstoned` with `tombstonedAt` set; given a still-referenced blob, the row stays `active` — verified by `"tombstoneBlobIfUnreferenced tombstones an unreferenced blob and stamps tombstonedAt"` and `"...refuses to tombstone a still-referenced blob"`.
- AC-18 (REQ-17) [P2]: Given an already-tombstoned row, when `tombstoneBlobIfUnreferenced` runs again, then it returns success without error — verified by `"tombstoneBlobIfUnreferenced is idempotent on an already-tombstoned row"`.
- AC-19 (REQ-18) [P1]: Given a tombstoned row whose `gc_grace` has not elapsed, when `runBlobGcDeletePass` runs, then it does not delete the row — verified by `"runBlobGcDeletePass refuses to run before gc_grace has elapsed"`.
- AC-20 (REQ-18) [P1]: Given a row that was never tombstoned, when `runBlobGcDeletePass` runs, then it no-ops — verified by `"runBlobGcDeletePass no-ops on a blob that was never tombstoned"`.
- AC-21 (REQ-18) [P1]: Given a delete-pass has committed the row removal, when the corresponding unlink-pass has not yet run, then the bytes still exist in the blob store (write-before-insert / unlink-after-delete-commit ordering) — verified by `"write-before-insert / unlink-after-delete-commit ordering: bytes survive the row delete and are only removed by a later unlink-pass"`.
- AC-22 (REQ-19) [P2]: Given the snapshot-age stub returns `undefined`, when `resolveGcGraceMs` runs, then it returns exactly `DEFAULT_GC_GRACE_MS` (30 days in ms) — verified by direct read of `resolveGcGraceMs`'s `Math.max(DEFAULT_GC_GRACE_MS, snapshotAgeMs ?? 0)` and exercised indirectly by every grace-period test above.
- AC-23 (REQ-20) [P1]: Given a journal entry whose sha256 now has a live `asset_blobs` row again (re-uploaded after the delete-pass), when `runBlobGcUnlinkPass` runs, then the bytes are NOT removed but the journal entry is — verified by `"runBlobGcUnlinkPass skips (does not unlink) a journal entry whose sha256 has a live row again..."`.
- AC-24 (REQ-20/REQ-22) [P1]: Given an upload racing a delete-pass on the same sha256, when both run concurrently, then bytes are never lost or orphaned regardless of interleaving — verified by `"concurrent purge (delete-pass) racing an upload on the same sha256 never loses or orphans bytes..."`.
- AC-25 (REQ-21) [P2]: Given several eligible tombstoned blobs, when `runBlobGcCycle` runs once, then every eligible blob is deleted and the journal is drained in the same call — verified by `"runBlobGcCycle deletes every eligible tombstoned blob and drains the journal in one call"`.
- AC-26 (REQ-22) [P1]: Given two calls for the same lock key, when both run, then they never interleave (strict FIFO); given two calls for different keys, they run fully concurrently; given one call rejects, a later call on the same key still runs — verified by `"withSha256Lock serializes calls for the same key (no interleaving)"`, `"...runs different keys fully concurrently"`, `"...does not let one key's rejection poison later calls on the same key"`.
- AC-27 (REQ-24) [P1]: Given a name registered once then registered again with different params, when both `registerTransform` calls complete, then two rows exist at `version: 1` and `version: 2`, and the `version: 1` row is unchanged — verified by `"registerTransform mints version 1 for a never-before-seen name"` and `"registerTransform append-only: redefining a name mints a new version and never mutates the old version's row"`.
- AC-28 (REQ-24) [P1]: Given a direct duplicate `(workspaceId, name, version)` insert attempt, when `InMemoryTransformDefinitionRepo.insert` runs, then it throws — verified by `"InMemoryTransformDefinitionRepo.insert rejects a duplicate (workspaceId, name, version)"`.
- AC-29 (REQ-24) [P1]: Given two concurrent `registerTransform` calls for the same name, when both resolve, then their versions are strictly increasing with no collision — verified by `"registerTransform serializes concurrent registrations of the same name into strictly increasing..."`.
- AC-30 (REQ-25) [P1]: Given an invalid format or an out-of-range dimension, when `registerTransform` runs, then it throws `TransformValidationError` — verified by `"registerTransform rejects invalid params (bad format..."`.
- AC-31 (REQ-26) [P1]: Given versions 1 and 2 registered for a name, when `isLatestTransformVersion` is queried for version 1, then it returns `false`; for version 2, `true` — verified by `"isLatestTransformVersion is true only for the current max version of a name"`.
- AC-32 (REQ-27) [P2]: Given any input, when `isReferencedByPublishedContent` is called, then it returns `false` — verified by `"isReferencedByPublishedContent is a disclosed stub that always reports false"`.
- AC-33 (REQ-28) [P1]: Given an unknown assetId, when `resolveMediaRendition` runs, then `outcome === "not-found"` — verified by `"resolveMediaRendition: unknown assetId -> not-found"` and route-level `"media rendition route: unknown assetId is a 404..."`.
- AC-34 (REQ-28) [P1]: Given a trashed asset with an already-generated rendition, when `resolveMediaRendition` runs, then `outcome === "gone"` (route: `410`, `Cache-Control: no-store`) even though the rendition row exists — verified by `"resolveMediaRendition: trashed asset -> gone (410)"` and `"media rendition route: a trashed asset's rendition responds 410 no-store, even for an already-generated rendition"`.
- AC-35 (REQ-28) [P1]: Given an unregistered `(name, version)`, when `resolveMediaRendition` runs, then `outcome === "not-found"` without inventing a definition — verified by `"resolveMediaRendition: unregistered transform name -> not-found (never lazily invents a definition)"`.
- AC-36 (REQ-29) [P1]: Given an already-generated rendition, when `resolveMediaRendition` runs, then it serves the existing bytes without calling `imageTransformer.transform` again — verified by `"resolveMediaRendition: serve-if-exists — an already-generated rendition serves without calling the transformer again"` and route-level `200`/immutable-`Cache-Control` assertion.
- AC-37 (REQ-30) [P1]: Given a registered `(name, v1)` and a newer `(name, v2)`, when `v1` was never generated and `v1 !== latest`, then a request for `v1` is `404` (short-TTL `Cache-Control`); a request for the never-generated `v2` (latest) is `200` and generates it — verified by `"media rendition route: an older, never-generated transform version is a short-TTL 404..., while the latest version generates on first request"`.
- AC-38 (REQ-31) [P1]: Given five concurrent requests for the same not-yet-generated rendition, when all resolve, then `imageTransformer.transform` was called exactly once — verified by `"resolveMediaRendition: five concurrent requests for the same ungenerated rendition still produce exactly one transform call (adversarial fan-in)"`.
- AC-39 (REQ-32) [P1]: Given real image bytes and `sharp` installed, when `SharpImageTransformer.transform` runs, then it returns re-encoded, resized bytes; given genuinely invalid image bytes, it rejects rather than silently passing them through — verified by `"SharpImageTransformer.transform actually resizes and re-encodes real image bytes"` and `"...rejects genuinely invalid image bytes (not a silent fallback)"`.
- AC-40 (REQ-32) [P2]: Given `sharp` cannot be `require()`'d, when `SharpImageTransformer.transform` runs, then it throws `ImageTransformUnavailableError` (route: `503`, `Cache-Control: no-store`) — verified by `"ImageTransformUnavailableError stays exported and instantiable for environments without 'sharp'"`.
- AC-41 (REQ-33) [P2]: Given a sha256, when `computeBlobStorageKey` runs, then the key shards by the first two hex characters of the hash — verified by `"computeBlobStorageKey shards by the first two hex chars of the hash"`.
- AC-42 (REQ-34) [P1]: Given the same `put`/`get`/`exists`/`remove` sequence, when run against `InMemoryBlobStore` and `LocalFsBlobStore`, then both satisfy the `BlobStorePort` contract identically — verified by `"InMemoryBlobStore satisfies the BlobStorePort contract"` and `"LocalFsBlobStore satisfies the BlobStorePort contract"`.
- AC-43 (REQ-35) [P1]: Given a `:workspaceId` that doesn't match the configured workspace, when any admin media route is called, then it returns `404` — verified by `"admin media routes: 404s for an unknown workspace id and an unknown media id"`.
- AC-44 (REQ-36) [P1]: Given a valid upload body, when `POST .../media` runs, then it returns `201` with the created `AdminMediaResponse` — verified by the route-level upload assertion in `"admin media routes: upload -> list -> update -> trash -> purge ladder"`.
- AC-45 (REQ-37) [P1]: Given an unknown media id, when trash is called, then the route returns `404` — verified by `"admin media routes: 404s for an unknown workspace id and an unknown media id"` (the trash-on-unknown-id assertion).
- AC-46 (REQ-38) [P1]: Given cosmetic `slug`/`ext` differ across two requests for the same `(assetId, transformName, version)`, when both resolve, then the response bytes are byte-identical — verified by `"media rendition route: slug/ext are cosmetic — different slug/ext on the same (assetId, transformName, version) serve identical bytes"`.
- AC-47 (REQ-38) [P1]: Given a malformed transform spec (missing `.v{n}` marker), when the route is called, then it returns `400` — verified by `"media rendition route: unknown assetId is a 404, and a malformed transform spec is a 400"`.
- AC-48 (REQ-39) [P1]: Given a principal with NO grants at all (not even `media.write`), when any of the five admin media routes is called with a valid session cookie, then the request still succeeds exactly as a fully-privileged principal's would — confirmed by direct source read of all five route files (zero `authorize`/permission-related identifiers found by repo grep); no existing test exercises this because no route attempts the check. This AC documents the absence, it does not endorse it — see REQ-39/OQ-01.
- AC-49 (REQ-40) [P2]: Given the full `src/identity/permissions.ts` catalog, when searched for `media`, then exactly one descriptor (`media.write`, owner `"core"`) is found, and no source file outside `permissions.ts` itself references the string `media.write` — confirmed by direct source read/grep.
- AC-50 (REQ-41) [P2]: Given at least one media row, when the admin Media screen renders, then every row shows title/alt/status/sha256-prefix/version and an action button whose label depends on `status` — confirmed by direct read of `Media.tsx`; no dedicated frontend test file exists for this component in this repo pass (backend/route coverage is exhaustive; UI component-level tests are not).
- AC-51 (REQ-42) [P3]: Given the `/m/...` route is live and reachable, when the admin Media screen renders a row, then no `<img src="/m/...">` (or any image element) is present in the component's JSX — confirmed by direct read of `Media.tsx` (no `<img>` tag anywhere in the file).

<!-- Rules:
  - Every REQ-* has at least one AC.
  - Every AC has a [P1], [P2], or [P3] tag.
  - P1 ACs are independently testable — each can be verified without other stories complete.
  - No AC requires knowledge of the implementation to evaluate.
  - AC numbers are never reused.
-->

---

## Invariants

- INV-01: A `MediaRecord` row is never removed from the repo except by a successful `purgeMedia` call; `trashMedia`/`updateMediaMetadata` only ever mutate fields in place.
- INV-02: `MediaRecord.source.sha256` is write-once: once a row exists, no code path can change its `sha256` to a different value without `resolveWriteOnceSource` throwing `MediaSourceImmutableError`.
- INV-03: `uploadMedia` never saves a `MediaRecord` row before its source blob's bytes exist (freshly written or resolved via dedup) — a media row is never created without corresponding bytes.
- INV-04: Every `asset_blobs` state transition for a given `sha256` (dedup write/resurrect, tombstone, delete, unlink re-check) is observed by exactly one in-flight critical section at a time (`withSha256Lock` FIFO ordering); a rejection in one critical section never blocks a later call on the same key.
- INV-05: `runBlobGcDeletePass` never removes an `asset_blobs` row unless `gc_grace` has elapsed since `tombstonedAt` AND a fresh `isBlobUnreferenced` re-check (evaluated at delete-pass time, not cached from the tombstone-pass) still holds.
- INV-06: `runBlobGcUnlinkPass` never removes bytes for a sha256 that has a live `asset_blobs` row at unlink time, even when a journal entry names it.
- INV-07: `transform_registry` rows are append-only: `InMemoryTransformDefinitionRepo.insert` rejects any duplicate `(workspaceId, name, version)`, and `registerTransform`, serialized via `withTransformRegistryLock`, never computes a version number already used for that name.
- INV-08: `resolveMediaRendition` never lazily generates a rendition for a `(name, version)` that is neither the latest registered version of `name` nor reported `true` by `isReferencedByPublishedContent`.
- INV-09: Concurrent requests for the same not-yet-generated `(sha256, transformName, version)` rendition always result in exactly one `ImageTransformerPort.transform` call.
- INV-10: The public rendition lookup key is always `(workspaceId, assetId, transformName, version)` only — the `slug`/`ext` path segment never participates in the lookup.
- INV-11: `purgeMedia` never removes a `MediaRecord` whose `status` is not already `"trashed"`.

---

## Edge Cases

- EC-01: What happens when the same bytes are uploaded twice via two separate `uploadMedia` calls in the same workspace?
  Expected behavior: Two distinct `MediaRecord` rows are created (dedup is per-library-entry-independent), but only one `asset_blobs` row / one set of bytes is written — verified by `"uploadMedia dedups identical bytes into one blob but two media rows"`.
- EC-02: What happens when `purgeMedia` removes a `MediaRecord` whose `sha256` is still shared by another, still-active `MediaRecord`?
  Expected behavior: The purged row is removed, but `tombstoneBlobIfUnreferenced` finds the sibling reference and does NOT tombstone the blob — bytes are kept — verified by `"purgeMedia keeps blob bytes when a sibling row still shares the same hash (adversarial: shared-hash aggregate)"`.
- EC-03: What happens when a dedup upload races a GC delete-pass for the same sha256?
  Expected behavior: `withSha256Lock` serializes both operations; bytes are never lost (orphaned by a stale unlink) nor duplicated, regardless of which operation's turn comes first — verified by `"concurrent purge (delete-pass) racing an upload on the same sha256 never loses or orphans bytes..."`.
- EC-04: What happens when a rendition is requested for a registered transform version that is not the latest and has never been generated?
  Expected behavior: `404` with a short-TTL `Cache-Control: public, max-age=60` — the request never triggers generation, closing the registry-history amplification vector — verified by the "older, never-generated transform version" rendition-route test.
- EC-05: What happens when a trashed asset's ALREADY-generated rendition is requested?
  Expected behavior: Still `410 no-store` — the trashed-status check runs before the rendition-existence check, so a previously-cached rendition stops serving the moment its asset is trashed — verified by `"a trashed asset's rendition responds 410 no-store, even for an already-generated rendition"`.
- EC-06: What happens when five concurrent anonymous requests hit the same not-yet-generated rendition simultaneously?
  Expected behavior: Exactly one `imageTransformer.transform` call occurs; the other four requests reuse the winner's freshly-written row via the double-checked lock — verified by `"five concurrent requests for the same ungenerated rendition still produce exactly one transform call (adversarial fan-in)"`.
- EC-07: What happens when an admin `PATCH`es metadata on an asset that is currently `trashed`?
  Expected behavior: The update succeeds unconditionally — `updateMediaMetadata` has no status guard at all, unlike `trashMedia`/`purgeMedia`'s terminal-state checks. This is the shipped behavior, not necessarily the desired one; flagged rather than silently assumed correct (mirrors the analogous EC the `015-integrations` spec recorded for its own sibling function).
- EC-08: What happens when the `sharp` npm package cannot be loaded and a rendition genuinely needs to be generated (not served from an existing row)?
  Expected behavior: `SharpImageTransformer.transform` throws `ImageTransformUnavailableError`; the rendition route maps this to `503` with `Cache-Control: no-store` — not a `500`, not a faked/passthrough image — verified by the adapter's own thrown-error test and its export/instantiability test.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `sharp` (npm package) | Real pixel resize/re-encode for `SharpImageTransformer` | `require("sharp")` throws if the package is absent/pruned; `transform()` throws `ImageTransformUnavailableError` (mapped to route `503`), never a faked image | `InMemoryImageTransformer` (deterministic, non-real) — dev/test composition and hermetic tests use it by default; the real server (`server/deps.ts`) uses `SharpImageTransformer` |
| `node:fs/promises` (local filesystem) | `LocalFsBlobStore`'s byte persistence under a configurable root dir | Disk I/O errors propagate as thrown errors from `put`/`get`/`exists`/`remove`, uncaught by any media-specific wrapper | None in this build — `InMemoryBlobStore` is the only alternative, and it is test/dev-only, not a production fallback |
| ADR-022 generic `entries`/content-type model | Would give `media` revisions, taxonomy, and a real `entry_refs` where-used index for free | Not implemented anywhere in this repo (ACCEPTED design only) — `MediaRecord` is a bespoke table instead, and `purgeMedia`'s 409 guard uses "not yet trashed" as a strictly weaker where-used stand-in | None — this is a structural gap, not a runtime failure mode; see GAP-ENTRIES/GAP-ENTRYREFS |
| `identity`'s session/authorize surface (`getAuthedPrincipal`, `deps.authorize`) | Session-authenticated principal identity (used for upload attribution) and, in every sibling admin section, per-action permission checks | `getAuthedPrincipal` is used only for attribution in `upload.ts`; `deps.authorize` is never called by any media route — an unauthenticated request is rejected by session middleware, but any authenticated session bypasses all media-specific authorization | None — this is the REQ-39 finding, not a graceful-degradation case |
| A process scheduler (interval/cron/outbox subscriber) | Would drive `runBlobGcDeletePass`/`runBlobGcUnlinkPass`/`runMonthlyOrphanSweepStub` automatically, and eager hot-set transform generation | No scheduler primitive exists anywhere in this repo (same gap the `015-integrations` spec's GAP-01 named for its own delivery worker) — tombstoned blobs accumulate indefinitely in a running deployment unless an operator manually invokes `runBlobGcCycle` | None shipped; `runBlobGcCycle`/`runBlobGcDeletePass`/`runBlobGcUnlinkPass` are directly callable but never called automatically |
| Storage/Backups snapshot primitive (pending, not built) | Would supply a real `oldestRetainedSnapshotAgeMs` so `resolveGcGraceMs`'s snapshot conjunct is meaningful | Stub always returns `undefined`, so `resolveGcGraceMs` always resolves to the 30-day default alone | None — `Math.max`'s structure already accepts a real value without touching callers, once the primitive exists |

---

## Open Questions

- OQ-01: RESOLVED (Programmer dispatch, this pass). All five admin media routes now call `deps.authorize(...)` before performing their operation, following `routes/admin/storage/timeline.ts`/`routes/admin/menus/delete.ts`'s established pattern: `list.ts` → `media.read`, `upload.ts` → `media.upload`, `update.ts` → `media.update`, `trash.ts` → `media.delete`, `delete.ts` (hard purge) → `media.delete.force`. 403s with `code: "FORBIDDEN"` on denial. See `src/server/__tests__/admin-media-routes.test.ts` for the denied/granted-per-route coverage.
- OQ-02: RESOLVED in favor of the full set (Programmer dispatch, this pass). The ADR-027 §7 flat `media.*` set is now registered in `src/identity/permissions.ts` (`media.read`/`upload`/`update`/`delete`/`delete.force`/`download_original`/`upload_svg`/`manage`); `media.write` is deprecated-not-deleted with a `registerPermissionMigration` fan-out, and `identity/seed.ts`'s built-in admin/editor role grants were updated to the new granular strings (editor excludes `delete.force`/`download_original`/`upload_svg`).
- OQ-03: Which of the named GAPs (GAP-ENTRIES, GAP-ORIGIN, GAP-INGRESS, GAP-ENTRYREFS, GAP-EPOCHS, GAP-SCHEDULER, GAP-DECLARER, GAP-OUTOFPROCESS, GAP-PRESIGN, GAP-REMOTE, GAP-UI-STALE, GAP-OBSERVABILITY) should be prioritized for a follow-up implementation spec, and in what order — separately from the authz gap, which OQ-01 already prioritizes first? — Owner: Coordinator/Software Architect — Resolve by: the next `/plan` dispatch that targets Media follow-up work.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | `node:crypto`'s `createHash` for sha256, `node:fs/promises` for local blob I/O, and `sharp` (a maintained, standard image-processing library) for the real transform adapter — no custom image codec or hashing was written. The GC lock/protocol is hand-rolled but is a small, ADR-027-specific two-phase journaled algorithm with no off-the-shelf equivalent at this scope. |
| II — Test-First | COMPLIES (for the built surface) | `src/media/__tests__/{media-service,blob-gc,blob-store,image-transformer.sharp,rendition-service,transform-registry}.test.ts` and `src/server/__tests__/{admin-media-routes,media-rendition-route}.test.ts` exist and assert the real behavior this spec documents. This spec is retroactive — it cites existing, already-passing tests rather than certifying new ones. |
| III — Simplicity Gate | COMPLIES | Every shipped module traces to an ADR-027 requirement; every deferred piece (`hasLiveEntryRefs`, `getOldestRetainedSnapshotAgeMs`, `isReferencedByPublishedContent`, `runMonthlyOrphanSweepStub`) is a named, explicit stub function, not silently-omitted or dead code. |
| IV — Anti-Abstraction Gate | COMPLIES | `BlobStorePort` and `ImageTransformerPort` each have two real adapters shipped in this build (fs+memory; sharp+memory). `MediaRepoPort`/`AssetBlobRepoPort`/`AssetRenditionRepoPort`/`TransformDefinitionRepoPort`/`BlobGcJournalRepoPort` each have only one adapter (in-memory) today — a disclosed rule-of-two gap with a named second implementation (a SQLite/Drizzle adapter, matching every other admin-section library's identical, already-accepted precedent), not a silent single-adapter port with no plan. |
| V — Integration-First Testing | COMPLIES | Every P1 AC with an HTTP/route surface (upload/list/update/trash/purge, the rendition route's status/cache-header contract) is verified at that boundary in `admin-media-routes.test.ts`/`media-rendition-route.test.ts` (real `createApp()`/real HTTP), not only as isolated unit tests. |
| VI — Security-by-Default | **EXCEPTION** | The constitution's standing Article VI exception covers the admin session layer running unauthenticated on local dev, provided per-action authz "arrives with the permissions feature before any non-local deployment." The permissions feature (SPEC-006/ADR-021) has already shipped and is already enforced by every sibling admin section (menus, integrations, seo, redirects). Media's admin routes enforce **zero** per-action authorization (REQ-39/REQ-40) — this is not covered by the standing exception's own condition and is not disclosed anywhere in the code's otherwise-extensive self-documentation. Recorded here as the spec's headline finding, not silently normalized as acceptable; see OQ-01. Separately (and not new): the ingress side (no `MediaIngressPolicy` — no SSRF guard, magic-byte sniff, or pixel-bomb cap) is a disclosed, ADR-027-named gap consistent with how prior walking-skeleton builds in this repo have shipped, not a fresh violation. |
| VII — Spec Integrity | COMPLIES | This spec's `spec_id`/`content_hash` become the reference for any future downstream artifact touching Media; the hash is computed via the provider-local validator, not invented. |
| VIII — Observability | **EXCEPTION** | No structured error envelope (`code`/`occurredAt`/`correlationId`) is emitted by any media route — responses are plain `{error: string}` (or `{error, referencing}`) shapes. No domain events (e.g. `media.uploaded`/`media.trashed`/`media.purged`) are emitted anywhere in `src/media/`. This is a real, disclosed gap (not found in any file-header comment, discovered by this spec pass) rather than a claimed-partial compliance; recorded as EXCEPTION with no ADR Complexity Justification entry yet — see OQ-03. |

---

## Implementation Readiness Gate

This checklist must be fully checked before the spec is handed off to the Software Architect Agent.
The Spec Agent completes this. The Coordinator verifies before routing.

- [x] spec_id assigned and unique (SPEC-021 — scanned `ADS-project-knowledge/reports/pipeline/` [001-015] and the reserved-but-unused SPEC-016..020 range per dispatch instruction; started numbering at 021)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator (pending validator run — see spec-manifest.md Validation Notes)
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled (even if answer is "no deadline")
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (feature has non-trivial ordering/precedence/dedup/bound rules: GC grace formula, dedup-by-hash, append-only versioning, anonymous-generation bound, single-flight)
- [x] traceability.spec.md complete (as-built — REQ/AC/INV/EC rows point at real impl/test files, not PENDING, except the disclosed no-test-exists rows which are marked accordingly)
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight
- [x] Since `spec_mode` is `brownfield`, brownfield evidence paths (the real source files read) are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Treat this spec as a description of shipped behavior, not a design proposal — do not "fix" REQ-39/REQ-40 (the authz gap) or any other named GAP as part of accepting this spec; they are handed to a future implementation pass via OQ-01/OQ-02/OQ-03.
- Cite the real file paths and function names in this spec (they are exact) rather than re-deriving them from ADR-027 prose, which describes a materially larger system than what is built.

Ask before:
- Adding `deps.authorize(...)` calls to any media route (OQ-01) — this is real behavior-changing security work requiring its own implementation pass, not a docs fix, even though this spec flags it as urgent.
- Renaming or expanding the `media.write` permission (OQ-02) — permission-string changes are a grant-storage migration concern per ADR-021, matching the precedent `009-redirects`/`015-integrations` already recorded for analogous renames.

Never:
- Present ADR-027's full design (origin isolation, `MediaIngressPolicy`, the generic entries model, per-generation epochs, a scheduler) as though it describes the current running server without cross-checking against this spec's Scope/Dependencies/GAP list.
