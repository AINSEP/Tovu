/**
 * @file The public request guards and static registrations `createApp` installs before and beside the route mounts. Moved
 * verbatim out of `app.ts`; registration order is behaviour, so each function keeps its statements in their original order.
 */

import { registerCommerceWebhooks } from "../commerce-http.js";
import { createSiteIdlePark } from "../../lifecycle/site-idle-park.js";
import { registerSiteIdleStopHook } from "../../lifecycle/daemon-supervisor.js";
import { assistantRunFinalizerFor } from "../modules/run-finalizer/shared.js";
import { createVisitorPageTargets } from '../visitor-page-targets.js';
import { applyThemePreviewSwitcher } from "../../../inbound/public-http/middleware/theme-preview-switcher.js";
import { registerPublicShareRoutes } from "#src/server/inbound/public-http/routes/site-share";
import express from "express";
import path from "node:path";
import { resolveAppDistDir } from "#src/platform/site-dir/index";
import { applyDevCors } from "../../../inbound/shared/dev-cors.js";
import { applyRequestTracking } from "../../../inbound/shared/observability-middleware.js";
import { parsePublicJsonBody } from "../../../inbound/shared/json-body-parsers.js";
import { applyTrustProxy } from "../../../inbound/shared/trust-proxy.js";
import { applySiteServingGate } from "../../../inbound/public-http/middleware/site-serving-gate.js";
import { applyPublicPageSecurityHeaders } from "../../../inbound/public-http/middleware/public-page-security-headers.js";
import { applyPublishedWebMcp } from '../../../inbound/public-http/middleware/published-webmcp.js';
import { applySiteCookieConsent } from '../../../inbound/public-http/middleware/site-cookie-consent.js';
import { applyAdminBrowserAnalytics } from '../browser-analytics.js';
import { applyBrowserAnalyticsHttp } from '../browser-analytics-http.js';
import { applyCanonicalSiteHostRedirect } from '../../../inbound/public-http/middleware/canonical-site-host.js';
import { isPublishedWebMcpEnabled } from '#src/features/webmcp/settings';
import { registerAdminStatic } from "../../../inbound/admin-http/admin-static.js";
import { registerSiteChatStatic } from "../../../inbound/public-http/middleware/site-chat-static.js";
import { applyRenderThemeOverride } from "../../../inbound/public-http/middleware/render-theme-override.js";
import { registerMailFeedbackRoute } from "../../../inbound/public-http/routes/mail-feedback.js";
import { isPublicAssistantEnabled } from "../../../../assistant/index.js";
import type { RouteDeps } from "../../../routes/types.js";
import type { Express } from "express";
import type { CreateAppOptions } from "../create-app-options.js";
import type { MountInput } from "./module-handles.js";

