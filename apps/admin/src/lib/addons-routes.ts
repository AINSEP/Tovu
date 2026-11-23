import type { AddonsRoutePolicy } from "@jini-ai/admin/shell/lib/addons-routes";
import type { MovedTabsRoutePolicy } from "@jini-ai/admin/shell/lib/import-export-routes";

/**
 * @file Tovu's URL migrations, kept at the host boundary (ex5-fnd-kit review, rv-g FIX 2): Jini's
 * resolvers hold no Tovu paths and take these tables through their args.
 *
 * Add-ons (owner decision, 2026-10-13): Jini still matches stable panel IDs; the adapter translates
 * only Tovu's moved URLs. Legacy redirects are resolved there and executed by IntegrationsRedirect.
 */
export const ADDONS_PANEL_PATHS: Readonly<Record<string, string>> = {
  plugins: "/addons/plugins",
  "agent-plugins": "/addons/agent-plugins",
  skills: "/addons/skills",
  providers: "/addons/integrations",
  integrations: "/addons/integrations?tab=webhooks",
};

/** Legacy `/integrations/<id>` detail pages moved under Providers' new home, and bare legacy
 *  Integrations links keep their former Webhooks default; explicit tabs survive. */
export const ADDONS_ROUTE_POLICY: AddonsRoutePolicy = {
  section: "addons",
  panelPaths: ADDONS_PANEL_PATHS,
  detail: { legacySection: "integrations", panelId: "providers" },
  legacyDefaults: { integrations: { path: ADDONS_PANEL_PATHS.providers, tab: "webhooks" } },
};

/**
 * Sites → Export Site / Import Site moved to Operations → Import & Export as tabs (owner,
 * 2026-10-25). Old `/sites?tab=export|import` links — bookmarks, chat history, an older desktop
 * build's "Import site" button — are sent to the new tab. `App.tsx`'s `parseRoute` runs this BEFORE
 * the Sites route gate, so a host with no Sites section lands on the tab, not the dashboard.
 */
export const IMPORT_EXPORT_ROUTE_POLICY: MovedTabsRoutePolicy = {
  fromSection: "sites",
  movedTabs: new Set(["export", "import"]),
  destinationPath: "/import-export",
};
