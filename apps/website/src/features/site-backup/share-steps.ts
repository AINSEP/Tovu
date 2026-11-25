import { createShareSteps } from "@jini-ai/devops/backup/site/share-preparation-steps";
import { MAX_DOCUMENT_BYTES } from "@jini-ai/cms/media";
import { captureDatabaseSnapshot, collectSiteBackupFiles, readPlannedFile, type CollectedSiteBackupFiles, type PlannedDiskFile, type SiteBackupInclude, type SiteBackupSources } from "./sources.js";
import { checkShareLimits, SHARE_LIMITS } from "./share-policy.js";

/** Tovu's share caps and their wording, the site file walker and the snapshot reader, bound into Jini's share steps. */
export const shareSteps = createShareSteps<SiteBackupSources, SiteBackupInclude, PlannedDiskFile, CollectedSiteBackupFiles>({
  limits: { maxExpandedBytes: SHARE_LIMITS.maxExpandedBytes, maxManifestBytes: SHARE_LIMITS.maxManifestBytes, maxDocumentBytes: MAX_DOCUMENT_BYTES },
  messages: {
    settingsTooLarge: ({ path }) => `Share settings '${path}' exceeds 2 MiB.`,
    invalidDocument: "Library document blobs must be non-empty and at most 50 MiB; nothing was shared.",
  },
  checkShareLimits,
  captureDatabaseSnapshot,
  collectFiles: collectSiteBackupFiles,
  readPlannedFile,
});
