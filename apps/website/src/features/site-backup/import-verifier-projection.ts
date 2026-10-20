import { validateDocumentIngress } from "#src/features/media/index";
import { createDocumentArchiveReader } from "#src/features/media/document-archive";
import type { ShareDatabaseProjection } from "./share-policy.js";
import { validateSharePath } from "./share-file-policy.js";
import { refuseArchive, sha256Hex } from "./import-verifier-inventory.js";

/**
 * @file The database half of `verifySiteImport`: after the isolated sanitizer rebuilt the database,
 * reconcile the verified archive files with what that database references. Mutates only the
 * caller's `files` map, and only after every refusal check for that step passed.
 */

/** The upload policy a Library document must pass; resolves when admitted, throws when refused. */
export type DocumentAdmission = (required: { filename: string; bytes: Buffer }) => Promise<unknown>;

/**
 * Prunes excluded blobs, refuses unreferenced uploads, checks every referenced media and document
 * blob, then applies the sanitizer's destination remaps.
 * @throws SiteShareRefusal (INVALID_ARCHIVE, UNSAFE_PATH) or the signal's reason.
 * @complexity O(files + media + documents × document validation).
 */
export async function applyShareProjection(required: { files: Map<string, Buffer>; projection: ShareDatabaseProjection }, optional: { signal?: AbortSignal } = {}): Promise<void> {
  const { files, projection } = required;
  const referencedMedia = new Set(projection.media.map(media => "uploads/" + media.storageKey));
  pruneExcludedBlobs({ files, referencedMedia, excludedBlobKeys: projection.excludedBlobKeys ?? [] });
  for (const file of files.keys()) if (file.startsWith("uploads/") && !referencedMedia.has(file)) refuseArchive("Unreferenced uploads are outside the portable share media policy.");
  checkProjectedMedia({ files, projection });
  await admitProjectedDocuments({ files, documents: projection.documents ?? [] }, optional);
  applyDestinationMoves({ files, media: projection.media });
}

/** Source DB sidecars the projection omitted are dropped unless the database still references them. */
function pruneExcludedBlobs(required: { files: Map<string, Buffer>; referencedMedia: ReadonlySet<string>; excludedBlobKeys: readonly string[] }): void {
  for (const key of required.excludedBlobKeys) {
    const file = "uploads/" + key;
    validateSharePath({ path: file });
    if (!required.referencedMedia.has(file)) required.files.delete(file);
  }
}

function checkProjectedMedia(required: { files: ReadonlyMap<string, Buffer>; projection: ShareDatabaseProjection }): void {
  const documentKeys = new Set(required.projection.documents?.map(document => document.storageKey));
  for (const media of required.projection.media) {
    validateSharePath({ path: "uploads/" + media.storageKey });
    const content = required.files.get("uploads/" + media.storageKey);
    if (!content || media.sha256 && sha256Hex(content) !== media.sha256) refuseArchive(documentKeys.has(media.storageKey) ? "Referenced document blob is missing or corrupt." : "Referenced media is missing or failed its hash.");
  }
}

/**
 * Every projected Library document must have its exact blob and pass the upload policy.
 * @param optional.admitDocument the upload policy port; defaults to `validateDocumentIngress` with a
 *   bounded document archive reader.
 */
export async function admitProjectedDocuments(required: { files: ReadonlyMap<string, Buffer>; documents: NonNullable<ShareDatabaseProjection["documents"]> }, optional: { signal?: AbortSignal; admitDocument?: DocumentAdmission } = {}): Promise<void> {
  const admitDocument = optional.admitDocument ?? defaultDocumentAdmission();
  for (const document of required.documents) {
    optional.signal?.throwIfAborted();
    const content = required.files.get("uploads/" + document.storageKey);
    if (!content || sha256Hex(content) !== document.sha256) refuseArchive("Referenced document blob is missing or corrupt.");
    // A valid outer ZIP checksum cannot grant document admission. Reuse upload policy,
    // including bounded DOCX package validation, before staging or creating the new site.
    try { await admitDocument({ filename: document.originalFilename, bytes: content }); }
    catch (error) { refuseArchive(`Invalid Library document: ${error instanceof Error ? error.message : "document ingress rejected"}`); }
  }
}

function defaultDocumentAdmission(): DocumentAdmission {
  const archiveReader = createDocumentArchiveReader({});
  return required => validateDocumentIngress(required, { archiveReader });
}

/**
 * The isolated DB owner has already remapped document keys to the new workspace. Move only
 * fully verified bytes, once per source key, and refuse any conflicting destination claim.
 */
function applyDestinationMoves(required: { files: Map<string, Buffer>; media: ShareDatabaseProjection["media"] }): void {
  const { files } = required;
  const moves = new Map(required.media.filter(media => media.destinationStorageKey && media.destinationStorageKey !== media.storageKey).map(media => ["uploads/" + media.storageKey, "uploads/" + media.destinationStorageKey]));
  for (const [source, destination] of moves) {
    validateSharePath({ path: destination });
    const bytes = files.get(source)!;
    if (files.has(destination) && !files.get(destination)!.equals(bytes)) refuseArchive("Conflicting imported document blob keys.");
    files.set(destination, bytes);
    files.delete(source);
  }
}
