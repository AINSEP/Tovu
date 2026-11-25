import { DatabaseDiskSpaceError } from "@jini-ai/db/sqlite";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import {
  createSiteShareBackend as createEngineSiteShareBackend,
  type SiteShareBackend, type SiteShareBackendOptional, type SiteShareBackendRequired, type SiteShareHost,
} from "@jini-ai/devops/backup/site/share-backend";
import type { StaticSitePorts } from "@jini-ai/devops/backup/site/static-copy";
import type { BundledExportFilePolicy } from "@jini-ai/devops/backup/site/bundled-export-file-policy";
import type { SiteSavedKeysPort } from "@jini-ai/devops/backup/site/saved-keys-port";
import type { SiteSharePlanContent } from "./plan-content.js";
import type { prepareShareContent } from "./share-preparation.js";
import { buildShareZip, buildStaticSiteZip } from "./share-zip.js";
import { captureStaticSite } from "./static-download-host.js";
import { createSiteShare, acknowledgeSiteShare, isOwnShareFolder, revokeSiteShare } from "./share-service.js";
import type { ShareDelivery } from "@jini-ai/devops/backup/site/share-hosting";
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
  checkShareLimits, newShareIdentity, allocateStaticExportThemes, parseStaticExportInput, captureStaticSite, buildShareZip, isOwnShareFolder,
  // The engine treats registry/delivery/zip/themes as opaque values it only hands back; they are always this host's own.
  buildStaticSiteZip: (required, optional) => buildStaticSiteZip(required as Parameters<typeof buildStaticSiteZip>[0], optional),
  createSiteShare: (required, optional) => createSiteShare(required as Parameters<typeof createSiteShare>[0], optional as Parameters<typeof createSiteShare>[1]),
  acknowledgeSiteShare: (required, optional) => acknowledgeSiteShare(required as Parameters<typeof acknowledgeSiteShare>[0], optional as Parameters<typeof acknowledgeSiteShare>[1]),
  revokeSiteShare: (required, optional) => revokeSiteShare(required as Parameters<typeof revokeSiteShare>[0], optional as Parameters<typeof revokeSiteShare>[1]),
};
/** The engine backend, whose registry is this host's concrete registry (routes also disable/delete through it). */
export type HostSiteShareBackend = SiteShareBackend & { readonly registry: SiteShareRegistry };

type ShareBackendRequired = {
  registry: SiteShareRegistry;
  site: string;
  prepare: (required: { signal: AbortSignal; includeSavedKeys?: boolean; shareId: string; workspaceId: string }) => ReturnType<typeof prepareShareContent>;
  zip: typeof zipFolderFiles;
  delivery: (required: { provider?: string; binding?: string }) => Promise<ShareDelivery | undefined>;
  ownerPrincipalId?: PromiseLike<string> | string;
  savedKeys?: Pick<SiteSavedKeysPort, "reveal">;
  staticSite?: StaticSitePorts;
  /** A fresh export-local bundled-file policy per archive (it caches resolved package roots for one export only). */
  createBundledFilePolicy: () => BundledExportFilePolicy;
};

/** Binds the engine share backend to this host's collaborators; see `SITE_SHARE_HOST`. Each backup
 * archive gets a fresh bundled-file policy from the injected `createBundledFilePolicy`. */
export function createSiteShareBackend(required: ShareBackendRequired, optional: SiteShareBackendOptional = {}): HostSiteShareBackend {
  const { createBundledFilePolicy, ...engineRequired } = required;
  const host: SiteShareHost = {
    ...SITE_SHARE_HOST,
    buildShareZip: (zipRequired, zipOptional) => buildShareZip(zipRequired as Parameters<typeof buildShareZip>[0], { ...zipOptional, bundledFilePolicy: createBundledFilePolicy() }),
  };
  return createEngineSiteShareBackend({ ...(engineRequired as unknown as Omit<SiteShareBackendRequired, "host">), host }, optional) as HostSiteShareBackend;
}
