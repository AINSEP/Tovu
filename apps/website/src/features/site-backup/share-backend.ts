import { DatabaseDiskSpaceError } from "@jini-ai/db/sqlite";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import {
  createSiteShareBackend as createEngineSiteShareBackend,
  type SiteShareBackend, type SiteShareBackendOptional, type SiteShareHost,
} from "@jini-ai/devops/backup/site/share-backend";
import type { StaticSitePorts } from "@jini-ai/devops/backup/site/static-copy";
import type { SiteSavedKeysPort } from "@jini-ai/devops/backup/site/saved-keys-port";
import type { SiteSharePlanContent } from "./plan-content.js";
import type { prepareShareContent } from "./share-preparation.js";
import { buildShareZip, buildStaticSiteZip } from "./share-zip.js";
import { captureStaticSite } from "./static-download-host.js";
import { createSiteShare, acknowledgeSiteShare, isOwnShareFolder, revokeSiteShare, type ShareDelivery } from "./share-service.js";
import { type SiteShareRegistry } from "./share-registry.js";
import { newShareIdentity } from "@jini-ai/devops/backup/site/share-registry";
import { allocateStaticExportThemes, parseStaticExportInput } from "./static-export-selection.js";
import { checkShareLimits } from "./share-policy.js";

/** Tovu's collaborators, limits, redaction rules and copy for the engine share backend. */
export const SITE_SHARE_HOST: SiteShareHost = {
  // Applies the engine diagnostics rules plus the host API-key shape (owner decision B258: no host key prefix in Jini).
  redact: redactSecretShapes,
  isClosedFailure: ({ cause }) => cause instanceof DatabaseDiskSpaceError,
  noThemeId: NO_THEME_ID,
  zipOnlyMessage: "ZIP ready. Download zip only. Connect a deployed Tovu site or S3-compatible storage to get a link.",
  downloadUrl: ({ site, shareId }) => `/api/admin/v1/workspaces/${encodeURIComponent(site)}/site-shares/${shareId}/download`,
  appVersionOf: ({ content }: { content: SiteSharePlanContent }) => content.tovuVersion,
  checkShareLimits, newShareIdentity, allocateStaticExportThemes, parseStaticExportInput, captureStaticSite,
  buildShareZip, buildStaticSiteZip, createSiteShare, acknowledgeSiteShare, revokeSiteShare, isOwnShareFolder,
};

type ShareBackendRequired = {
  registry: SiteShareRegistry;
  site: string;
  prepare: (required: { signal: AbortSignal; includeSavedKeys?: boolean; shareId: string; workspaceId: string }) => ReturnType<typeof prepareShareContent>;
  zip: typeof zipFolderFiles;
  delivery: (required: { provider?: string; binding?: string }) => Promise<ShareDelivery | undefined>;
  ownerPrincipalId?: PromiseLike<string> | string;
  savedKeys?: Pick<SiteSavedKeysPort, "reveal">;
  staticSite?: StaticSitePorts;
};

/** Binds the engine share backend to this host's collaborators; see `SITE_SHARE_HOST`. */
export function createSiteShareBackend(required: ShareBackendRequired, optional: SiteShareBackendOptional = {}): SiteShareBackend {
  return createEngineSiteShareBackend({ ...required, host: SITE_SHARE_HOST }, optional);
}
