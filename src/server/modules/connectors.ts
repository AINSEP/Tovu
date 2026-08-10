import { createRateLimiter, CONNECTOR_CALLBACK_PER_IP, CONNECTOR_CONNECT_PER_IP } from "../middleware/rate-limit";
import { registerAdminConnectorsConnectRoute } from "../routes/admin/connectors/connect";
import type {
  ConnectorsConfigRouteDeps,
  ConnectorsRouteDeps,
} from "../routes/admin/connectors/deps";
import {
  registerAdminConnectorsCancelRoute,
  registerAdminConnectorsDisconnectRoute,
} from "../routes/admin/connectors/disconnect";
import { registerAdminConnectorsGetByIdRoute } from "../routes/admin/connectors/get-by-id";
import { registerAdminConnectorsGetConfigRoute } from "../routes/admin/connectors/get-config";
import { registerAdminConnectorsListRoute } from "../routes/admin/connectors/list";
import { registerAdminConnectorsPutConfigRoute } from "../routes/admin/connectors/put-config";
import { registerAdminConnectorsStatusesRoute } from "../routes/admin/connectors/statuses";
import { registerComposioCallbackRoute } from "../routes/connectors/composio-callback";
import type { ServerModuleHandle } from "./types";

/**
 * @file The `connectors` server module — Composio-backed third-party connectors, backing the
 * admin's Settings → Connectors tab (`@jini-ai/ui`'s `ConnectorsBrowser`).
 *
 * Distinct from `modules/integrations.ts` despite the adjacent name: that module owns OUTBOUND
 * webhooks (ADR-036 `webhook_subscriptions`), while this one owns INBOUND third-party accounts
 * reached through Composio. They share the `admin.integrations.manage` permission and nothing else.
 *
 * Eight routes: seven behind `requireAdminSession` under `/api/admin`, and ONE public — the OAuth
 * callback, mounted outside that prefix because a `SameSite=Strict` cookie cannot survive the
 * cross-site redirect that reaches it. It authenticates on the single-use, connector-bound OAuth
 * `state` instead; see `routes/connectors/composio-callback.ts` for the full argument.
 */
export function createConnectorsModule(
  deps: ConnectorsRouteDeps & ConnectorsConfigRouteDeps
): ServerModuleHandle {
  // Built here rather than in the composition root because nothing else shares it — the same call
  // `app.ts` makes for the magic-link limiters, which live next to their own route family.
  const callbackLimiter = createRateLimiter({ profile: CONNECTOR_CALLBACK_PER_IP, clock: deps.clock });
  const connectLimiter = createRateLimiter({ profile: CONNECTOR_CONNECT_PER_IP, clock: deps.clock });

  return {
    name: "connectors",
    registerRoutes: (app) => {
      // ORDER IS LOAD-BEARING: Express matches in registration order, so both literal-segment
      // routes must precede `/connectors/:connectorId` or `config` and `statuses` are swallowed as
      // connector ids and answered with a 404 from the catalog lookup. The `:connectorId/connect`
      // family needs no such care — its second path segment keeps it from colliding.
      registerAdminConnectorsGetConfigRoute(app, deps);
      registerAdminConnectorsPutConfigRoute(app, deps);
      registerAdminConnectorsStatusesRoute(app, deps);
      registerAdminConnectorsConnectRoute(app, deps, connectLimiter);
      registerAdminConnectorsDisconnectRoute(app, deps);
      registerAdminConnectorsCancelRoute(app, deps);
      registerAdminConnectorsListRoute(app, deps);
      registerAdminConnectorsGetByIdRoute(app, deps);

      // PUBLIC — deliberately outside `/api/admin`, so `requireAdminSession` never sees it.
      registerComposioCallbackRoute(app, {
        composioConnectors: deps.composioConnectors,
        callbackLimiter,
      });
    },
  };
}
