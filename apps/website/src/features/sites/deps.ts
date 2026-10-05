import type { AuthorizeFn } from "@jini-ai/cms/core";

import {
  duplicateSite as duplicateSiteReal,
  listSites as listSitesReal,
  type DuplicateSiteResult,
  switcherBaseForBinding,
  type SiteBinding,
  type SiteListEntry,
} from "#src/platform/site-dir/index";

import type { ActivateSitePorts, CreateSiteForOwnerPorts } from "./site-admin.js";

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
 * implementation (`platform/site-dir/site-switcher-enabled.ts`, formerly under
 * `server/runtime/composition/`, which THAT rule forbids a `features/**` module from importing) is
 * supplied from outside. Exactly like
 * `assistant/tool-registrations.ts`'s own `StaticPublishToolDeps.vendorCredentials` (built once in
 * that file, into `enrichedRouteDeps`, because `features/deployments/publish-agent-tools.ts` cannot
 * import `features/vendor-credentials` without closing a module cycle), this domain's
 * `isSiteSwitcherEnabled` is filled in by `assistant/tool-registrations.ts` — the one file already
 * established as "sees both sides" for this exact shape of cross-layer wiring — not resolved here.
 * `tool-registrations.ts`'s handler falls back to `false` (disabled) if it is ever still absent,
 * matching the flag's own documented default-OFF safety posture rather than assuming enabled.
 *
 * Every service field is OPTIONAL, mirroring `server/inbound/admin-http/routes/system/sites.ts`'s
 * own `AdminSitesDeps` exactly (that route's `listSites?`/`createSite?`/`isSiteSwitcherEnabled?`
 * fields): a real `RouteDeps` object already satisfies this interface as-is (it already carries
 * `workspaceId`/`authorize`/`siteBinding`; it simply has no `duplicateSite`/`listSites`/
 * `isSiteSwitcherEnabled` keys at all, which is exactly what an optional field allows) — so wiring
 * this domain into the assistant's tool catalog needs no change to how a real `RouteDeps` is
 * constructed. A test supplies fakes for the optional fields instead of touching a real filesystem
 * or `sites/`.
 *
 * `siteBinding` is REQUIRED, and there is no `cwd` field: the `sites/` root the tool reads and
 * writes is derived from the served binding alone (`switcherBaseForBinding`), never from
 * `process.cwd()`. A `cwd` default here once made `sites_duplicate_site` look up its source and
 * write its copy in whatever tree the process happened to be standing in (development/todos.md,
 * "The sites route and `sites_duplicate_site` re-derive the site binding from `process.cwd()`").
 */
export interface SitesToolDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  /** Defaults to the real `site-dir` implementation. Injectable so a test never touches a real
   *  `sites/` directory. */
  listSites?: (optional?: { cwd?: string }) => readonly SiteListEntry[];
  /** Defaults to the real `duplicateSite`. Injectable for the same reason as `listSites`. */
  duplicateSite?: (required: { sourceDir: string; targetDir: string; name?: string }) => Promise<DuplicateSiteResult>;
  /** Defaults to the real `createSite` (via `site-admin.ts`). Injectable for `sites_create_site` tests. */
  createSite?: CreateSiteForOwnerPorts["createSite"];
  /** Defaults to the real `persistActiveSite` (via `site-admin.ts`). Injectable for `sites_switch_site` tests. */
  persistActiveSite?: ActivateSitePorts["persistActiveSite"];
  /** Filled in by `assistant/tool-registrations.ts`'s `enrichedRouteDeps` — see this file's own
   *  header. Falls back to `false` (disabled) if ever absent by the time the handler runs. */
  isSiteSwitcherEnabled?: () => boolean;
  /**
   * The site this process serves. A real `RouteDeps` object already carries this (2026-09-06
   * composition-root fix — see `RouteDeps.siteBinding`'s own doc), so no extra wiring is needed for
   * it to reach here the same way `workspaceId`/`authorize` already do. It is the ONLY source of the
   * `sites/` root this domain acts on — see {@link ResolvedSitesDeps.switcherBase}.
   */
  siteBinding: SiteBinding;
}

/** The three `site-dir`-local implementations, bundled once so `tool-registrations.ts` reads one
 *  small object instead of three separate `??` fallbacks scattered through its handler. Does NOT
 *  cover `isSiteSwitcherEnabled` — see this file's own header for why that one is resolved by
 *  `assistant/tool-registrations.ts` instead. */
export interface ResolvedSitesDeps {
  listSites: (optional?: { cwd?: string }) => readonly SiteListEntry[];
  duplicateSite: (required: { sourceDir: string; targetDir: string; name?: string }) => Promise<DuplicateSiteResult>;
  /**
   * The base the served tree's `sites/` lives under (`<switcherBase>/sites/<name>`), read off
   * `siteBinding` by `switcherBaseForBinding` — never `process.cwd()`. `null` for an install-dir
   * boot (`tovu serve <dir>`): there is no principled `sites/` root to use at all (`target` bears no
   * `{cwd, env}`-relative relationship to any `sites/` folder), so `tool-registrations.ts`'s handler
   * must refuse rather than duplicate under whatever `process.cwd()/sites` happens to be.
   */
  switcherBase: string | null;
  /** `switcherBase !== null` — `siteBinding.switcherCompatible`, kept as its own named fact for the
   *  callers that only ask "may this boot switch at all?". */
  switcherCompatible: boolean;
}

/**
 * Resolves `deps`'s `site-dir`-backed optional fields to their real implementations, falling back
 * exactly the way `AdminSitesDeps`'s own `deps.listSites ?? listSitesReal` pattern does.
 *
 * @complexity O(1) — two nullish-coalescing reads and path arithmetic, no I/O of its own.
 */
export function resolveSitesDeps(deps: SitesToolDeps): ResolvedSitesDeps {
  const switcherBase = switcherBaseForBinding(deps.siteBinding);
  return {
    listSites: deps.listSites ?? listSitesReal,
    duplicateSite: deps.duplicateSite ?? duplicateSiteReal,
    switcherBase,
    switcherCompatible: switcherBase !== null,
  };
}
