import { createArchiveManifestCodec } from "@jini-ai/devops/backup/site/archive-manifest";
import { isBundledSchemaIdentity } from "#src/platform/site-dir/index";
import { claimSharePath } from "./share-file-policy.js";
import { SHARE_LIMITS, SHARE_VERSION_MISMATCH_MESSAGE } from "./share-policy.js";
import type { SiteBackupInclude } from "@jini-ai/devops/backup/site/sources";

/** The share manifest contract bound to Tovu's file and manifest caps, path-claim rules, schema journal and version-mismatch advice. */
export const { buildArchiveManifest, parseArchiveManifest } = createArchiveManifestCodec<SiteBackupInclude>({
  limits: { maxManifestBytes: SHARE_LIMITS.maxManifestBytes, maxFiles: SHARE_LIMITS.maxFiles },
  versionMismatchMessage: SHARE_VERSION_MISMATCH_MESSAGE,
  claimSharePath,
  isBundledSchemaIdentity,
});
