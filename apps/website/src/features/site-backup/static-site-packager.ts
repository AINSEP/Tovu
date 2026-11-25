import { createStaticSitePackager as createJiniStaticSitePackager } from "@jini-ai/devops/backup/site/static-site-packager";
import { claimArchivePaths } from "./share-zip.js";
import { STATIC_DOWNLOAD_HOST } from "./static-download-host.js";

/** @file Binds Jini's static-site packager to this host's download policy and archive-wide path claim. */

/** Stateless and dependency-free: one instance serves every commit and preview. */
export function createStaticSitePackager(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): ReturnType<typeof createJiniStaticSitePackager> {
  return createJiniStaticSitePackager({ host: STATIC_DOWNLOAD_HOST, claimArchivePaths });
}
