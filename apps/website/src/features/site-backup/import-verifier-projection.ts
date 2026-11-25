import { admitProjectedDocuments as admit, applyShareProjection as apply, type DocumentAdmission, type ProjectionDeps } from "@jini-ai/devops/backup/site/import-verifier-projection";
import { validateDocumentIngress } from "#src/features/media/index";
import { createDocumentArchiveReader } from "@jini-ai/cms/media/site/document-archive";
import * as yauzl from "yauzl";
import { createYauzlAgentPluginArchiveReader, type YauzlPort } from "@jini-ai/agent-plugins/lifecycle/yauzl";
import type { ArchiveManifest } from "@jini-ai/devops/backup/site/archive-manifest";
import type { ShareDatabaseProjection } from "./share-policy.js";
import { validateSharePath } from "./share-file-policy.js";
import { refuseArchive, sha256Hex } from "@jini-ai/devops/backup/site/import-verifier-inventory";

/**
 * @file Host binding for the database half of `verifySiteImport`: Tovu's share path policy, archive
 * refusal, hashing and Library document upload policy behind the generic projection reconciliation.
 */

/** Host binding: the installed yauzl SDK + agent-plugins streaming reader back the document archive guard. */
const documentArchiveDeps = { yauzl: yauzl as unknown as YauzlPort, createArchiveReader: createYauzlAgentPluginArchiveReader };

const HOST_DEPS: ProjectionDeps = {
  validateSharePath,
  refuseArchive,
  sha256Hex,
  createDocumentAdmission: () => {
    const archiveReader = createDocumentArchiveReader(documentArchiveDeps);
    return required => validateDocumentIngress(required, { archiveReader });
  },
};

/**
 * Prunes excluded blobs, refuses unreferenced uploads, checks every referenced media and document
 * blob, then applies the sanitizer's destination remaps.
 * @throws SiteShareRefusal (INVALID_ARCHIVE, UNSAFE_PATH) or the signal's reason.
 */
export async function applyShareProjection(required: { files: Map<string, Buffer>; projection: ShareDatabaseProjection; manifest: ArchiveManifest }, optional: { signal?: AbortSignal } = {}): Promise<void> {
  return apply({ ...required, deps: HOST_DEPS }, optional);
}

/** Every projected Library document must have its exact blob and pass the upload policy.
 * @param optional.admitDocument the upload policy port; defaults to `validateDocumentIngress` with a
 *   bounded document archive reader.
 */
export async function admitProjectedDocuments(required: { files: ReadonlyMap<string, Buffer>; documents: NonNullable<ShareDatabaseProjection["documents"]> }, optional: { signal?: AbortSignal; admitDocument?: DocumentAdmission } = {}): Promise<void> {
  return admit({ ...required, deps: HOST_DEPS }, optional);
}
