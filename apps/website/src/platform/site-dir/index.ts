/**
 * @file Barrel for site-dir's cross-module data contract (ADS-memory/reports/architecture/
 * 2026-08-13-api-surface-trace-A.md, proposal S-1).
 *
 * Boot-only functions (`boot-site-dir.ts`, `init-site.ts`, `read-site-dir.ts`,
 * `resolve-install-dir-target.ts`, `resolve-workspace.ts`, `schema-guard.ts`'s guard) are deliberately
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
/**
 * `product-root.ts` joined 2026-09-10: `features/fs-files/layout.ts` is the first `features/**`
 * caller of `resolveProductRoot` (every prior caller — `init-site.ts`, `read-template.ts`,
 * `server/runtime/composition/deps.ts` — is either inside `site-dir` itself or a composition root),
 * so it needs the same door `site-root.ts` above already opened for `features/skills/layout.ts`/
 * `features/agent-plugins/layout.ts` (`no-deep-imports:platform/site-dir` is `error`-severity — see
 * `.dependency-cruiser.mjs`'s `PROMOTED_NO_DEEP_IMPORTS`).
 */
export { resolveAppDistDir, resolveCheckoutRoot, resolveProductRoot } from "./product-root.js";
export {
  SiteCorruptError,
  SiteDirInvalidError,
  SiteNewerThanRuntimeError,
  InitDirNotEmptyError,
  ValidationError,
  InternalError,
} from "./errors.js";
export type { ConfigJson } from "./types.js";
/**
 * `repair-site.ts` itself stays off this barrel for the same reason `init-site.ts`/`boot-site-dir.ts`
 * do — its one caller is `cli/commands/adopt.ts`'s own composition. Its ERROR class is the
 * exception, and belongs here for the identical reason every other error class above does:
 * `cli/errors.ts` maps it to an exit code, and `cli/errors.ts` is not a composition root, so the
 * door is the only way it can reach the type (`no-deep-imports:site-dir`).
 */
export { SiteRepairRefusedError, type SiteRepairRefusalReason } from "./repair-site.js";
export {
  listSites,
  createSite,
  describeSiteBinding,
  includeServingSite,
  SITE_NAME_PATTERN,
  type SiteBinding,
  type SiteListEntry,
  type ServingSiteListEntry,
  type SiteRegistration,
  type IncludeServingSiteRequired,
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
/**
 * `runtimeSchemaVersion` joined 2026-09-21: `features/site-backup/tool-registrations.ts` stamps it
 * into every backup plan, and it is the first `features/**` caller of `schema-guard.ts`. The guard
 * itself (`compareSchemaVersion`) stays boot-only, off this barrel (`no-deep-imports:platform/site-dir`
 * is `error`-severity).
 */
export { runtimeSchemaVersion, type RuntimeSchemaVersion } from "./schema-guard.js";
