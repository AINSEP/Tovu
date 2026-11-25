import { SiteShareRegistry as JiniSiteShareRegistry } from "@jini-ai/devops/backup/site/share-registry";
import { SHARE_LIMITS } from "./share-policy.js";

/** @file Binds Jini's share registry to this host's artifact naming, public file-name shape and archive cap. */

/** The public file names this host mints: `<stem>.tovu.zip`, or the dated static-export form. A token is only ever served with a matching file. */
export const SHARE_FILE = /^[a-z0-9][a-z0-9-]{0,79}(?:\.tovu|-static-\d{4}-\d{2}-\d{2}-\d{4})\.zip$/;

/** The registry with this host's values bound; construct it as `new SiteShareRegistry({ directory })`. */
export class SiteShareRegistry extends JiniSiteShareRegistry {
  constructor(required: { directory: string }, _optional: Record<string, never> = {}) {
    super({ directory: required.directory, host: { artifactSuffix: ".tovu.zip", shareFile: SHARE_FILE, maxArchiveBytes: SHARE_LIMITS.maxArchiveBytes } });
  }
}
