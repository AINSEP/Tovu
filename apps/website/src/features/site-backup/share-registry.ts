import { SiteShareRegistry as JiniSiteShareRegistry } from "@jini-ai/devops/backup/site/share-registry";
import { SHARE_LIMITS } from "./share-policy.js";

export type { SiteShareRecord } from "@jini-ai/devops/backup/site/share-registry";

/** @file Binds Jini's share registry to this host's artifact naming, public file-name shape and archive cap. */

export const SHARE_ARTIFACT_SUFFIX = ".tovu.zip";
const SHARE_ARTIFACT_KEY = new RegExp('^_share/[A-Za-z]{16}/[a-z0-9][a-z0-9-]{0,79}' + SHARE_ARTIFACT_SUFFIX.replace(/\./g, '\\.') + '$');

export function isShareArtifactKey({ key }: { readonly key: string }, _optional: Record<string, never> = {}): boolean {
  return SHARE_ARTIFACT_KEY.test(key);
}

/** The public file names this host mints: `<stem>.tovu.zip`, or the dated static-export form. A token is only ever served with a matching file. */
export const SHARE_FILE = /^[a-z0-9][a-z0-9-]{0,79}(?:\.tovu|-static-\d{4}-\d{2}-\d{2}-\d{4})\.zip$/;

/** The registry with this host's values bound; construct it as `new SiteShareRegistry({ directory, now })` with the host clock (epoch ms) that expiry compares against. */
export class SiteShareRegistry extends JiniSiteShareRegistry {
  constructor(required: { directory: string; now?: () => number }, _optional: Record<string, never> = {}) {
    super({ directory: required.directory, host: { artifactSuffix: SHARE_ARTIFACT_SUFFIX, shareFile: SHARE_FILE, maxArchiveBytes: SHARE_LIMITS.maxArchiveBytes } }, required.now ? { now: required.now } : {});
  }
}
