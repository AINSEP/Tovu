import { bytesMatchSha256, isValidSha256Hex } from "#src/features/publish-content/blob-staging";

import { MediaConflictError, MediaSourceImmutableError, resolveWriteOnceSource } from "./index.js";
import type { AssetBlobRecord, AssetBlobRepoPort, BlobStorePort, MediaRecord, VersionedMediaRepoPort } from "./index.js";

/**
 * @file Task 12 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 12.
 *
 * ## The bug this file exists to prevent
 *
 * `uploadMedia` (`@jini-ai/cms/media`'s `media-service.ts`, composed with `UploadMediaInput`) has NO
 * `id` field on its input — it always mints a fresh id via `deps.idGen.newId()`. A post's `bodyJson`
 * references an embedded image BY id (`{type:"image", attrs:{assetId, transformName}}` —
 * `server/inbound/public-http/http/site/render.ts`'s ref-image path). Importing media through the
 * ordinary `uploadMedia` path therefore uploads the bytes fine but breaks EVERY image embed in every
 * imported post: the post's `assetId` still points at the SOURCE system's id, which no longer
 * resolves to anything at the destination. The failure is silent — bytes intact, links dead.
 *
 * `importMediaEntity` below deliberately bypasses `uploadMedia` and composes
 * `BlobStorePort.putIfAbsent` + `AssetBlobRepoPort` + `MediaRepoPort.save(record)` directly, because
 * `MediaRepoPort.save(record: MediaRecord)` (unlike `UploadMediaInput`) takes a full record —
 * including `id` — and writes it verbatim. Do NOT "clean this up" back onto `uploadMedia`: that
 * would silently reintroduce the exact bug this file exists to prevent.
 *
 * ## Relationship to `features/media-import/`
 *
 * `features/media-import/` is a DIFFERENT, unrelated concern: it fetches a brand-new image from an
 * external URL (an agent tool) and deliberately DOES go through `uploadMedia`, because minting a
 * fresh id is correct there — there is no pre-existing id to preserve; the image has never existed
 * in this system before. This file is the opposite case: the asset already has an id somewhere else
 * (another Tovu instance, an export bundle) and THAT id must survive the trip. Do not merge the two.
 *
 * ## Safety properties this function enforces itself (not merely assumed of its caller)
 *
 * Every precondition below is checked INSIDE this function, before any write — never left to a
 * caller's own `precheck()` pass, the same "don't trust the caller already checked" discipline
 * `routes/publish-content/blob-put.ts` already applies to the identical sha256 check. A caller that
 * skips `precheck()` (or gets it wrong) still cannot force a partial or unsafe write through here.
 *
 * 1. **Bytes must hash to the record's claimed `source.sha256`, checked BEFORE `putIfAbsent`.**
 *    `putIfAbsent` (`blob-store.fs.ts`/`blob-store.memory.ts`) does not verify this itself — it only
 *    uses the sha to derive the storage key (`blob-staging.ts`'s own header has the full trace).
 * 2. **A slug already held by a DIFFERENT id blocks the import — no write of any kind.** Checked
 *    before any blob or media write, so a slug collision never leaves a dangling blob with no media
 *    row pointing at it.
 * 3. **`source.sha256` is write-once**, enforced by reusing the library's own
 *    `resolveWriteOnceSource` (the exact seam its own doc says "any future 'replace source'
 *    operation would have to go through") rather than re-deriving the same rule a second time.
 *    Re-importing the same id with a DIFFERENT claimed sha256 is blocked; the SAME sha256 is an
 *    idempotent no-op re-save (title/slug/etc. may still legitimately change on a re-import).
 * 4. **An existing `asset_blobs` row's `createdByPrincipal` is never re-stamped.** `AssetBlobRepoPort
 *    .save` is a wholesale upsert keyed on `(workspaceId, sha256)` (verified against
 *    `InMemoryAssetBlobRepo`/the SQLite adapter) — calling it unconditionally on every import would
 *    silently overwrite an existing blob's original attribution with the importing operator's every
 *    time a second media row happens to dedup onto the same bytes. This function calls
 *    `assetBlobRepo.save` ONLY when `findByHash` finds nothing.
 * 5. **The media row write is a compare-and-set on {@link ImportMediaEntityInput.baseVersion}, not a
 *    blind `save()`.** `publish-content.ts`'s own Guard 1 compares a version read several `await`s
 *    (real blob-store I/O) before this command's write — two concurrent importers can both pass that
 *    compare and, before this fix, both land a `mediaRepo.save()` unconditionally, silently erasing
 *    whichever wrote second. `baseVersion` travels the compare INTO the write: `null` calls
 *    `VersionedMediaRepoPort.insertIfAbsent`, a number calls `saveIfVersion({ifVersion: baseVersion})`,
 *    and either miss comes back as `{status: "conflict"}` rather than a silent last-write-wins.
 */

