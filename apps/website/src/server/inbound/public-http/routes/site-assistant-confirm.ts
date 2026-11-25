import type { FrontendSessionOwner } from '@jini-ai/core/contracts/site/daemon';
import type { FrontendHookInput } from "@jini-ai/core/contracts/site/daemon-http";
/** One human-only reply route. No model tool or admin exchange can reach this visitor store. */
import type { Express } from "express";
import { type VisitorConfirmations } from "#src/assistant/site/visitor-confirmations";
import { VISITOR_TOOL_REFUSAL } from "#src/assistant/site/visitor-executor";
import { allowsVisitorRequestOrigin } from "#src/assistant/site/visitor-request-origin";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { requestHookInput } from "#src/platform/express/request-facts";

import { siteAssistantConfirmRoute, type SiteAssistantConfirmDeps } from "@jini-ai/daemon/surface-exchanges/site-assistant-confirm";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
interface ConfirmRoutePorts {
  readonly confirmations: VisitorConfirmations;
  readonly resolveOwner?: (required: FrontendHookInput) => Promise<FrontendSessionOwner | null>;
  readonly enabled: () => Promise<boolean>;
  readonly allowsOrigin: (required: { origin: string }) => Promise<boolean>;
  readonly limiter: RateLimiter;
  readonly reportError: (required: { error: unknown }, optional?: Record<string, never>) => void;
}

/** Mount without opening a listener; route tests inject the entire trust and delivery boundary. */
export function registerSiteAssistantConfirm({ app, ports }: { app: Express; ports: ConfirmRoutePorts }, _options = {}): void {
  mountPublicRawRoute<SiteAssistantConfirmDeps>({
    app, spec: siteAssistantConfirmRoute, deps: {} as SiteAssistantConfirmDeps,
    failure: ({ res, error }) => {
      ports.reportError({ error });
      res.setHeader("Cache-Control", "no-store");
      res.status(400).json({ error: VISITOR_TOOL_REFUSAL });
    },
  }, {
    requestDeps: ({ req }): SiteAssistantConfirmDeps => ({
      rateAllowed: async () => (await ports.limiter.check({ key: resolveClientIp(req) })).allowed,
      enabled: () => ports.enabled(),
      isJson: () => Boolean(req.is("application/json")),
      sameOrigin: () => allowsVisitorRequestOrigin({ ...requestHookInput({ req }), allowsOrigin: ports.allowsOrigin }),
      ...(ports.resolveOwner ? { resolveOwner: () => ports.resolveOwner!(requestHookInput({ req })) } : {}),
      confirm: (input) => ports.confirmations.confirm(input),
      reportError: (input) => ports.reportError(input),
      refusalText: VISITOR_TOOL_REFUSAL,
    }),
  });
}
