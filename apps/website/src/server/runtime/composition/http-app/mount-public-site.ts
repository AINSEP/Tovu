/**
 * @file The public-site half of `createApp`'s registrations: agent icons, MCP-UI sandbox proxy, site-chat bundle, theme preview/asset
 * mounts, commerce, the visitor submit routes, member pages and — last — the `/:slug` site catch-all. Registration order is behaviour.
 * Moved verbatim out of `app.ts`.
 */

import { registerCommerceHttp } from "../commerce-http.js";
import express from "express";
import { registerMcpUiSandboxProxyRoute } from "#src/assistant/mcp-ui-sandbox-proxy-route";
import path from "node:path";
import { resolveProductRoot } from "#src/platform/site-dir/index";
import { registerThemePreviewStatic } from "../../../inbound/public-http/middleware/theme-preview-static.js";
import { registerThemeStaticAssets } from "../../../inbound/public-http/middleware/theme-static-assets.js";
import { registerThemePagePreview } from "../../../inbound/public-http/middleware/theme-page-preview.js";
import { registerSiteRoutes } from "../../../inbound/public-http/routes/site/pages.js";
import { registerMemberPageRoutes } from "../../../inbound/public-http/routes/site/member-pages.js";
import { registerSiteChatComparisonRoutes } from "../../../inbound/public-http/routes/site/chat-comparison.js";
import { registerSiteChatBundle } from "./public-middleware.js";
import { registerCommentsSubmit, registerAnalyticsIngest, registerFormsSubmit } from "./visitor-submit.js";
import type { MountInput, PreviewRevisionCheck } from "./module-handles.js";

/** Static mounts, theme previews, commerce, the visitor registrations, member pages and the site catch-all, in registration order. */
export function mountPublicSite({ app, routeDeps, isAuthenticatedPreviewRevision }: MountInput & { isAuthenticatedPreviewRevision: PreviewRevisionCheck }, _optional = {}): void {
  // ADR-049 — `@jini-ai/chat-react`'s runtime picker requests agent icons from `/agent-icons/*`
  // at the site root (hardcoded, no `ChatPaneProps` override exists to relocate it — verified
  // against `chat-react@0.2.0`'s `AgentRuntimePicker.tsx`), which sits outside the admin SPA's own
  // `/admin/*`-scoped static serving above. Served from Tovu's own root here (in both dev, via
  // `apps/admin/vite.config.ts`'s matching proxy entry, and prod) rather than duplicated inside
  // `apps/admin/dist` (which would only ever resolve under `/admin/`).
  app.use("/agent-icons", express.static(path.join(resolveProductRoot({}), "content", "public", "agent-icons")));

  // MCP-UI sandbox proxy — `@mcp-ui/client`'s `AppFrame` points an iframe's `src` at this exact
  // root-relative path (see `mcp-ui-sandbox-proxy-route.ts`'s own module doc) and never falls back
  // to `srcdoc`, so every MCP-UI surface (e.g. `assistant_ask_choice`'s form) fails to render at all
  // without it. Same "root-relative, outside the admin SPA's `/admin/*` static serving" shape as
  // `/agent-icons` immediately above — mounted here on Tovu's own web server, NOT on the agent
  // daemon (`agent-daemon-server.ts`), because it needs nothing from that process's in-memory
  // `ToolExecutor`/`SurfaceExchangeStore`, only a constant string.
  registerMcpUiSandboxProxyRoute(app);

  // ADR-054 Task 2/3 — the built public site-chat bundle (apps/site-chat/dist) at /site-chat.
  // Distinct static mount from the admin SPA above: a single self-mounting script, not an app with
  // client-side routing, so `site-chat-static.ts` has no `index.html` SPA fallback to serve.
  registerSiteChatBundle({ app });
  registerSiteChatComparisonRoutes({ app, deps: routeDeps });

  // SPIKE — `static`-tier theme preview builds at /theme-preview/<theme-id>/<dark|light>/...; see
  // theme-preview-static.ts's file header for exactly what this is (and isn't) wired up to.
  registerThemePreviewStatic({ app,
    // `routeDeps.themesDir`, not a package-relative path: since 2026-08-27 the themes a site
    // actually serves live under `sites/<name>/themes/`, and this mount has to follow them or the
    // preview renders the STOCK css while the live site renders the owner's edited copy. Reading it
    // off `routeDeps` rather than calling `siteThemesDir()` here keeps the hermetic in-memory path
    // (`createRouteDeps()` below, which stays on `builtInThemesDir()`) pointed at the same tree its
    // own `deps.themes` was discovered from.
    themesStaticDir: path.join(routeDeps.themesDir, "static"),
  });

  // Real (non-spike) asset serving for a theme's own files at /theme-assets/{id}/...: static-tier
  // css/js (used by render.ts's static-tier branch when actually rendering one as the live site),
  // EXTENDED 2026-08-12 to also cover templated-tier theme folders so a Liquid theme's own images/
  // screenshots are reachable (see theme-static-assets.ts's own header for why declarative/handlebars
  // are not listed here yet, and why templates/*.liquid source being servable is deliberate).
  registerThemeStaticAssets({ app,
    // Site-relative for the same reason as `themesStaticDir` just above — this is the mount that
    // serves the live site's own theme css/js, so a package-relative root here is precisely the bug
    // the `sites/` move fixes.
    themeRoots: [path.join(routeDeps.themesDir, "static"), path.join(routeDeps.themesDir, "templated")],
  }, {
    // Theme refresh replaces the roster; inherited sources must follow that replacement.
    get themes() { return routeDeps.themes; },
    isAuthenticatedPreviewRevision,
  });

  // Admin Explore screen's preview iframe: any static theme's page, fully rendered, at
  // /theme-explore/<theme-id>/<page-id> -- plus (2026-08-12) a GATED templated-theme (`.liquid`)
  // preview at /theme-explore/<theme-id>/template/<template-id>, which needs `requireAdminSession`
  // and therefore full `RouteDeps`, not the narrower `ContentRouteDeps` the admin CRUD module uses —
  // see that route's own file header for why it stays registered here instead of moving into
  // `createContentModule`. Registered AFTER the asset route above so the rendered page's own
  // `/theme-assets/...` references are already being served when it loads.
  registerThemePagePreview({ app, deps: routeDeps });

  // SPEC-044: the `workspace` server module (list/create/get/update/delete) is registered near the
  // other ADR-046 Phase 3 module calls above (`createUsersModule`); the original inline
  // unauthenticated `POST /workspaces` route that lived here has been removed (see the file header).

  // Commerce's plugin switch controls new purchases; its durable settlement drain remains available.
  // Historical rows and namespace claims survive retirement independently of activation.
  registerCommerceHttp({ app, deps: routeDeps });

  registerCommentsSubmit({ app, routeDeps });
  registerAnalyticsIngest({ app, routeDeps });
  registerFormsSubmit({ app, routeDeps });

  // Member sign-in pages (/signin, /account, ...) must precede the /:slug catch-all below.
  registerMemberPageRoutes(app, routeDeps);
  // Public dummy site — registered last (GET /:slug is a catch-all).
  registerSiteRoutes({ app, deps: routeDeps });
}
