import type { Express, Request, Response } from "express";

import { a2uiNotPendingBody, deliverA2uiAction, readA2uiAction } from "@jini-ai/daemon/http";

import { RUN_PRINCIPAL_HEADER } from "./daemon-access.js";
import type { SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";

/**
 * @file The daemon-side inbound half of A2UI (a2ui-project/a2ui v1.0) — where a rendered surface's
 * `action`/`functionResponse`/`error` message re-enters the server (ADR-055 Decision 1, A2UI's own
 * channel).
 *
 * ## Why this is its own route rather than a branch of `mcp-ui-tool-calls-route.ts`
 *
 * That route's whole shape exists to serve MCP-UI's one real constraint: an mcp-ui surface can only
 * answer by issuing a `tools/call`, so its correlation id has nowhere to live but inside that call's
 * `params` (or, for a channel that can name the exchange directly, a top-level `exchangeId` sitting
 * beside a `toolName` that route still requires unconditionally, to keep its own allowlist gate and
 * legacy two-call shape working). A2UI has neither of those constraints — a renderer→agent envelope
 * is not a tool call, so there is no `toolName` to allowlist, and A2UI already carries its own
 * correlation id (`surfaceId`) on the message itself. Bolting A2UI onto the mcp-ui route would mean
 * either fabricating a `toolName` that means nothing, or growing a second discriminator inside a
 * route whose module doc already explains why the *existing* one is exactly the exchange id's
 * presence. A route with no `toolName` field at all is the honest shape for a channel that has none.
 *
 * ## Why it never calls `toolExecutor.execute`
 *
 * Same reasoning as `mcp-ui-tool-calls-route.ts`'s Shape 1, restated because it is load-bearing here
 * too: the held-open tool call already passed the registry's authorization gate when the agent made
 * it. Re-running that gate on the human's *answer* would authorize it as though it were a fresh
 * invocation — the exact thing ADR-055 Decision 1 exists to avoid. This route therefore only ever
 * reaches `SurfaceExchangeStore.deliver`, never `ToolExecutor.execute`; there is no allowlist here
 * because there is no execution surface to allowlist.
 *
 * ## Why `toolId` is not supplied to `deliver()`
 *
 * A2UI's `ActionMessage`/`FunctionResponseMessage`/`ErrorMessage` carry no field naming the tool
 * that opened the surface — only `surfaceId` (or, for a `functionResponse`, nothing at all; see
 * Jini's `extractDeclaredSurfaceId`). The browser genuinely has no `toolId` to offer. See
 * `surface-exchanges.ts`'s `DeliverySpec` doc for why the store accommodates that by making the
 * caller's `toolId` optional rather than forcing this route to fabricate one.
 *
 * ## The surfaceId/exchangeId cross-check
 *
 * `assistant_demo_a2ui` (and every other A2UI-opening tool) sets a surface's `surfaceId` FROM the
 * exchange id it opened (see that tool's own doc) — the two are the same string by construction, not
 * by convention alone. When a validated message declares a `surfaceId` that disagrees with the route
 * param naming the exchange to deliver into, that is evidence of a confused client (a stale tab, a
 * copy-pasted id) rather than a message this exchange should accept — refused before it ever reaches
 * `deliver()`, the same "reject the wrong thing outright" posture `mcp-ui-tool-calls-route.ts` takes
 * for a non-allowlisted `toolName`.
 *
 * ## Why it must live in this process
 *
 * Same as `mcp-ui-tool-calls-route.ts`: the `SurfaceExchangeStore` an A2UI-opening tool's handler
 * parked on lives only in `agent-daemon-server.ts`'s process memory. This route must be mounted
 * there, sharing the SAME store instance `buildAssistantToolRegistrations` was given — a different
 * instance would leave every A2UI exchange unreachable, 409-ing until the agent's call times out.
 *
 * Reached only through Tovu's own admin-session-authenticated proxy (`apps/website/src/server/runtime/composition/modules/assistant.ts`),
 * which attaches the daemon bearer token like every other forwarded route — so this
 * module adds no exemption to the daemon's global bearer gate (`apps/website/src/assistant/daemon-access.ts`) and trusts
 * {@link RUN_PRINCIPAL_HEADER} the same way `mcp-ui-tool-calls-route.ts` and `apps/website/src/assistant/daemon-access.ts` do.
 */

/** Mounted at the same path Tovu's proxy exposes to the browser — see `apps/website/src/server/runtime/composition/modules/assistant.ts`. */
export const A2UI_ACTIONS_PATH = "/api/admin/v1/a2ui/actions";

export interface A2uiActionsRouteDeps {
  /**
   * The SAME store `buildAssistantToolRegistrations` was given (and, by extension, the same one
   * `registerMcpUiToolCallsRoute` was mounted with — both proxy through this daemon's one composition
   * root). A different instance would leave every A2UI exchange unreachable.
   */
  surfaceExchanges: SurfaceExchangeStore;
}

function readPrincipalId(req: Request): string | undefined {
  const value = req.get(RUN_PRINCIPAL_HEADER);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// Body validation (non-empty exchangeId, A2UI schema, the surfaceId/exchangeId cross-check),
// a2ui-channel delivery and the 409 body are Jini's (`@jini-ai/daemon/http`'s `readA2uiAction`,
// `deliverA2uiAction`, `a2uiNotPendingBody`) — shared with the admin server's BYOK-first hop so
// both refuse the same malformed posts. This file keeps only the Express shell.

/**
 * Registers `POST {@link A2UI_ACTIONS_PATH}` on the daemon `app`.
 *
 * @complexity O(1) request handling; the actual delivery cost is `SurfaceExchangeStore.deliver`'s
 * own, which is O(1) (a `Map` lookup).
 * @overallScore 100
 */
export function registerA2uiActionsRoute({ app, deps }: { app: Express; deps: A2uiActionsRouteDeps }, _optional: Record<string, never> = {}): void {
  app.post(A2UI_ACTIONS_PATH, (req: Request, res: Response) => {
    const principalId = readPrincipalId(req);
    if (!principalId) {
      res.status(401).json({ error: `${RUN_PRINCIPAL_HEADER} is required`, code: "UNAUTHENTICATED" });
      return;
    }

    const action = readA2uiAction({ rawBody: req.body });
    if (!action.ok) {
      res.status(400).json(action.error);
      return;
    }

    const delivered = deliverA2uiAction({ store: deps.surfaceExchanges, exchangeId: action.exchangeId, principalId, message: action.message });
    if (!delivered.ok) {
      res.status(409).json(a2uiNotPendingBody({ reason: delivered.reason }));
      return;
    }

    // Deliberately not the tool's eventual result — the agent's own call is what returns that, to
    // the model, where it belongs. Same posture as `mcp-ui-tool-calls-route.ts`'s Shape 1.
    res.status(202).json({ delivered: true });
  });
}
