import { bootSiteDir as bootSiteDirWithDeps, type BootSiteDirOptions, type BootSiteDirRequired, type BootSiteDirResult } from "#src/platform/site-dir/boot-site-dir";
import { initSite as initSiteWithDeps, type InitSiteOptions, type InitSiteRequired, type InitSiteResult } from "#src/platform/site-dir/init-site";
import { createSite as createSiteWithDeps, type CreateSiteOptions, type CreateSiteRequired, type CreateSiteResult } from "#src/platform/site-dir/site-registry";
import { runBootDataRepairs } from "./boot-data-repairs.js";
import { openSiteStore } from "./open-site-store.js";
import { sealConnectionStringForNewSite } from "./storage-secret.js";
import { normalizeSiteVaultAtBoot } from "./vault-boot.js";

const siteDirDeps = { runBootDataRepairs, openSiteStore, sealConnectionStringForNewSite, normalizeSiteVaultAtBoot };

/** Bind host operations without changing init's ordering, cleanup or error contract. @complexity O(1) overhead. */
export function initSite(required: Omit<InitSiteRequired, "deps">, optional: InitSiteOptions = {}): Promise<InitSiteResult> {
  return initSiteWithDeps({ ...required, deps: siteDirDeps }, optional);
}

/** Bind the same host operations for every folder consumer. @complexity O(1) overhead. */
export function bootSiteDir(required: Omit<BootSiteDirRequired, "deps">, optional: BootSiteDirOptions = {}): Promise<BootSiteDirResult> {
  return bootSiteDirWithDeps({ ...required, deps: siteDirDeps }, optional);
}

/** Reuse the catalog's creation lifecycle with the composed initializer. @complexity O(1) overhead. */
export function createSite(required: CreateSiteRequired, optional: CreateSiteOptions = {}): Promise<CreateSiteResult> {
  return createSiteWithDeps({ ...required, deps: { initSite } }, optional);
}
