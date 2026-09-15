import type { RequestListener } from "node:http";
import type { AuthorizeFn } from "@jini-ai/cms/core";
import type { SettingsRepoPort, getEffective } from "@jini-ai/cms/settings";

import { ADMIN_SCREENS } from "./admin-screens.generated.js";
import type { SiteCapabilitiesDeps, SiteCapabilityToolRow } from "./site-capabilities.js";
import type {
  SiteProfileContentTypeRow,
  SiteProfileDeps,
  SiteProfileJsonValue,
  SiteProfilePluginActivationRow,
  SiteProfilePluginRow,
  SiteProfilePostRow,
  SiteProfileThemeRow,
} from "./site-profile.js";

/**
 * @file The adapter between a composition root's deps bag and the narrow port bags this domain's
 * services actually take.
 *
 * This is the file that makes the secret-safety claim checkable. `buildSiteProfile` cannot reach a
 * credential store because `SiteProfileDeps` has no field that could carry one — but SOMETHING has
 * to turn the real `RouteDeps` into that shape, and this is that something. Keeping the conversion
 * in one named function (rather than inline in the tool handler and again in the HTTP route) means
 * there is exactly one place to audit, and both adapters provably feed the service the same thing.
 * `toSiteCapabilitiesDeps` does the same for `buildSiteCapabilities`.
 *
 * {@link SiteInspectionToolDeps} is declared STRUCTURALLY rather than as
 * `Pick<RouteDeps, ...>` — the same discipline `features/theme/tool-registrations.ts`'s
 * `ThemeToolDeps` and `features/plugin-runtime/tool-registrations.ts`'s `PluginsToolDeps` already
 * use, so this module carries no back-edge into the composition root for the `RouteDeps` god type.
 * `server/routes/*` satisfies it by passing its existing `RouteDeps` object; nothing there changes.
 *
 * The two exceptions to "structural, nothing imported" are `settingsRepo` and `getEffective`, which
 * are typed against `@jini-ai/cms/settings`'s own exports. That is an EXTERNAL package import, not
 * an internal module edge, and it is what lets this file hand `getEffective` the exact repo it was
 * written for instead of inventing a second settings resolver — the divergence this whole design
 * exists to avoid.
 */

/**
 * The exact slice of the route-deps bag `buildSiteProfile` is fed from. Every field is a read port;
 * none of them is, or can be widened into, a credential store.
 *
 * Split out from {@link SiteInspectionToolDeps} because the admin HTTP route needs exactly this and
 * nothing more — it never fetches a published page, so requiring it to carry `createSiteApp` would
 * make its declared surface wider than what it actually uses.
 */
export interface SiteProfileSourceDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  clock: { nowIso(): string };
  postRepo: { list(required: { workspaceId: string }): Promise<readonly SiteProfilePostRow[]> };
  /** Boot-discovered themes. Read only — this domain never mutates the roster. */
  themes: readonly SiteProfileThemeRow[];
  presentationRepo: { findByWorkspaceId(workspaceId: string): Promise<{ activeThemeId: string } | null> };
  settingsRepo: SettingsRepoPort;
  /** The real `@jini-ai/cms/settings` resolver, injected rather than re-implemented. */
  getEffective: typeof getEffective;
  contentTypeRepo: { listByWorkspace(params: { workspaceId: string }): Promise<readonly SiteProfileContentTypeRow[]> };
  pluginActivationRepo: { listAll(): Promise<readonly SiteProfilePluginActivationRow[]> };
  discoverPlugins: () => Promise<readonly SiteProfilePluginRow[]>;
}

/**
 * Everything the AGENT-TOOL adapter needs: the profile's read ports, plus the site's own app
 * factory that `fetch_published_page` renders through and the registry reader
 * `site_describe_capabilities` lists tools from.
 */
