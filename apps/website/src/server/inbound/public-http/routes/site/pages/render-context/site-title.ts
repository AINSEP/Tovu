import { resolveSiteTimeZoneSafely } from "@jini-ai/cms/widgets/date-label";
import { resolveSiteTitle } from "#src/features/settings/site-title";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * SPEC-050: the site title every public render in this file, `products.ts`, and the templated
 * theme preview shows, read through `core.site.title`'s one resolver. Replaces the `SITE_TITLE`
 * literal this file used to export, and is exported for the same reason that constant was
 * (2026-08-12, `.liquid` Preview-tab fix): a template that reads `site.title`/`ctx.siteTitle` must
 * preview exactly as it renders live. The default read never throws (see `resolveSiteTitle`).
 * `preserveAuthoredFallback` lets an authored page keep its title when there is no workspace
 * title, while a pending legacy pin still uses the same render resolver. Explicit-title read
 * errors in that mode propagate to the caller's existing fallback.
 * @complexity O(1) bounded owner reads and space.
 */
export function resolveSiteTitleForRender(deps: RouteDeps): Promise<string>;

export function resolveSiteTitleForRender(deps: RouteDeps, options: { preserveAuthoredFallback: true }): Promise<string | undefined>;

export async function resolveSiteTitleForRender(
  deps: RouteDeps,
  options: { preserveAuthoredFallback?: boolean } = {},
): Promise<string | undefined> {
  if (options.preserveAuthoredFallback) {
    // Read the marker before the value: a pin can land between reads, never disappear between them.
    // A failed marker read delegates to the render resolver's legacy-safe error policy.
    const pending = await deps.siteTitlePreservationStore.isPending({ workspaceId: deps.workspaceId }).catch(() => true);
    if (!pending) return deps.seoDeps.siteTitle({ workspaceId: deps.workspaceId });
  }
  return resolveSiteTitle(
    {
      settingsRepo: deps.settingsRepo,
      preservationStore: deps.siteTitlePreservationStore,
      workspaceRepo: deps.workspaceRepo,
      siteDisplayName: deps.siteDisplayName,
    },
    { workspaceId: deps.workspaceId }
  );
}

/** Bug D: the site-zone port for a `resolveHtmlPageEmbeds` deps object, when the host wired one. */
export function siteTimeZoneDep(deps: Pick<RouteDeps, "workspaceId"> & Partial<Pick<RouteDeps, "siteTimeZone">>): Pick<RouteDeps, "siteTimeZone"> {
  return deps.siteTimeZone ? { siteTimeZone: deps.siteTimeZone } : {};
}

/** Host ports for every HTML embed pass. The site zone remains optional (Bug D);
 * plugin admission is injected only through the node-only CMS HTML entry. */
export function htmlEmbedHostDeps(deps: Pick<RouteDeps, "workspaceId"> & Partial<Pick<RouteDeps, "siteTimeZone" | "pluginExports" | "pluginExportRender">>): Pick<RouteDeps, "siteTimeZone"> & Pick<import("@jini-ai/cms/widgets/html").ResolveHtmlPageEmbedsDeps, "pluginExports"> {
  return { ...siteTimeZoneDep(deps), pluginExports: deps.pluginExportRender ?? deps.pluginExports?.forRender({ mode: "live" }) };
}

/** Bug D follow-up: the site's zone for `renderSite` (`dateShort`, `.entry-meta`, Liquid's `| date:`);
 *  The host resolves unset site settings to its local zone; an unwired port retains Jini's UTC default. */
export function resolveSiteTimeZoneForRender(deps: Pick<RouteDeps, "workspaceId"> & Partial<Pick<RouteDeps, "siteTimeZone">>): Promise<string> {
  return resolveSiteTimeZoneSafely({ workspaceId: deps.workspaceId }, siteTimeZoneDep(deps));
}
