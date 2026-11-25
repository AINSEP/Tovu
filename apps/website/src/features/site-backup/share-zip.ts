import { createBundledExportFilePolicy } from "./bundled-export-file-policy.js";
import { buildShareZip as buildJiniShareZip, buildStaticSiteZip as buildJiniStaticSiteZip, claimArchivePaths as claimJiniArchivePaths, type ShareZipHost, type ZipFolderFiles } from "@jini-ai/devops/backup/site/share-zip";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { buildArchiveManifest } from "./archive-manifest.js";
import { archiveSecretScanPath, runtimeToArchivePath } from "./archive-paths.js";
import { claimSharePath, requireShareSecretFree } from "./share-file-policy.js";
import type { SiteSharePlanContent } from "./plan-content.js";
import { checkShareLimits, SHARE_LIMITS } from "./share-policy.js";
import { readPlannedFile } from "./sources.js";
import { staticDownloadLayout } from "./static-download-host.js";

/** @file Binds Jini's share ZIP builder to Tovu's caps, share path/secret rules, manifest codec, archive-path mapping, planned-file read, static layout and bundled-file policy. */

/** Tovu's values for the share ZIP builder; the encoder itself is passed per call (`zip`). */
const SHARE_ZIP_HOST: ShareZipHost = {
  limits: SHARE_LIMITS,
  archiveTooLargeMessage: "Share exceeds the 300 MiB ZIP archive cap.",
  manifestTooLargeMessage: "Share manifest exceeds 2 MiB.",
  checkShareLimits, requireShareSecretFree, claimSharePath, buildArchiveManifest, runtimeToArchivePath, archiveSecretScanPath, readPlannedFile, staticDownloadLayout,
  defaultBundledFilePolicy: () => createBundledExportFilePolicy({}),
};

type Optional<F extends (required: never, optional: never) => unknown> = Parameters<F>[1];

/** Claims every entry in one alias set for ZIPs and commits; only backups reserve the manifest path. */
export function claimArchivePaths(required: Omit<Parameters<typeof claimJiniArchivePaths>[0], "host">, optional: Optional<typeof claimJiniArchivePaths> = {}): void {
  claimJiniArchivePaths({ ...required, host: SHARE_ZIP_HOST }, optional);
}

/** The ZIP target of a share plan with Tovu's host values bound; see Jini's `buildShareZip`. */
export function buildShareZip(required: { plan: SiteSharePlanContent; zip: typeof zipFolderFiles }, optional: Optional<typeof buildJiniShareZip> = {}): ReturnType<typeof buildJiniShareZip> {
  return buildJiniShareZip({ ...required, zip: required.zip as ZipFolderFiles, host: SHARE_ZIP_HOST }, optional);
}

/** The static-only ZIP with Tovu's host values bound; see Jini's `buildStaticSiteZip`. */
export function buildStaticSiteZip(required: Omit<Parameters<typeof buildJiniStaticSiteZip>[0], "host" | "zip"> & { zip: typeof zipFolderFiles }, optional: Optional<typeof buildJiniStaticSiteZip> = {}): ReturnType<typeof buildJiniStaticSiteZip> {
  return buildJiniStaticSiteZip({ ...required, zip: required.zip as ZipFolderFiles, host: SHARE_ZIP_HOST }, optional);
}