/** Dependencies `importMediaEntity` needs, bound by a composition root. Named to match this
 *  codebase's `PublishContentDeps`/`UploadMediaDeps` field naming exactly, so a future caller
 *  threading real deps through (e.g. `features/media/publish-content.ts`'s `apply()`) has nothing to
 *  rename. */
export interface ImportMediaEntityDeps {
  readonly mediaRepo: VersionedMediaRepoPort;
  readonly assetBlobRepo: AssetBlobRepoPort;
  readonly blobStore: BlobStorePort;
  readonly clock: { nowIso(): string };
  /** Consulted ONLY for a brand-new `asset_blobs` row's own `id` — never for the media row's id,
   *  which always comes from {@link ImportMediaEntityInput.record} verbatim (this file's whole
   *  point). */
  readonly idGen: { newId(): string };
}

export interface ImportMediaEntityInput {
  readonly workspaceId: string;
  /**
   * The SOURCE system's own `MediaRecord`, `id` included — this is the row that lands at the
   * destination under the IDENTICAL id (see this file's header). `version`/`updatedAt` are ignored
   * (destination-local write bookkeeping, not portable content — same reasoning
   * `content-hash.ts`'s own `EXCLUDED_KEYS` doc gives for excluding the identical fields from
   * `post`'s content hash); this function computes its own.
   */
  readonly record: MediaRecord;
  /** Bytes supplied by an upload/import caller, or `null` when a publish apply could not load the
   *  pre-staged blob. This command owns the missing-blob decision as well as byte validation. */
  readonly bytes: Uint8Array | null;
  /**
   * Attribution for a FRESHLY WRITTEN `asset_blobs` row only — never applied when the blob already
   * exists at the destination (safety property 4 above). Typically the importing operator's
   * principal id, or the source blob's own recorded `createdByPrincipal` when the caller has one
   * available and wants to preserve it end to end; either is a legitimate value for a row that does
   * not exist yet, since "brand new at this destination" has no prior attribution to protect.
   */
  readonly blobCreatedByPrincipal: string;
  /**
   * The destination media row's version this import was decided against — `null` means the import
   * expects NO existing row (a fresh create). Required rather than optional, so no future caller can
   * skip the compare-and-set guard (safety property 5 above) by omitting it. `publish-content.ts`
   * passes `input.expectedVersion ?? null` — its own Guard 1 already compares the same basis, and
   * this field is what carries that same compare INTO the atomic write instead of leaving it
   * check-then-write.
   */
  readonly baseVersion: number | null;
}

/**
 * `imported` on success. `blocked` covers every refused precondition (malformed/mismatched sha256,
 * a slug collision, a write-once `source.sha256` violation) — one discriminant rather than one
 * error class per cause, mirroring `PublishContentHandler.precheck`'s own `string | null` shape
 * (a human-readable reason, not a thrown exception) for the same reason: every one of these is an
 * ORDINARY, expected outcome of importing real-world data (two sources that both picked the same
 * slug, a stale export bundle), not a programming error:
 */
export type ImportMediaEntityBlockedCode = "missing-blob" | "slug-taken" | "precondition";

export type ImportMediaEntityResult =
  | { readonly status: "imported"; readonly id: string; readonly blobWritten: boolean }
  | { readonly status: "blocked"; readonly code: ImportMediaEntityBlockedCode; readonly reason: string }
  /** The media row's `baseVersion` basis was superseded by a concurrent writer — either caught
   *  early (before any write) or discovered by a failed compare-and-set write. Never a partial
   *  write: nothing is left half-applied on this outcome, mirroring `blocked`'s own guarantee. */
  | { readonly status: "conflict"; readonly reason: string };