export interface SiteInspectionToolDeps extends SiteProfileSourceDeps {
  /**
   * The site's own app factory (`RouteDeps.createSiteApp`), used by `fetchPublishedPage`.
   * Method syntax and an `unknown` parameter so this declaration satisfies both the historical
   * `(routeDeps: RouteDeps) => Express` shape and the current nullary `() => Express` one, and
   * typed as Node's `RequestListener` because that is all `fetchPublishedPage` does with it — see
   * `published-page.ts`'s `FetchPublishedPageDeps` for the full note on both points.
   */
  createSiteApp(routeDeps: unknown): RequestListener;
  /**
   * Reads the composition root's live `ToolRegistry` as catalog entries: `assistant/
   * tool-catalog-query.ts`'s `listToolCatalogEntries(registry)`, bound to the SAME registry that
   * root's `search_tools`/`describe_tool` serve. Supplied by the two roots that own a registry
   * (`server/inbound/assistant/agent-daemon-server.ts`, `assistant/byok-tool-surface.ts`), and
   * injected rather than imported because `features/**` may not import `assistant/**` by value.
   *
   * Optional because every other builder of this bag (the admin HTTP routes, tests) has no registry.
   * Without it `site_describe_capabilities` reports its tools section `unavailable`/`not-wired`,
   * never an empty catalog.
   */
  listCatalogTools?: (() => readonly SiteCapabilityToolRow[]) | undefined;
}

/**
 * Binds a composition root's deps bag down to the narrow read ports `buildSiteProfile` takes.
 *
 * Every closure below is a single read, scoped to `deps.workspaceId`. Nothing here filters,
 * redacts, or post-processes: the projections live in `site-profile.ts` where the DTO is declared,
 * so there is one place that decides what a field means and one place that decides whether it is
 * reported at all.
 *
 * @param deps - The composition root's deps bag (a real `RouteDeps` at every call site).
 * @returns The narrow port bag. Pure: constructing it performs no I/O.
 * @throws Nothing. The closures throw whatever their underlying repo throws, when invoked.
 * @complexity O(1) — closure construction only.
 * @example const profile = await buildSiteProfile(toSiteProfileDeps(routeDeps), { principalId });
 */
export function toSiteProfileDeps(deps: SiteProfileSourceDeps): SiteProfileDeps {
  return {
    workspaceId: deps.workspaceId,
    authorize: deps.authorize,
    clock: deps.clock,
    listPosts: () => deps.postRepo.list({ workspaceId: deps.workspaceId }),
    // `themes` is already-resolved boot state, not a read — wrapped in a promise so every port on
    // `SiteProfileDeps` has one shape and the service never branches on sync-vs-async.
    listThemes: async () => deps.themes,
    readActiveThemeId: async () => {
      const record = await deps.presentationRepo.findByWorkspaceId(deps.workspaceId);
      return record?.activeThemeId ?? null;
    },
    listPlugins: () => deps.discoverPlugins(),
    listPluginActivations: () => deps.pluginActivationRepo.listAll(),
    readSetting: async ({ namespace, key }) => {
      const resolved = await deps.getEffective(
        { repo: deps.settingsRepo },
        { namespace, key, scopeContext: { workspaceId: deps.workspaceId } },
      );
      // `ResolvedSetting.value` is the settings package's own `JsonValue`. The cast restates that
      // as this module's structurally identical `SiteProfileJsonValue` rather than importing a
      // second JSON type into the DTO; it narrows nothing and hides nothing.
      return (resolved?.value ?? null) as SiteProfileJsonValue | null;
    },
    listContentTypes: () => deps.contentTypeRepo.listByWorkspace({ workspaceId: deps.workspaceId }),
  };
}

/**
 * Binds a composition root's deps bag down to the ports `buildSiteCapabilities` takes.
 *
 * `listCatalogTools` passes straight through (absent stays absent, so the service can report it).
 * `listAdminScreens` returns the generated admin screen list; `listContentTypes` is the same
 * `contentTypeRepo.listByWorkspace` read `collections_content_type_list` makes.
 *
 * @param deps - The agent-tool deps bag.
 * @returns The narrow port bag. Pure: constructing it performs no I/O.
 * @throws Nothing. The closures throw whatever their underlying reads throw, when invoked.
 * @complexity O(1) — closure construction only.
 * @example const capabilities = await buildSiteCapabilities(toSiteCapabilitiesDeps(routeDeps), { principalId });
 */
export function toSiteCapabilitiesDeps(deps: SiteInspectionToolDeps): SiteCapabilitiesDeps {
  return {
    workspaceId: deps.workspaceId,
    authorize: deps.authorize,
    clock: deps.clock,
    listCatalogTools: deps.listCatalogTools,
    listAdminScreens: () => ADMIN_SCREENS,
    listContentTypes: () => deps.contentTypeRepo.listByWorkspace({ workspaceId: deps.workspaceId }),
  };
}
