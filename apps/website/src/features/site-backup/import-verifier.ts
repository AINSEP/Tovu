import { verifySiteImport as verifyEngineSiteImport, type SiteImportVerifierHost, type VerifiedSiteImport } from "@jini-ai/devops/backup/site/import-verifier";
import type { CredentialWarning } from "@jini-ai/devops/backup/site/credential-warnings";
import type { PackageFileInventory } from "@jini-ai/devops/backup/site/share-file-policy";
import type { AgentPluginArchiveReaderPort } from "@jini-ai/core/contracts/site/agent-plugins-lifecycle";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { checkShareLimits, SHARE_LIMITS, type ShareDatabaseSanitizer } from "./share-policy.js";
import { archiveToRuntimePath, editedArchiveWarnings } from "./archive-paths.js";
import { buildManifestInventory, checkArchiveMatchesInventory, parseShareManifest, readListedFiles, refuseArchive, scanArchiveMetadata, sha256Hex } from "./import-verifier-inventory.js";
import { applyShareProjection } from "./import-verifier-projection.js";
import { readBundledPackageFiles } from "./package-file-inventory.js";

/** Tovu's archive inventory, path mapping, share limits and secret shapes for the engine import verifier. */
export const IMPORT_VERIFIER_HOST: SiteImportVerifierHost = {
  redactSecretShapes, checkShareLimits, refuseArchive, scanArchiveMetadata, parseShareManifest, buildManifestInventory, checkArchiveMatchesInventory,
  sha256Hex,
  // The inventory/manifest values are this host's own, handed back unchanged by the engine.
  readListedFiles: (required, optional) => readListedFiles(required as Parameters<typeof readListedFiles>[0], optional), applyShareProjection, archiveToRuntimePath, editedArchiveWarnings,
  maxArchiveBytes: SHARE_LIMITS.maxArchiveBytes,
  archiveTooLargeMessage: "Import exceeds the 300 MiB archive cap.",
  readBundledPackageFiles: () => readBundledPackageFiles(),
};

/** Verifies a share ZIP with this host's collaborators; see `IMPORT_VERIFIER_HOST`. */
export function verifySiteImport(required: { archive: Buffer; reader: AgentPluginArchiveReaderPort; sanitize: ShareDatabaseSanitizer; schema: { index: number; tag: string } }, optional: { signal?: AbortSignal; packageFiles?: PackageFileInventory; bundledImportPluginIds?: ReadonlySet<string> } = {}): Promise<VerifiedSiteImport & { credentialWarnings: readonly CredentialWarning[] }> {
  return verifyEngineSiteImport({ ...required, host: IMPORT_VERIFIER_HOST }, optional);
}
