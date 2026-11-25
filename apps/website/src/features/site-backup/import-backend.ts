import { FetchTimeoutError } from "@jini-ai/platform/fetch-with-timeout";
import {
  createSiteImportBackend as createEngineSiteImportBackend,
  type SiteImportBackend, type SiteImportBackendOptional, type SiteImportBackendRequired, type SiteImportHost,
} from "@jini-ai/devops/backup/site/import-backend";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { SHARE_LIMITS } from "@tovu/contracts/site-share-limits";
import type { CreateSitePort, SitesWorkspace } from "#src/platform/site-dir/index";
import { DEFAULT_OWNER_PASSWORD, assertPortableSiteName, reconcileSiteCreation, resolveNewSiteAdminPassword } from "#src/platform/site-dir/index";
import { tidyImportDatabases } from "./import-database.js";
import { stageVerifiedImport, stagedImportWarnings } from "./import-restore.js";
import type { ThemePlacementChecks } from "./import-restore-placement.js";
import { verifySiteImport } from "./import-verifier.js";

/** Where the admin routes serve an import's owner-setup page, used when the caller supplies no other base. */
const DEFAULT_SETUP_BASE = "/api/admin/v1/site-imports";

/**
 * Tovu's limits, refusal copy, redaction policy, archive verifier, stage writer and site-directory rules
 * for the engine import backend. The theme owner's placement checks, which staging reuses for its
 * kept-off notices, are bound at the host composition root and passed in here.
 */
export function createSiteImportHost(required: { themeChecks: ThemePlacementChecks }): SiteImportHost<SitesWorkspace> {
  return {
    maxArchiveBytes: SHARE_LIMITS.maxArchiveBytes,
    maxExpandedBytes: SHARE_LIMITS.maxExpandedBytes,
    copy: {
      homeSpace: "Import requires 900 MiB of free space on the sites-home volume.",
      stagingSpace: "Import requires 900 MiB of free private staging space.",
      downloadFailed: "Share download failed or exceeded the 300 MiB archive cap.",
      uploadTooLarge: "Upload exceeds the 300 MiB ZIP cap.",
    },
    developmentDefaultPassword: DEFAULT_OWNER_PASSWORD,
    errorLogOptions: TOVU_ERROR_REDACTION_OPTIONS,
    timeoutMsOf: ({ error }) => (error instanceof FetchTimeoutError ? error.timeoutMs : undefined),
    assertPortableName: assertPortableSiteName,
    reconcileCreation: reconcileSiteCreation,
    stageVerifiedImport: (input) => stageVerifiedImport({ ...input, themeChecks: required.themeChecks }),
    verifySiteImport, stagedImportWarnings, resolveNewSiteAdminPassword, tidyImportDatabases,
  };
}

type HostImportBackendRequired = Omit<SiteImportBackendRequired<SitesWorkspace>, "host" | "setupBase" | "createSite" | "creationOptions"> & {
  createSite: CreateSitePort;
  setupBase?: string;
  creationOptions?: Parameters<CreateSitePort>[1];
  /** The theme owner's placement checks staging reuses for its kept-off notices (bound at the host). */
  themeChecks: ThemePlacementChecks;
};
type HostImportBackendOptional = Omit<SiteImportBackendOptional<SitesWorkspace>, "createSite"> & { createSite?: CreateSitePort };

/** Binds the engine import backend to this host's collaborators; see `createSiteImportHost`. */
export function createSiteImportBackend(required: HostImportBackendRequired, optional: HostImportBackendOptional = {}): SiteImportBackend {
  const { themeChecks, ...engineRequired } = required;
  return createEngineSiteImportBackend({
    ...(engineRequired as unknown as Omit<SiteImportBackendRequired<SitesWorkspace>, "host" | "setupBase">),
    setupBase: required.setupBase ?? DEFAULT_SETUP_BASE, host: createSiteImportHost({ themeChecks }),
  }, optional as unknown as SiteImportBackendOptional<SitesWorkspace>);
}