/** Install the ordered public request guards before any normal routes. O(1) setup. */
export function applyPublicMiddleware(
  { app, routeDeps, internalRouter }: MountInput & { internalRouter: express.Router },
  options: Pick<CreateAppOptions, "themeIdOverride" | "consentAudit"> = {},
): void {
  // X-Forwarded-For is trusted only for a known edge proxy's hops (Fly) or TOVU_TRUST_PROXY.
  applyTrustProxy({ app });
  applyDevCors(app);
  // Registered as early as possible — ahead of the serving gate below and every route module — so
  // a request the gate rejects, or a 404 that matches no route at all, is still measured. See
  // `observability-middleware.ts`'s own file header for the full reasoning and for why this is the
  // single chokepoint that sees both `tovu serve` and `index.ts`'s boot paths (both call this exact
  // `createApp()` function; see `ADS-memory/.local-artifacts/metrics/
  // 2026-08-28-observability-groundwork.md` §1-2 for why that distinction matters here).
  // Bearer share paths never enter request logging, page analytics, or public rendering.
  registerPublicShareRoutes({ app, registry: routeDeps.siteShareBackend?.registry });
  applyRequestTracking({ app, deps: { tracker: routeDeps.tracker } });
  // Only a `createSiteApp({ themeId })` loopback app has this; see `render-theme-override.ts`.
  if (options.themeIdOverride !== undefined) applyRenderThemeOverride({ app, themeId: options.themeIdOverride });
  // ADR-041/043/044/045 — must precede the normal traffic handlers so a
  // BLOCKED_PENDING_RECOVERY site refuses normal traffic regardless of which route would have
  // handled it. See site-serving-gate.ts's own header for the allowlist rationale.
  applySiteServingGate({ app, deps: { siteStatusRepo: routeDeps.siteStatusRepo, workspaceId: routeDeps.workspaceId } });
  // nosniff + Referrer-Policy + a report-only CSP on every non-admin response, set before any
  // public route runs. See `public-page-security-headers.ts`.
  applyPublicPageSecurityHeaders(app, { readHeaders: routeDeps.publicPageSecurityHeaders });
  // Redirect page aliases before consent/preview middleware can render or set a visitor cookie.
  applyCanonicalSiteHostRedirect({ app, originRegistry: routeDeps.originRegistry, workspaceId: routeDeps.workspaceId, runtimeMode: routeDeps.seoDeps.runtimeMode });
  if (options.themeIdOverride === undefined) applyThemePreviewSwitcher({ app, deps: routeDeps });
  const visitorPageTargets = createVisitorPageTargets({ deps: routeDeps });
  applyPublishedWebMcp({ app, workspaceId: routeDeps.workspaceId, readEnabled: () => isPublishedWebMcpEnabled(routeDeps, { workspaceId: routeDeps.workspaceId }),
    allowsVisitorPublication: async ({ path }) => process.env.TOVU_VISITOR_TOOLS_POLICY !== 'off'
      && await isPublicAssistantEnabled({ settingsRepo: routeDeps.settingsRepo, getEffective: routeDeps.getEffective }, { workspaceId: routeDeps.workspaceId })
      && (await visitorPageTargets.list({})).some(page => page.path === path) });
  // Consent contributes assets during document construction. Audit renders omit that runtime;
  // admin readiness reports unmanaged content without transforming the sampled page.
  if (!options.consentAudit && routeDeps.cookieConsent) applySiteCookieConsent({ app, deps: routeDeps, consent: routeDeps.cookieConsent });

  applyBrowserAnalyticsHttp({ app, deps: routeDeps });

  // Public routes parse JSON at a small limit here; session-gated paths are left unparsed and
  // parsed by `requireAdminSession` only once the caller has authenticated (15 MB, 75 MB for the
  // base64 upload routes). See `inbound/shared/json-body-parsers.ts` for the limits and why.
  // Mail provider webhooks read RAW bytes (signatures), so they mount ahead of the JSON parser.
  if (routeDeps.mailFeedbackRoute) registerMailFeedbackRoute({ app, route: routeDeps.mailFeedbackRoute });
  registerCommerceWebhooks({ app, deps: routeDeps });
  // The agent daemon's tool RPC (ADR-070) gates before parsing and parses its own body, so it mounts
  // ahead of the public parser. Its routes are added once the BYOK surface exists (`createApp`); they
  // carry full `/internal/...` paths, so this mounts at the root.
  app.use(internalRouter);
  app.use(parsePublicJsonBody);
}

export function registerAdminSpa({ app, routeDeps }: { app: Express; routeDeps: RouteDeps }, _optional = {}): void {
  // Built admin SPA (apps/admin/dist) at /admin; helpful 503 when unbuilt. Walked up to, not a fixed
  // `../` count: the source and compiled (`dist/src/...`) trees sit at different depths.
  applyAdminBrowserAnalytics({ app, deps: routeDeps });
  registerAdminStatic(app, {
    distDir: process.env.TOVU_ADMIN_DIST ?? resolveAppDistDir({ app: "admin" }),
  });
}

/** Mount the public browser bundle at the configured built-output location.
 * @complexity O(1) route registration. */
export function registerSiteChatBundle({ app }: { app: Express }, _optional = {}): void {
  registerSiteChatStatic({ app,
    distDir: process.env.TOVU_SITE_CHAT_DIST ?? resolveAppDistDir({ app: "site-chat" }),
  });
}

/** Install intake before every route only when the serving process supplies its graceful stop.
 * Share the routes' finalizer by ledger identity: creating another watch owner could park mid-chat.
 * @complexity O(1) wiring; each idle probe uses up to two bounded existence reads.
 */
export function registerSiteIdlePark({ app, routeDeps, hasBackgroundWork }: MountInput & { hasBackgroundWork: () => Promise<boolean> }, options: Pick<CreateAppOptions, "stopForIdle"> = {}): void {
  if (!options.stopForIdle) return;
  const finalizer = assistantRunFinalizerFor({ ledger: routeDeps.chatRunLedger,
    tracker: routeDeps.tracker, observability: routeDeps.observability });
  const park = createSiteIdlePark({ hasBackgroundWork, hasActiveRuns: () => routeDeps.chatRunLedger.hasActiveRuns({}, {}),
    activeCount: () => finalizer.activeCount(), stop: options.stopForIdle });
  app.use(park.middleware);
  registerSiteIdleStopHook({ stopIfIdle: park.stopIfIdle });
}