/**
 * Compares the caller's `baseVersion` claim against `current`'s real state. Returns `null` when
 * they agree (nothing to refuse: `baseVersion === null` with `current === null`, or
 * `current.version === baseVersion`). Otherwise returns exactly one of three messages, byte-
 * identical to the tails of `publish-content.ts`'s own Guard 1 conflict messages — the SAME words
 * describe the SAME condition whether Guard 1 catches it early (before any write is attempted) or
 * this function's caller catches it here (a concurrent writer won the race between Guard 1's read
 * and this command's own compare-and-set write).
 *
 * @complexity O(1).
 */
function describeVersionMismatch(baseVersion: number | null, current: MediaRecord | null): string | null {
  if (baseVersion === null) {
    return current === null ? null : `expected no existing row, found version ${current.version}`;
  }
  if (current === null) return `expected version ${baseVersion}, but the row is gone`;
  return current.version === baseVersion ? null : `expected version ${baseVersion}, found version ${current.version}`;
}

/**
 * Performs the compare-and-set media write — `insertIfAbsent` when `baseVersion` is `null` (no row
 * expected), `saveIfVersion` otherwise (safety property 5) — and returns the refusal result when it
 * did not land, or `null` on a successful write.
 *
 * Two distinct misses are handled:
 * - **A version miss** (`applied: false`, no thrown error): a concurrent writer moved or removed the
 *   row between this command's precondition reads and this write. Re-reads to phrase the exact
 *   mismatch; if the id was raced onto a NEW row exactly at `baseVersion` in that same window
 *   (an ABA case `describeVersionMismatch` cannot see, since the re-read now again matches), falls
 *   back to a generic conflict message rather than silently reporting `null`/no mismatch.
 * - **A slug race** (`MediaConflictError` thrown by the repo's own unique index): a DIFFERENT id
 *   landed under this record's slug between the earlier `findBySlug` precondition read and this
 *   write. Re-reads the real holder and reports `blocked`/`slug-taken` — the same code the
 *   precondition check above reports, just discovered one step later.
 *
 * Pulled out of {@link importMediaEntity} to stay under this repo's complexity ceiling (memory
 * `complexity_ceiling_ten.md`).
 *
 * @complexity O(1) — one repo write, plus at most one re-read on either refusal path.
 */
async function writeMediaRowConditionally(
  deps: ImportMediaEntityDeps,
  row: MediaRecord,
  baseVersion: number | null
): Promise<ImportMediaEntityResult | null> {
  let applied: boolean;
  try {
    const outcome =
      baseVersion === null
        ? await deps.mediaRepo.insertIfAbsent(row)
        : await deps.mediaRepo.saveIfVersion({ record: row, ifVersion: baseVersion });
    applied = outcome.applied;
  } catch (error) {
    if (!(error instanceof MediaConflictError)) throw error;
    const holder = await deps.mediaRepo.findBySlug({ workspaceId: row.workspaceId, slug: row.slug });
    return {
      status: "blocked",
      code: "slug-taken",
      reason: `slug '${row.slug}' is already held by a different media ('${holder?.id ?? "unknown"}')`,
    };
  }
  if (applied) return null;

  const current = await deps.mediaRepo.findById({ workspaceId: row.workspaceId, id: row.id });
  const reason =
    describeVersionMismatch(baseVersion, current) ??
    (baseVersion === null
      ? "expected no existing row, but the id is already in use"
      : `expected version ${baseVersion}, but a concurrent write landed first`);
  return { status: "conflict", reason };
}

/**
 * Imports one media entity, preserving its source `id`. See this file's header for the full safety
 * case and the bug this exists to prevent.
 *
 * @complexity O(1) — a fixed, small number of repo/store calls; no iteration over caller-controlled
 *   collections.
 */
