import type { Express, Request, Response } from "express";

import { parseRendererToAgentMessage, type RendererToAgentMessage } from "@jini-ai/agentic/a2ui";

import { RUN_PRINCIPAL_HEADER } from "./run-ownership.js";
import type { DeliverResult, SurfaceDeliveryRejectionReason, SurfaceExchangeStore } from "../contracts/core/tool-surface-exchanges.js";

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
 * `extractDeclaredSurfaceId` below). The browser genuinely has no `toolId` to offer. See
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
 * Reached only through Tovu's own admin-session-authenticated proxy (`src/server/modules/
 * assistant.ts`), which attaches the daemon bearer token like every other forwarded route — so this
 * module adds no exemption to the daemon's global bearer gate (`daemon-auth.ts`) and trusts
 * {@link RUN_PRINCIPAL_HEADER} the same way `mcp-ui-tool-calls-route.ts` and `run-ownership.ts` do.
 */

/** Mounted at the same path Tovu's proxy exposes to the browser — see `server/modules/assistant.ts`. */
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

/**
 * The `surfaceId` a validated renderer→agent message declares, if it declares one at all.
 *
 * `action` and `error` (both its `VALIDATION_FAILED` and generic-with-`surfaceId` shapes) carry it;
 * `functionResponse` and a generic `error` keyed by `functionCallId` instead do not — A2UI's own
 * spec correlates those by `functionCallId`, not `surfaceId` (see `interpreter.ts`'s module doc,
 * decision 2: "`callFunction`/`actionResponse` are not surface-scoped on the wire"). `undefined` in
 * that case is not a validation failure; it means this particular message has nothing to cross-check
 * against the route's `exchangeId` param, and delivery proceeds on `exchangeId` + `principalId`
 * alone, same as it would for any channel with no `toolId` to offer.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function extractDeclaredSurfaceId(message: RendererToAgentMessage): string | undefined {
  if ("action" in message) return message.action.surfaceId;
  if ("error" in message && "surfaceId" in message.error) return message.error.surfaceId;
  return undefined;
}

/** A validated A2UI post, or the 400 body that refuses it. */
export type ReadA2uiActionResult =
  | { ok: true; exchangeId: string; message: RendererToAgentMessage }
  | { ok: false; error: { error: string; code: "VALIDATION_ERROR" } };

/**
 * Validates an A2UI post's body: a non-empty `exchangeId`, a schema-valid renderer message, and a
 * declared `surfaceId` (when the message has one) equal to `exchangeId`. Shared by the daemon route
 * below and the admin server's BYOK-first hop, so both refuse the same malformed posts.
 *
 * @complexity O(size of the message) for the schema parse.
 */
export function readA2uiAction(rawBody: unknown): ReadA2uiActionResult {
  const body = (rawBody ?? {}) as { exchangeId?: unknown; message?: unknown };
  const exchangeId = body.exchangeId;
  if (typeof exchangeId !== "string" || exchangeId.length === 0) {
    return { ok: false, error: { error: "'exchangeId' must be a non-empty string", code: "VALIDATION_ERROR" } };
  }

  // Real spec-conformance enforcement, not a rubber stamp — mirrors `daemon.ts`'s own `/a2ui-action`
  // relay in Jini's reference app: a malformed envelope is refused at the network boundary, before
  // it can ever reach a handler waiting on `exchange.receive()`.
  const parsed = parseRendererToAgentMessage(body.message);
  if (!parsed.ok) return { ok: false, error: { error: parsed.reason, code: "VALIDATION_ERROR" } };

  const declaredSurfaceId = extractDeclaredSurfaceId(parsed.message);
  if (declaredSurfaceId !== undefined && declaredSurfaceId !== exchangeId) {
    return {
      ok: false,
      error: {
        error: `message declares surfaceId "${declaredSurfaceId}", which does not match exchangeId "${exchangeId}"`,
        code: "VALIDATION_ERROR",
      },
    };
  }
  return { ok: true, exchangeId, message: parsed.message };
}

/**
 * Delivers a validated A2UI message into `store`. No `toolId` — see this module's doc for why A2UI
 * has none to offer. `channel: "a2ui"` is what keeps it out of an MCP-UI confirmation's exchange.
 *
 * @complexity O(1).
 */
export function deliverA2uiAction(
  store: SurfaceExchangeStore,
  action: { exchangeId: string; principalId: string; message: RendererToAgentMessage },
): DeliverResult {
  return store.deliver({
    exchangeId: action.exchangeId,
    principalId: action.principalId,
    channel: "a2ui",
    params: { message: action.message },
  });
}

/**
 * The 409 body for an A2UI post whose surface is not waiting. 409, not 404: the same reasoning
 * `mcp-ui-tool-calls-route.ts` gives for its own identical choice — from the browser's side, "no
 * such exchange" and "already closed" both mean "this surface is no longer the one waiting on you",
 * which the human cannot act on differently.
 */
export function a2uiNotPendingBody(reason: SurfaceDeliveryRejectionReason) {
  return { error: "that surface is no longer waiting for an answer", code: "SURFACE_NOT_PENDING", reason } as const;
}

/**
 * Registers `POST {@link A2UI_ACTIONS_PATH}` on the daemon `app`.
 *
 * @complexity O(1) request handling; the actual delivery cost is `SurfaceExchangeStore.deliver`'s
 * own, which is O(1) (a `Map` lookup).
 * @overallScore 100
 */
export function registerA2uiActionsRoute(app: Express, deps: A2uiActionsRouteDeps): void {
  app.post(A2UI_ACTIONS_PATH, (req: Request, res: Response) => {
    const principalId = readPrincipalId(req);
    if (!principalId) {
      res.status(401).json({ error: `${RUN_PRINCIPAL_HEADER} is required`, code: "UNAUTHENTICATED" });
      return;
    }

    const action = readA2uiAction(req.body);
    if (!action.ok) {
      res.status(400).json(action.error);
      return;
    }

    const delivered = deliverA2uiAction(deps.surfaceExchanges, { exchangeId: action.exchangeId, principalId, message: action.message });
    if (!delivered.ok) {
      res.status(409).json(a2uiNotPendingBody(delivered.reason));
      return;
    }

    // Deliberately not the tool's eventual result — the agent's own call is what returns that, to
    // the model, where it belongs. Same posture as `mcp-ui-tool-calls-route.ts`'s Shape 1.
    res.status(202).json({ delivered: true });
  });
}
