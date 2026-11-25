import { verifySiteImport as verifyEngineSiteImport, type SiteImportVerifierHost, type VerifiedSiteImport } from "@jini-ai/devops/backup/site/import-verifier";
import type { CredentialWarning } from "@jini-ai/devops/backup/site/credential-warnings";
import type { PackageFileInventory } from "@jini-ai/devops/backup/site/share-file-policy";
import type { AgentPluginArchiveReaderPort } from "@jini-ai/core/contracts/site/agent-plugins-lifecycle";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import {
  buildManifestInventory as buildJiniManifestInventory, checkArchiveMatchesInventory, parseShareManifest as parseJiniShareManifest, readListedFiles as readJiniListedFiles,
  refuseArchive, scanArchiveMetadata as scanJiniArchiveMetadata, sha256Hex, type ImportInventoryHost,
} from "@jini-ai/devops/backup/site/import-verifier-inventory";
import { checkShareLimits, SHARE_LIMITS, type ShareDatabaseSanitizer } from "./share-policy.js";
import { archiveCodeUnit, archiveSecretScanPath, archiveToRuntimePath, editedArchiveWarnings } from "./archive-paths.js";
import { parseArchiveManifest } from "./archive-manifest.js";
import { claimSharePath, excludedSharePath, requireShareSecretFree, validateSharePath } from "./share-file-policy.js";
import { applyShareProjection } from "./import-verifier-projection.js";
import { readBundledPackageFiles } from "./package-file-inventory.js";

/** Tovu's archive inventory host: the share caps, path/secret rules, manifest codec, portable roots and changed-file sentence. */
const INVENTORY_HOST: ImportInventoryHost = {
  limits: SHARE_LIMITS,
  inventoryRoots: /^(?:media|themes|plugins|agent-plugins|skills)\/.+/,
  settingsFiles: ["settings.json"],
  /** Same plain sentence the desktop shows for a file whose contents no longer match what was exported. */
  changedArchiveMessage: "That file looks damaged or changed since it was exported. No website was created. Export it again and import the fresh copy.",
  checkShareLimits, validateSharePath, excludedSharePath, requireShareSecretFree, claimSharePath, parseArchiveManifest, archiveCodeUnit, archiveSecretScanPath,
};

/** Binds a Jini inventory operation to {@link INVENTORY_HOST}. */
function withInventoryHost<R extends { host: ImportInventoryHost }, A extends unknown[], T>(operation: (required: R, ...rest: A) => T) {
  return (required: Omit<R, "host">, ...rest: A): T => operation({ ...required, host: INVENTORY_HOST } as R, ...rest);
}
export const scanArchiveMetadata = withInventoryHost(scanJiniArchiveMetadata);
export const parseShareManifest = withInventoryHost(parseJiniShareManifest);
export const buildManifestInventory = withInventoryHost(buildJiniManifestInventory);
export const readListedFiles = withInventoryHost(readJiniListedFiles);

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
