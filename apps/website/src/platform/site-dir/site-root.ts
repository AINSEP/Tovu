import path from "node:path";

/**
 * @file The `sites/<name>/` runtime-data root — one resolver, shared by every module that needs to
 * know where THIS instance's site folder lives.
 *
 * Purpose:
 * Replaces the old `infra/` convention (2026-08-27). `infra/` conflated two things with opposite
 * lifecycles: the repo's own scratch space, and the SITE's data. Upgrading Tovu should replace the
 * first and never touch the second — and keeping them in one directory is how a site's themes ended
 * up living inside the package at `src/themes/`, where an upgrade destroys them along with their
 * own "reset to original" backups (`__original-themes__/`).
 *
 * A site is a portable folder that owns its own `content.db`, `uploads/`, `themes/`, `skills/`,
 * `agent-plugins/` and journals — ADR-012's install-dir model, already implemented for the CLI by
 * SPEC-003's `tovu init` / `tovu serve <dir>` (`boot-site-dir.ts`). This function is that same
 * model's DEFAULT for hosts that were never given an install dir: the non-CLI boot path
 * (`src/index.ts` -> `server/deps.ts`) and the two feature layouts below, all of which previously
 * derived their own `<cwd>/infra/...` path independently.
 *
 * Architectural role:
 * `site-dir` domain logic, and deliberately so: this IS the install-dir question, asked by callers
 * that have no `<dir>` argument to answer it with. Pure path computation — no I/O, no `src/server`
 * or `src/cli` import (INV-06), which is what lets `src/features/{skills,agent-plugins}/layout.ts`
 * share it without either feature reaching into the composition root.
 *
 * Callers: `server/deps.ts`'s `siteDir()`, `features/skills/layout.ts`'s `resolveSkillLayout`,
 * `features/agent-plugins/layout.ts`'s `resolveAgentPluginLayout`.
 */

/** The folder name under `sites/` used when neither `TOVU_SITE_DIR` nor `TOVU_SITE` is set. */
export const DEFAULT_SITE_NAME = "tovu-com";

export interface ResolveSiteRootOptional {
  /** Defaults to `process.cwd()` — injectable so callers are testable without `process.chdir()`. */
  readonly cwd?: string;
  /** Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Resolves the absolute path of the one site folder this process serves.
 *
 * Two overrides, in precedence order:
 * - `TOVU_SITE_DIR` — path to the site folder itself. What a container volume mount or Tovu-Runner
 *   passes; the env-var equivalent of `tovu serve <dir>`. Not required to be absolute (it is passed
 *   through `path.resolve`), matching `TOVU_CONTENT_DB`/`TOVU_THEMES_DIR` rather than the stricter
 *   `TOVU_AGENT_PLUGINS_DIR`, which validates absoluteness for its own frozen-tree reasons.
 * - `TOVU_SITE` — just the folder NAME under `<cwd>/sites/`. The convenience form for running a
 *   second local site without spelling out a full path.
 *
 * Individual `TOVU_*_DIR` variables still override their own subpath independently at their own
 * call sites, so a deployment that relocates exactly one directory (a large uploads volume, say)
 * does not have to move the rest.
 *
 * @param optional.cwd - Base for the non-`TOVU_SITE_DIR` form. Defaults to `process.cwd()`.
 * @param optional.env - Environment to read the two overrides from. Defaults to `process.env`.
 * @returns Absolute path to the site folder. The folder is not required to exist — creating it is
 *   the caller's business (`openContentDb` does not create its parent, so boot fails with
 *   `SQLITE_CANTOPEN` if nothing has).
 * @complexity O(1).
 */
export function resolveSiteRoot(optional: ResolveSiteRootOptional = {}): string {
  const cwd = optional.cwd ?? process.cwd();
  const env = optional.env ?? process.env;

  // `!== undefined`, not a truthiness check: an explicitly empty override is a caller error worth
  // surfacing as a wrong path, not silently swallowed into the default site.
  if (env.TOVU_SITE_DIR !== undefined) return path.resolve(env.TOVU_SITE_DIR);

  return path.resolve(cwd, "sites", env.TOVU_SITE ?? DEFAULT_SITE_NAME);
}
