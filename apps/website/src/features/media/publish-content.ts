import { createRepoPublishHandler, type FieldDisposition } from "#src/features/publish-content/repo-handler";
import { PublishContentApplyRowError } from "#src/features/publish-content/apply-errors";
import { collectMediaUrlKeys } from "#src/features/publish-content/media-references";
import { nowIso as clockNowIso } from "@jini-ai/core/primitives";
import type { PublishContentContributor, PublishContentPorts } from "#src/features/publish-content/type-registry";

import { importMediaEntity } from "./import-media-entity.js";
import { computeBlobStorageKey, sniffContentType } from "./index.js";
import type { MediaRecord } from "./index.js";
import { verifyPublishedMedia } from "./verify-published-media.js";

/**
 * @file `media`'s publish-content contribution, built on `createRepoPublishHandler`
 * (`features/publish-content/repo-handler.ts`; M-MED of
 * `ADS-memory/.local-artifacts/plan-publish-all-types-2026-09-25.md`). A DATA export that imports only
 * `type-registry.ts`'s TYPES — see that file's header for the module cycle a value edge would reopen.
 * `dependsOn` is empty: media is a DEPENDENCY of `post`/`page`, never the reverse.
 *
 * ## Where the BYTES come from
 *
 * The destination's own `BlobStorePort`, at `computeBlobStorageKey({workspaceId, sha256})` — where the
 * blob pre-flight PUT (`routes/publish-content/blob-put.ts`) wrote them and where the planner's `hasBlob`
 * probe looks. `PackedEntity.state` is JSON-only, so bytes never travel on the entity. A sha this
 * destination never received is a reported, non-destructive block (`blocked:missing-blob`) that writes
 * nothing: precheck reports it before confirmation, and `importMediaEntity` refuses it at write time.
 *
 * ## Why `undo` (the command gateway)
 *
 * Media has no revision ledger and `asset_blobs` has none either, so the change set's inverse (the
 * verbatim pre-write `MediaRecord`) IS media's revert path. The blob half is safe by construction:
 * `importMediaEntity` writes a blob row only when `findByHash` finds none, so it is append-only and an
 * existing row's attribution is never overwritten (reported as `blobWritten`).
 *
 * ## Concurrency
 *
 * The factory's version check (on the `captureInverse` read) is an EARLY refusal that avoids fetching
 * bytes for a doomed import. The real guarantee is `importMediaEntity`'s `baseVersion`: an atomic
 * compare-and-set write (`VersionedMediaRepoPort.saveIfVersion`/`insertIfAbsent`), so a writer that
 * slips in during the blob I/O is still caught.
 *
 * ## Hash stability
 *
 * The hash retains the legacy whole-record input; `content-hash.ts` drops
 * `id`/`workspaceId`/`version`/`updatedAt` itself. The new `createdBy` is also excluded: the
 * destination stamps its own applying principal, so comparing creator IDs as content would make
 * an unchanged asset appear to drift after every publish. Legacy hashes remain byte-identical.
 * Packed state still includes known attribution for export, because `importMediaEntity` spreads
 * it into the destination row before preserving/stamping the destination's own creation actor.
 */

/** Machine-readable cause for a refused media apply. One discriminant rather than one error class
 *  per cause, mirroring `ImportMediaEntityResult`'s own `blocked` shape: every one of these is an
 *  ORDINARY, expected outcome of importing real-world data, not a programming error. */
export type MediaApplyBlockedCode = "blocked:missing-blob" | "blocked:slug-taken" | "blocked:precondition";

/**
 * A media entity that cannot be applied, for a reason that is data, not a fault. Thrown only after
 * every precondition check and BEFORE any write, so a blocked apply always leaves the destination
 * exactly as it found it — no blob row, no media row, no change set.
 *
 * Extends {@link PublishContentApplyRowError} with `rowOutcome: "blocked"`, so `apply-loop.ts`
 * downgrades THIS ONE report row and the rest of the run continues. One missing blob must never kill
 * a 200-entity publish. The message is used verbatim as the row's `reason`, which is why it is
 * phrased as a standalone operator-facing explanation.
 */
export class MediaApplyBlockedError extends PublishContentApplyRowError {
  readonly code: MediaApplyBlockedCode;

  constructor(code: MediaApplyBlockedCode, message: string) {
    super("blocked", message);
    this.name = "MediaApplyBlockedError";
    this.code = code;
  }
}

/**
 * The destination moved on from the `expectedVersion` the apply loop planned against — media's
 * equivalent of `PostConflictError`, deliberately its own class rather than a reuse of `post`'s (a
 * shared base in `apply-errors.ts` is what the loop actually checks; see that file's header).
 * `rowOutcome: "conflict"`, so the row downgrades and the run continues. Thrown before any write.
 */
export class MediaApplyConflictError extends PublishContentApplyRowError {
  constructor(message: string) {
    super("conflict", message);
    this.name = "MediaApplyConflictError";
  }
}

/** Every field travels, because `importMediaEntity` spreads the packed state into the destination row.
 *  The dispositions document intent only: the hash is `legacyHashState`'s. */
const MEDIA_FIELDS: Record<keyof MediaRecord, FieldDisposition> = {
  id: "provenance",
  createdBy: "provenance",
  workspaceId: "provenance",
  title: "transferred",
  slug: "transferred",
  alt: "transferred",
  caption: "transferred",
  credit: "transferred",
  source: "transferred",
  status: "transferred",
  createdAt: "provenance",
  updatedAt: "provenance",
  version: "provenance",
  width: "transferred",
  height: "transferred",
  cssClass: "transferred",
  htmlAttributes: "transferred",
};