export async function importMediaEntity(required: {
  readonly deps: ImportMediaEntityDeps;
  readonly input: ImportMediaEntityInput;
}): Promise<ImportMediaEntityResult> {
  const { deps, input } = required;
  const { workspaceId, record, bytes, blobCreatedByPrincipal, baseVersion } = input;

  if (bytes === null) {
    return {
      status: "blocked",
      code: "missing-blob",
      reason: `required blob '${record.source.sha256}' was never received by this destination`,
    };
  }

  // Safety property 1 (sha256 shape + match) — checked first, before any repo read even, since a
  // malformed/mismatched claim makes every other check moot.
  if (!isValidSha256Hex(record.source.sha256)) {
    return { status: "blocked", code: "precondition", reason: `malformed source sha256 '${record.source.sha256}'` };
  }
  if (!bytesMatchSha256({ bytes, claimedSha256: record.source.sha256 })) {
    return {
      status: "blocked",
      code: "precondition",
      reason: `bytes do not hash to the claimed sha256 '${record.source.sha256}'`,
    };
  }

  const [existingById, slugHolder] = await Promise.all([
    deps.mediaRepo.findById({ workspaceId, id: record.id }),
    // Media's `slug` is nullable/optional in practice (pre-backfill rows), unlike `post`'s — an
    // empty slug has nothing to collide on, so it skips this check entirely rather than blocking
    // (contrast `features/post/publish-content.ts`'s `precheck`, where an empty slug DOES block,
    // because `post.slug` is `NOT NULL` and always meaningful there).
    record.slug ? deps.mediaRepo.findBySlug({ workspaceId, slug: record.slug }) : Promise.resolve(null),
  ]);

  // Safety property 5 (compare-and-set basis) — checked before the slug check, so a caller whose
  // basis is already stale gets `conflict` (this row changed on the destination) rather than a
  // `blocked`/`slug-taken` that describes a state the caller was never even importing against.
  const mismatch = describeVersionMismatch(baseVersion, existingById);
  if (mismatch) return { status: "conflict", reason: mismatch };

  // Safety property 2 (slug collision) — before any write.
  if (slugHolder && slugHolder.id !== record.id) {
    return {
      status: "blocked",
      code: "slug-taken",
      reason: `slug '${record.slug}' is already held by a different media ('${slugHolder.id}')`,
    };
  }

  // Safety property 3 (write-once source.sha256) — reuses the library's own guard rather than
  // re-deriving it; see this file's header for why.
  let resolvedSource;
  try {
    resolvedSource = resolveWriteOnceSource({ existing: existingById?.source, requestedSha256: record.source.sha256 });
  } catch (error) {
    if (error instanceof MediaSourceImmutableError) {
      return { status: "blocked", code: "precondition", reason: error.message };
    }
    throw error;
  }

  // Safety property 4 (never re-stamp an existing blob's attribution) — `assetBlobRepo.save` is
  // reached only on the "no existing row" branch.
  const existingBlob = await deps.assetBlobRepo.findByHash({ workspaceId, sha256: record.source.sha256 });
  let blobWritten = false;
  if (!existingBlob) {
    const { storageKey } = await deps.blobStore.putIfAbsent({ workspaceId, sha256: record.source.sha256, bytes });
    const newBlob: AssetBlobRecord = {
      id: deps.idGen.newId(),
      workspaceId,
      sha256: record.source.sha256,
      storageKey,
      createdByPrincipal: blobCreatedByPrincipal,
      createdAt: deps.clock.nowIso(),
      status: "active",
    };
    await deps.assetBlobRepo.save(newBlob);
    blobWritten = true;
  }

  const row: MediaRecord = {
    ...record,
    workspaceId,
    source: resolvedSource,
    version: (baseVersion ?? 0) + 1,
    // createdAt is write-once, same convention `posts.createdByPrincipalId`/`createdAt` establish
    // (`platform/db/schema.ts`) — an existing row keeps its own; a brand-new row takes the source's.
    createdAt: existingById?.createdAt ?? record.createdAt,
    updatedAt: deps.clock.nowIso(),
  };

  // Safety property 5 (compare-and-set write) — the version compare traveled INTO this write via
  // `baseVersion`; see this function's own header and `writeMediaRowConditionally`'s doc.
  const refusal = await writeMediaRowConditionally(deps, row, baseVersion);
  if (refusal) return refusal;

  return { status: "imported", id: record.id, blobWritten };
}
