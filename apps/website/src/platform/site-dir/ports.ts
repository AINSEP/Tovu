import type { Clock } from "@jini-ai/core/primitives";
import type { SecretSealerPort } from "@jini-ai/platform/secrets";
import type { ContentKernel } from "../db/content-kernel.js";
import type { OpenSiteStoreOptional, OpenSiteStoreRequired, SiteStore } from "./site-store.js";

/** Host-owned operations; site-dir preserves the ordering of their effects. */
export interface InitSiteDeps {
  seedNewSiteOwner(required: { kernel: ContentKernel; seed: import("../db/sqlite/content-db.js").ContentDbSeedData; adminPassword: string }, optional?: Record<string, never>): Promise<void>;
  runBootDataRepairs(required: { kernel: ContentKernel }, optional?: Record<string, never>): Promise<void>;
  openSiteStore(required: OpenSiteStoreRequired, optional?: OpenSiteStoreOptional): Promise<SiteStore>;
  sealConnectionStringForNewSite(required: {
    siteDir: string; siteKeyId: string; connectionString: string;
  }, optional?: Record<string, never>): Promise<{ readonly sealer: SecretSealerPort }>;
}

export interface BootSiteDirDeps extends Pick<InitSiteDeps, "runBootDataRepairs" | "openSiteStore"> {
  normalizeSiteVaultAtBoot(required: {
    kernel: ContentKernel; workspaceId: string; siteDir: string; clock: Clock;
  }, optional?: Record<string, never>): Promise<unknown>;
}