/** Called from a composition root (`server/runtime/composition/publish-content-manifest.ts`). */
export const contributeMediaPublish = (): PublishContentContributor =>
  createRepoPublishHandler<MediaRecord, PublishContentPorts["media"]>({
    entityType: "media",
    // The same permission `post`/`page` declare; media has no write permission of its own.
    permission: "content.write",
    ports: (deps) => deps.ports.media,
    list: (p, workspaceId) => p.repo.list({ workspaceId }),
    find: (p, workspaceId, id) => p.repo.findById({ workspaceId, id }),
    fields: MEDIA_FIELDS,
    // Packed exactly as the row holds it: an absent field stays absent rather than becoming `null`.
    omitWhenAbsent: Object.keys(MEDIA_FIELDS),
    legacyHashState: (row) => {
      const { createdBy: _creator, ...legacyState } = row;
      return legacyState;
    },
    requiredBlobs: (row) => [row.source.sha256],
    // Other media this item names by a `/m/{key}/` URL in its own `htmlAttributes` — a video's
    // `poster`, chiefly — travel with it, or the destination renders a poster URL that 404s.
    references: (entity) =>
      typeof entity.state.htmlAttributes === "string"
        ? [...collectMediaUrlKeys(entity.state.htmlAttributes)].map((key) => ({ entityType: "media", key }))
        : [],
    // `media.slug` may be empty on pre-backfill rows; the factory skips an empty address.
    address: { field: "slug", holder: (p, workspaceId, slug) => p.repo.findBySlug({ workspaceId, slug }) },
    // Also checked by the planner's `hasBlob` pass, but that depends on the caller wiring the probe;
    // media is the one type whose entity IS its blob.
    validate: async ({ ports, workspaceId, entity }) => {
      for (const sha256 of entity.requiredBlobs) {
        if (!(await ports.blobStore.exists({ storageKey: computeBlobStorageKey({ workspaceId, sha256 }) }))) {
          return `required blob '${sha256}' is not available on this destination`;
        }
      }
      return null;
    },
    write: async ({ ports, deps, workspaceId, id, state, expectedVersion, principalId }) => {
      const { repo: mediaRepo, assetBlobRepo, blobStore, contentTypeStore } = ports;
      const record = state as unknown as MediaRecord; // this handler's own pack() produced it
      const storageKey = computeBlobStorageKey({ workspaceId, sha256: record.source?.sha256 ?? "" });
      // `null` carries a missing staged object into `importMediaEntity`, which owns that refusal.
      const bytes = (await blobStore.exists({ storageKey })) ? await blobStore.get({ storageKey }) : null;
      const outcome = await importMediaEntity({
        deps: { mediaRepo, assetBlobRepo, blobStore, clock: { nowIso: () => clockNowIso({ clock: deps.clock }) }, idGen: deps.idGen },
        input: {
          workspaceId,
          record,
          bytes,
          // Only a brand-new blob row takes the importing operator; an existing one is never re-stamped.
          blobCreatedByPrincipal: principalId,
          baseVersion: expectedVersion ?? null,
        },
      });
      if (outcome.status === "conflict") {
        throw new MediaApplyConflictError(`media '${id}' changed on the destination during apply: ${outcome.reason}`);
      }
      if (outcome.status === "blocked") {
        throw new MediaApplyBlockedError(`blocked:${outcome.code}`, `media '${id}' cannot be applied — ${outcome.reason}`);
      }
      // Every other write path (upload, import, duplicate) records the sniffed type; without it the
      // destination's embed resolver cannot tell a video from an image. Sniffed from the bytes just
      // imported, never carried from the source (the store's own invariant). `bytes` is non-null
      // here: `importMediaEntity` blocks a missing one.
      if (bytes) await contentTypeStore.set({ workspaceId, sha256: record.source.sha256, contentType: sniffContentType({ bytes }) });
      const saved = await mediaRepo.findById({ workspaceId, id });
      // `blobWritten`: true when this import created the `asset_blobs` row, false when the bytes were
      // already there (a normal dedup, not a conflict). Passed through on `apply()`'s result.
      return { blobWritten: outcome.blobWritten, version: saved?.version };
    },
    undo: {
      // An update restores the prior record verbatim; a create removes its row. The blob row and bytes
      // stay: they are append-only and content-addressed, and an orphan is reclaimable by GC.
      restore: ({ ports }, prior) => ports.repo.save(prior),
      remove: ({ ports, workspaceId, id }) => ports.repo.remove({ workspaceId, id }),
      summary: async ({ ports, workspaceId, id, state }) => {
        const sha256 = (state as unknown as MediaRecord).source?.sha256 ?? "";
        // Wording only; `blobWritten` reports what actually happened under a concurrent import.
        return (await ports.assetBlobRepo.findByHash({ workspaceId, sha256 })) !== null
          ? `Import media '${id}' via publish-content (existing blob ${sha256} reused; attribution preserved)`
          : `Import media '${id}' via publish-content (new blob ${sha256})`;
      },
    },
    conflictError: (message) => new MediaApplyConflictError(message),
    extend: ({ deps, ports }) => ({
      verifyApplied: async ({ entities }) => {
        const p = ports();
        return p ? verifyPublishedMedia(p, deps.workspaceId, entities) : [];
      },
    }),
  });
