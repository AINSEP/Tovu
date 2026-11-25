import {
  buildSiteBackupManifest as buildBackupManifest,
  captureDatabaseSnapshot as captureSnapshot,
  checkSiteBackupLimits as checkBackupLimits,
  collectSiteBackupFiles as collectBackupFiles,
  readPlannedFile as readPlanned,
  type CollectedSiteBackupFiles,
  type DatabaseSnapshotResult,
  type PlannedDiskFile,
  type ReadPlannedFileResult,
  type SiteBackupInclude,
  type SiteBackupLimitsResult,
  type SiteBackupManifestInput,
  type SiteBackupSourceDeps,
  type SiteBackupSources as JiniSiteBackupSources,
} from "@jini-ai/devops/backup/site/sources";
import { readReviewedFile, reviewedFileIdentity } from "@jini-ai/platform/fs";
import { siteTempRoot, SITE_TEMP_PREFIXES, type OwnedTempRootScope } from "#src/platform/temp/site-temp-roots";
import { listSitePluginPackage, PluginPackagePathError } from "@jini-ai/plugins/host/node";
import { TOVU_SITE_PLUGIN_MANIFEST_READ } from "#src/features/plugin-runtime/site-plugin-vocabulary";
import type { DbOpsPort } from "@jini-ai/core/contracts/site/gated-mutations-ports";
import { excludedSharePath, validateSharePath } from "./share-file-policy.js";
import { checkShareLimits } from "./share-policy.js";

/**
 * @file Tovu's binding of the site-backup source reads (`@jini-ai/devops/backup/site/sources`): the
 * caps, the manifest's file name and identity, the snapshot folder prefix and the media note are
 * Tovu's own values; the share rules, the plugin package listing and the reviewed-file reads are
 * handed in from the host packages that own them.
 */

const MIB = 1024 * 1024;

/** This tool's own caps, checked before anything is uploaded, so one call cannot hold an unbounded
 *  number of blob uploads open against the site's own request budget. The host's per-file limit is
 *  not here: the host's plugin declares it (`SiteBackupHostLimit`). */
export const SITE_BACKUP_LIMITS = { maxTotalBytes: 1024 * MIB, maxFiles: 3000 } as const;

/** Where the manifest lives inside the backup folder. */
export const SITE_BACKUP_MANIFEST_PATH = "tovu-backup.json";

/** Where each scope's bytes live, plus the build version the manifest records. */
export interface SiteBackupSources extends JiniSiteBackupSources {
  readonly tovuVersion: string;
}

const SOURCE_DEPS: SiteBackupSourceDeps = {
  sharePolicy: { excludedSharePath, validateSharePath, checkShareLimits },
  // Bound to the host manifest policy so a backup lists the legacy-named manifest the install accepted.
  listSitePluginPackage: (required) => listSitePluginPackage(required, TOVU_SITE_PLUGIN_MANIFEST_READ),
  isPluginPackagePathError: (error) => error instanceof PluginPackagePathError,
  readReviewedFile,
  reviewedFileIdentity,
  /** The one media note a backup can carry, and why: the bytes are not on this machine. */
  mediaInObjectStorageNote:
    "Media is stored in object storage (TOVU_MEDIA_BLOB_STORE=s3 or the site's media storage setting), not in a folder on this server, so media files are not in this backup. The database still lists every media item.",
};

/** Every file on disk the switched-on scopes pick up (see the engine's `collectSiteBackupFiles`). */
export function collectSiteBackupFiles(input: { sources: JiniSiteBackupSources; include: SiteBackupInclude }, optional: Parameters<typeof collectBackupFiles>[1] = {}): Promise<CollectedSiteBackupFiles> {
  return collectBackupFiles({ ...input, deps: SOURCE_DEPS }, optional);
}

/** Reads a planned file at push time, refusing it if it is no longer the file the human reviewed. */
export function readPlannedFile(file: PlannedDiskFile, optional: Omit<Parameters<typeof readPlanned>[1], "deps"> = {}): Promise<ReadPlannedFileResult> {
  return readPlanned(file, { ...optional, deps: SOURCE_DEPS });
}

/** A consistent in-memory copy of the site database; a site export's temp folder is `tovu-snapshot-*`. */
export function captureDatabaseSnapshot(input: { dbOps: DbOpsPort; scopeId: string }, optional: { maxBytes?: number; snapshotRoot?: string; tempRoot?: OwnedTempRootScope } = {}): Promise<DatabaseSnapshotResult> {
  // P11: the snapshot stages in an owned, locked temp root (under `snapshotRoot` when given) that the temp-root tidy recognises.
  const tempRoot = optional.tempRoot ?? siteTempRoot({ prefix: SITE_TEMP_PREFIXES.snapshot, ...(optional.snapshotRoot === undefined ? {} : { parent: optional.snapshotRoot }) });
  return captureSnapshot({ ...input, snapshotDirPrefix: SITE_TEMP_PREFIXES.snapshot }, { ...optional, tempRoot });
}

/** Checks a backup against {@link SITE_BACKUP_LIMITS} (or the caps a test injects) and the host's per-file limit. */
export function checkSiteBackupLimits(input: { files: readonly { path: string; bytes: number }[]; host: Parameters<typeof checkBackupLimits>[0]["host"] }, { limits = SITE_BACKUP_LIMITS }: { limits?: Parameters<typeof checkBackupLimits>[0]["limits"] } = {}): SiteBackupLimitsResult {
  return checkBackupLimits({ ...input, limits });
}

/** The backup's `tovu-backup.json` body: the Tovu build version, schema, scopes and every file's sha256. */
export function buildSiteBackupManifest(input: Omit<SiteBackupManifestInput, "hostVersion"> & { readonly tovuVersion: string }): string {
  const { tovuVersion, ...rest } = input;
  return buildBackupManifest({ ...rest, hostVersion: tovuVersion }, { format: "tovu-site-backup", producerKey: "tovu" });
}
