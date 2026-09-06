import type { AuthorizeFn } from "@jini-ai/cms/core";

import {
  duplicateSite as duplicateSiteReal,
  listSites as listSitesReal,
  type DuplicateSiteResult,
  type SiteListEntry,
} from "#src/platform/site-dir/index";

/**
 * @file The exact slice of a composition root's deps bag `sites_duplicate_site`'s handler reads —
 * declared STRUCTURALLY (not `Pick<RouteDeps, ...>`), the same discipline
 * `features/site-inspection/deps.ts`/`features/theme/tool-registrations.ts`'s `ThemeToolDeps`
 * already use, so this module carries no back-edge into the composition root for the `RouteDeps`
 * god type.
 *
 * `listSites`/`duplicateSite` default to the real `platform/site-dir` implementations right here —
 * `features/**` is allowed to import `platform/**` (`.dependency-cruiser.mjs`'s
 * `feature-no-server-or-framework-imports` only forbids `apps/website/src/server`/Express/
 * `apps/admin`). `isSiteSwitcherEnabled` is deliberately NOT defaulted here: its real
 * implementation lives under `server/runtime/composition/` (`site-switcher-enabled.ts`), which
 * THAT rule DOES forbid a `features/**` module from importing. Exactly like
 * `assistant/tool-registrations.ts`'s own `StaticPublishToolDeps.vendorCredentials` (built once in
 * that file, into `enrichedRouteDeps`, because `features/deployments/publish-agent-tools.ts` cannot
 * import `features/vendor-credentials` without closing a module cycle), this domain's
 * `isSiteSwitcherEnabled` is filled in by `assistant/tool-registrations.ts` — the one file already
 * established as "sees both sides" for this exact shape of cross-layer wiring — not resolved here.
 * `tool-registrations.ts`'s handler falls back to `false` (disabled) if it is ever still absent,
 * matching the flag's own documented default-OFF safety posture rather than assuming enabled.
 *
 * Every field is OPTIONAL, mirroring `server/inbound/admin-http/routes/system/sites.ts`'s own
 * `AdminSitesDeps` exactly (that route's `listSites?`/`createSite?`/`isSiteSwitcherEnabled?`
 * fields): a real `RouteDeps` object already satisfies this interface as-is (it already carries
 * `workspaceId`/`authorize`; it simply has no `duplicateSite`/`listSites`/`isSiteSwitcherEnabled`/
 * `cwd` keys at all, which is exactly what an optional field allows) — so wiring this domain into
 * the assistant's tool catalog needs no change to how a real `RouteDeps` is constructed. A test
 * supplies fakes for the optional fields instead of touching a real filesystem or `sites/`.
 */
export interface SitesToolDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  /** Defaults to the real `site-dir` implementation. Injectable so a test never touches a real
   *  `sites/` directory. */
  listSites?: (optional?: { cwd?: string }) => readonly SiteListEntry[];
  /** Defaults to the real `duplicateSite`. Injectable for the same reason as `listSites`. */
  duplicateSite?: (required: { sourceDir: string; targetDir: string; name?: string }) => DuplicateSiteResult;
  /** Filled in by `assistant/tool-registrations.ts`'s `enrichedRouteDeps` — see this file's own
   *  header. Falls back to `false` (disabled) if ever absent by the time the handler runs. */
  isSiteSwitcherEnabled?: () => boolean;
  /** Defaults to `process.cwd()` — the base `sites/` is resolved under, matching every other
   *  `site-dir` caller's own default. */
  cwd?: string;
}

/** The three `site-dir`-local implementations, bundled once so `tool-registrations.ts` reads one
 *  small object instead of three separate `??` fallbacks scattered through its handler. Does NOT
 *  cover `isSiteSwitcherEnabled` — see this file's own header for why that one is resolved by
 *  `assistant/tool-registrations.ts` instead. */
export interface ResolvedSitesDeps {
  listSites: (optional?: { cwd?: string }) => readonly SiteListEntry[];
  duplicateSite: (required: { sourceDir: string; targetDir: string; name?: string }) => DuplicateSiteResult;
  cwd: string;
}

/**
 * Resolves `deps`'s `site-dir`-backed optional fields to their real implementations, falling back
 * exactly the way `AdminSitesDeps`'s own `deps.listSites ?? listSitesReal` pattern does.
 *
 * @complexity O(1) — three nullish-coalescing reads, no I/O of its own.
 */
export function resolveSitesDeps(deps: SitesToolDeps): ResolvedSitesDeps {
  return {
    listSites: deps.listSites ?? listSitesReal,
    duplicateSite: deps.duplicateSite ?? duplicateSiteReal,
    cwd: deps.cwd ?? process.cwd(),
  };
}
