/**
 * @file Barrel for site-dir's cross-module data contract (ADS-memory/reports/architecture/
 * 2026-08-13-api-surface-trace-A.md, proposal S-1).
 *
 * Boot-only functions (`boot-site-dir.ts`, `init-site.ts`, `read-site-dir.ts`,
 * `resolve-install-dir-target.ts`, `resolve-workspace.ts`, `schema-guard.ts`) are deliberately
 * NOT re-exported here — each has exactly one caller in `cli/**`/`server/deps.ts`'s own boot
 * sequence, so there is nothing to consolidate behind a door. Only the typed exit-code errors
 * and `ConfigJson` — the shapes `cli/errors.ts` and `cli/commands/serve.ts` need — live here.
 *
 * `site-root.ts` IS re-exported, unlike the boot-only files above, because it is the opposite
 * case: three independent callers in three different top-level modules (`server/deps.ts`,
 * `features/skills/layout.ts`, `features/agent-plugins/layout.ts`) that each used to compute
 * `<cwd>/infra/...` for themselves. That is exactly the "cross-module data contract" this barrel
 * exists for, and routing the two feature callers through the door keeps them off a deep import
 * (`no-deep-imports:site-dir`).
 *
 * `site-registry.ts`/`active-site.ts` joined 2026-09-04 (sites-switcher decision) for the same
 * reason: their one caller, the admin "Sites" route module
 * (`server/inbound/admin-http/routes/system/sites.ts`), sits outside `site-dir` and outside the
 * `COMPOSITION_ROOTS` exemption list, so `no-deep-imports:site-dir` requires the door.
 *
 * `duplicate-site.ts` joined 2026-09-05 for the identical reason: its caller is the new `sites`
 * assistant-tool domain (`features/sites/tool-registrations.ts`), also outside `site-dir`.
 */
export { DEFAULT_SITE_NAME, resolveSiteRoot, type ResolveSiteRootOptional } from "./site-root.js";
export {
  SiteCorruptError,
  SiteDirInvalidError,
  SiteNewerThanRuntimeError,
  InitDirNotEmptyError,
  ValidationError,
  InternalError,
} from "./errors.js";
export type { ConfigJson } from "./types.js";
export {
  listSites,
  createSite,
  describeSiteBinding,
  SITE_NAME_PATTERN,
  type SiteBinding,
  type SiteListEntry,
  type ListSitesOptional,
  type CreateSiteRequired,
  type CreateSiteResult,
} from "./site-registry.js";
export {
  persistActiveSite,
  readPersistedActiveSite,
  type PersistActiveSiteRequired,
  type ActiveSiteEnvOptional,
} from "./active-site.js";
export { duplicateSite, type DuplicateSiteRequired, type DuplicateSiteResult } from "./duplicate-site.js";
