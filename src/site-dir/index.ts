/**
 * @file Barrel for site-dir's cross-module data contract (ADS-memory/reports/architecture/
 * 2026-08-13-api-surface-trace-A.md, proposal S-1).
 *
 * Boot-only functions (`boot-site-dir.ts`, `init-site.ts`, `read-site-dir.ts`,
 * `resolve-install-dir-target.ts`, `resolve-workspace.ts`, `schema-guard.ts`) are deliberately
 * NOT re-exported here — each has exactly one caller in `cli/**`/`server/deps.ts`'s own boot
 * sequence, so there is nothing to consolidate behind a door. Only the typed exit-code errors
 * and `ConfigJson` — the shapes `cli/errors.ts` and `cli/commands/serve.ts` need — live here.
 */
export {
  SiteCorruptError,
  SiteDirInvalidError,
  SiteNewerThanRuntimeError,
  InitDirNotEmptyError,
  ValidationError,
  InternalError,
} from "./errors.js";
export type { ConfigJson } from "./types.js";
