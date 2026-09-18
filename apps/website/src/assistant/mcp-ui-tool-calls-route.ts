import { randomUUID } from "node:crypto";

import type { Express, Request, Response } from "express";

import type { Principal } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";

import { RUN_PRINCIPAL_HEADER } from "./run-ownership.js";
import { isMcpUiToolCallAllowed } from "./mcp-ui-tool-calls.js";
import {
  SURFACE_EXCHANGE_ID_PARAM,
  SURFACE_TYPED_ANSWER_PARAM,
  type SurfaceExchangeStore,
} from "../contracts/core/tool-surface-exchanges.js";

/**
 * @file The daemon-side half of the MCP-UI callback endpoint — where a rendered surface's answer
 * re-enters the server.
 *
 * ## Two shapes, one path
 *
 * A callback arrives as either:
 *
 * 1. **An exchange delivery** (ADR-055 Decisions 1 and 2) — the body names an open
 *    {@link SurfaceExchangeStore} exchange, and therefore an agent tool call still held open and
 *    waiting. Nothing is executed: the message reaches that call, and the agent — still alive —
 *    returns the answer as its own result. This is the path a form takes, the path
 *    `content_post_delete` takes since Decision 2 (superseding ADR-053 Decision 3's token
 *    redemption below), and the path a multi-turn conversation takes for every one of its turns.
 * 2. **A legacy redemption** (ADR-053 Decision 3) — no exchange id, so the answer is a second,
 *    ordinary tool call carrying a confirmation token only the rendered dialog held. No wired tool
 *    takes this path today — `content_post_delete` was the only one, and it moved to shape 1 above.
 *    Left in place as generic infrastructure for a future tool that genuinely needs a second,
 *    independently-authorized call rather than a held-open one; `pending-confirmations.ts` and this
 *    branch are what such a tool would still need.
 *
 * The discriminator is the exchange id's presence rather than the tool's identity, so a tool can move
 * from one shape to the other without this route learning its name.
 *
 * ## Not MCP-only, despite the path name
 *
 * Shape 1 accepts the exchange id either as a top-level `exchangeId` or inside the tool call's
 * params. The params carrier exists for MCP-UI specifically — an mcp-ui surface can only answer by
 * issuing a tool call, so its correlation has no other way home. Any channel that can name an
 * exchange directly (A2UI, the run protocol's own `surface_response`, anything later) uses the
 * top-level field and never touches the tool-call shape at all.
 *
 * ## Why an exchange delivery is not "the browser executing a tool"
 *
 * Shape 1 never calls `toolExecutor.execute`. That is the point, not an optimization: the held-open
 * call already passed the registry's authorization gate when the agent made it, and re-running the
 * gate here would authorize the human's *answer* as though it were a fresh invocation. The
 * exchange's own binding (tool + principal) is the check that belongs at this hop, and it is a
 * correctness check — a message must reach the call it answers — rather than an authorization one.
 *
 * ## Why it must live in this process
 *
 * Mounted inside `agent-daemon-server.ts` — the only process where the `ToolRegistry`/
 * `ToolExecutor`, the `SurfaceExchangeStore` every parked call (including `content_post_delete`,
 * ADR-055 Decision 2) is waiting in, and any future Shape 2 tool's own `PendingConfirmationStore`
 * actually live (`buildAssistantToolRegistrations` runs exactly once there, at boot). A route in
 * Tovu's own admin server cannot call `surfaceExchanges.deliver()`, `confirmations.redeem()`, or a
 * handler directly — different process, different memory — and `@jini-ai/core`'s `ToolRegistry`
 * deliberately never exposes a handler outside `ToolExecutor.execute()` even to callers inside this
 * same process (see that package's `tool-registry.ts` module doc: "the only way to actually *run* a
 * tool is through `@jini-ai/daemon`'s `ToolExecutor`"). So this route's whole job is to be the one
 * legal call site, on this process, that turns a browser-authenticated answer into either an
 * exchange delivery or `toolExecutor.execute(...)` — for Shape 2, the exact same call a model-issued
 * tool invocation makes, which is what makes THAT shape "reuse the handler" rather than "reimplement
 * its logic." Shape 1 never calls the handler a second time at all — see below.
 *
 * Covered by the daemon's existing global bearer gate (`daemon-auth.ts`'s
 * `requireAgentDaemonToken`, mounted ahead of every route in `agent-daemon-server.ts`) — this
 * module adds no exemption, so only Tovu's own proxy (`server/modules/assistant.ts`) can reach it.
 * The admin-session check that actually authenticates the human happens one hop earlier, in that
 * proxy; this route trusts the bearer gate plus {@link RUN_PRINCIPAL_HEADER} the same way every
 * other daemon route already does (`run-ownership.ts`).
 *
 * Deliberately NOT run-scoped. Unlike `/api/delegated-tool-calls`, this call carries no `runId` —
 * `@jini-ai/chat`'s `create-mcp-ui-tool-caller.ts` module doc explains why: the run that raised the
 * confirmation dialog may already have finished by the time a human clicks it, and binding
 * redemption to that run's lifetime would expire a confirmation for a reason unrelated to the
 * decision being confirmed. A fresh, single-use synthetic `RunRef` (`{id}` is `@jini-ai/core`'s
 * whole structural contract for one — see `tool-registry.ts`) satisfies `ToolExecutor.execute`'s
 * signature without asserting a real run exists.
 */

/** Mounted at the same path Tovu's proxy exposes to the browser, so `forwardToAgentDaemon`'s
 * verbatim `req.originalUrl` passthrough (`server/modules/assistant.ts`) reaches this route with no
 * separate path-rewrite to keep in sync. */
export const MCP_UI_TOOL_CALLS_PATH = "/api/admin/v1/mcp-ui/tool-calls";

export interface McpUiToolCallsRouteDeps {
  toolExecutor: ToolExecutor;
  /**
   * The SAME store `buildAssistantToolRegistrations` was given. A different instance would leave
   * every exchange unreachable — deliveries would 409 while the agent waits out its deadline.
   */
  surfaceExchanges: SurfaceExchangeStore;
}

function readPrincipalId(req: Request): string | undefined {
  const value = req.get(RUN_PRINCIPAL_HEADER);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Maps one `ToolExecutionResult` onto an HTTP response.
 *
 * `'completed'` is the only outcome a correctly-behaving caller sees in practice: every domain tool
 * registered through `registration-kit.ts`'s `buildDomainRegistrations` carries a pass-through
 * `policy.authorize: () => "allow"` (ADR-021 §2 — the domain's OWN inline `authorize()`/
 * `requireToolPermission` call is the real gate, and it throws rather than returning a denial
 * `ToolExecutor` would see), and `requiresConfirmation` is never set on a catalog entry (see
 * `pending-confirmations.ts`'s header). So `'denied'`/`'confirmation-denied'` are handled for
 * completeness and to keep this switch exhaustive against `ToolExecutionStatus`, not because a live
 * path reaches them today. `'cancelled'` is similarly unreachable from this call site specifically —
 * nothing here holds the `executionId` an external `toolExecutor.cancel()` would need. `'failed'`
 * was, before ADR-055 Decision 2, `content_post_delete`'s own thrown "confirmation could not be
 * redeemed" message (a stale/reused/wrong-binding token) surfacing here as a 400. That specific call
 * site is dead now — `content_post_delete` takes Shape 1 below, whose own rejections (a stale
 * version, an expired dialog, a redelivery to an unknown-or-closed exchange) surface as this
 * function's separate 409 in the Shape 1 branch, or as an ordinary failed-tool-call result back
 * through the run that made the original call, never through THIS function. `'failed'` is kept for
 * exhaustiveness and for a future Shape 2 tool, whose thrown rejection would land here the same way.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function respondToExecutionResult(res: Response, toolName: string, principalId: string, result: ToolExecutionResult): void {
  switch (result.status) {
    case "completed":
      res.status(200).json(result.output ?? {});
      return;
    case "denied":
      res.status(403).json({ error: `principal '${principalId}' is not authorized to call '${toolName}'`, code: "FORBIDDEN" });
      return;
    case "confirmation-denied":
      res.status(409).json({
        error: `'${toolName}' declined to run without a further confirmation this endpoint cannot supply`,
        code: "CONFLICT",
      });
      return;
    case "timed-out":
      res.status(504).json({ error: `'${toolName}' timed out`, code: "GATEWAY_TIMEOUT" });
      return;
    case "cancelled":
      res.status(500).json({ error: `'${toolName}' was cancelled before it completed`, code: "INTERNAL_ERROR" });
      return;
    case "failed":
      res.status(400).json({ error: result.error ?? `'${toolName}' failed`, code: "TOOL_CALL_FAILED" });
      return;
  }
}

/**
 * Registers `POST {@link MCP_UI_TOOL_CALLS_PATH}` on the daemon `app`.
 *
 * @param deps.toolExecutor - The SAME executor `agent-daemon-server.ts` built the registry with —
 * passing a different instance would mean this route executes a tool with no relationship to the
 * `PendingConfirmationStore` that minted the token being redeemed, and every redemption would fail
 * with `unknown-or-expired`.
 * @complexity O(1) request handling plus the invoked tool handler's own cost.
 * @overallScore 100
 */
interface ParsedMcpUiToolCallRequest {
  readonly toolName: string;
  readonly params: Record<string, unknown>;
  /** Present only when this callback names an open exchange (Shape 1) — see this file's own
   *  "Two shapes, one path" doc. */
  readonly exchangeId: string | undefined;
}

/**
 * Validates and shapes `req`'s body, writing the 400/403 response and returning `null` on the
 * first invalid field — a direct extraction of {@link registerMcpUiToolCallsRoute}'s original
 * inline validation, split out purely to keep that function's complexity under the shop ceiling.
 */
function parseMcpUiToolCallRequest(req: Request, res: Response): ParsedMcpUiToolCallRequest | null {
  const body = (req.body ?? {}) as { toolName?: unknown; params?: unknown; exchangeId?: unknown };
  const toolName = body.toolName;
  if (typeof toolName !== "string" || toolName.length === 0) {
    res.status(400).json({ error: "'toolName' must be a non-empty string", code: "VALIDATION_ERROR" });
    return null;
  }
  // The security-critical check this whole route exists to enforce — see `mcp-ui-tool-calls.ts`.
  // Checked again here even though Tovu's proxy (`server/modules/assistant.ts`) already checks it,
  // because this route — not the proxy — is the one call site that can actually reach
  // `toolExecutor.execute`. A proxy-only check would be a suggestion, not a boundary.
  if (!isMcpUiToolCallAllowed(toolName)) {
    res.status(403).json({ error: `'${toolName}' is not an MCP-UI-redeemable tool`, code: "TOOL_NOT_ALLOWLISTED" });
    return null;
  }
  const params = isPlainObject(body.params) ? body.params : {};
  // Read from a top-level `exchangeId` first, falling back to the callback param. The param is
  // MCP-UI's carrier specifically — an mcp-ui surface can only answer by issuing a tool call, so
  // its correlation has to ride inside that call's params. A channel that can name the exchange
  // directly uses the top-level field and never touches the tool-call shape at all, which is what
  // keeps this route from being MCP-only.
  const rawExchangeId = typeof body.exchangeId === "string" ? body.exchangeId : params[SURFACE_EXCHANGE_ID_PARAM];
  const exchangeId = typeof rawExchangeId === "string" && rawExchangeId.length > 0 ? rawExchangeId : undefined;
  return { toolName, params, exchangeId };
}

/**
 * Shape 1: an open exchange is waiting for this message. Delivers into it and writes the response.
 * Split out of {@link registerMcpUiToolCallsRoute} purely to keep that function's complexity under
 * the shop ceiling.
 */
function deliverMcpUiExchange(
  res: Response,
  deps: Pick<McpUiToolCallsRouteDeps, "surfaceExchanges">,
  input: { exchangeId: string; params: Record<string, unknown>; toolId: string; principalId: string },
): void {
  const delivered = deps.surfaceExchanges.deliver(input);
  if (!delivered.ok) {
    // 409, not 404: from the browser's side both reasons mean "this dialog is no longer the
    // one waiting on you" — a second click, a reload of stale scrollback, or an expired form.
    // The distinction between them is not the human's to act on, and reporting it would only
    // describe server state they cannot change.
    res.status(409).json({
      error: "that dialog is no longer waiting for an answer",
      code: "SURFACE_NOT_PENDING",
      reason: delivered.reason,
    });
    return;
  }
  // Deliberately not the tool's result. The agent's own call is what returns that, to the
  // model, where it belongs — echoing it here would make this response a second copy of an
  // answer the human already gave, and hand the iframe output it has no use for.
  res.status(202).json({ delivered: true });
}

/**
 * True when this callback is a human's TYPED answer — prose from the chat composer rather than a
 * click on the rendered surface. Presence of a non-blank {@link SURFACE_TYPED_ANSWER_PARAM} is the
 * whole discriminator: no form produces that param, and nothing else in the request distinguishes a
 * typed answer from a Shape-2 redemption.
 *
 * @complexity O(1).
 */
function isTypedSurfaceAnswer(params: Record<string, unknown>): boolean {
  const raw = params[SURFACE_TYPED_ANSWER_PARAM];
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * Shape 3: a typed answer that names no exchange. Resolves which open exchange it is for, delivers
 * it, and writes the response.
 *
 * ## Why the route resolves the correlation rather than the client
 *
 * A human typing into the composer has never seen an exchange id. The only place one exists
 * client-side is inside the surface's own HTML — which is model-influenced and rendered in a
 * sandboxed iframe, so a client that scraped an id out of it and posted it back would be supplying a
 * correlation the model wrote both ends of. `findTypedAnswerTarget` reads it off the store instead,
 * scoped to this request's server-verified principal and to the named (already allowlisted) tool.
 *
 * ## Why an unmatched typed answer must not fall through to Shape 2
 *
 * Shape 2 EXECUTES the named tool as a brand-new call. For `assistant_ask_choice` that would put a
 * second, unasked-for form on the human's screen in response to a message that was only ever meant to
 * answer the first one. A refusal is the honest outcome: there is nothing outstanding to answer.
 */
function deliverTypedSurfaceAnswer(
  res: Response,
  deps: Pick<McpUiToolCallsRouteDeps, "surfaceExchanges">,
  input: { params: Record<string, unknown>; toolId: string; principalId: string },
): void {
  const exchangeId = deps.surfaceExchanges.findTypedAnswerTarget({
    principalId: input.principalId,
    toolId: input.toolId,
  });
  if (exchangeId === undefined) {
    // Same 409 body as `deliverMcpUiExchange`'s own refusal, for the same reason: from the human's
    // side "nothing is outstanding", "it already expired" and "you have two open and named neither"
    // are one situation they cannot act on differently.
    res.status(409).json({
      error: "that dialog is no longer waiting for an answer",
      code: "SURFACE_NOT_PENDING",
      reason: "unknown-or-closed",
    });
    return;
  }
  deliverMcpUiExchange(res, deps, { exchangeId, params: input.params, toolId: input.toolId, principalId: input.principalId });
}

/**
 * Shape 2: legacy two-call redemption (ADR-053) — executes the tool through the same
 * `ToolExecutor.execute` a model-issued call uses, and maps the outcome onto the HTTP response.
 * Split out of {@link registerMcpUiToolCallsRoute} purely to keep that function's complexity under
 * the shop ceiling.
 */
async function executeMcpUiToolCall(
  res: Response,
  deps: Pick<McpUiToolCallsRouteDeps, "toolExecutor">,
  input: { toolName: string; params: Record<string, unknown>; principalId: string },
): Promise<void> {
  const principal: Principal = { id: input.principalId };
  const run = { id: `mcp-ui-redemption:${randomUUID()}` };

  let result: ToolExecutionResult;
  try {
    result = await deps.toolExecutor.execute(principal, run, input.toolName, input.params);
  } catch (error) {
    // `ToolExecutor.execute` throws only for an unregistered `toolId` (`tool-executor.ts`) — and
    // `isMcpUiToolCallAllowed` only lets through ids `buildAssistantToolRegistrations` guarantees
    // are registered (it fails the daemon's own boot otherwise), so this is unreachable in
    // practice. Reported rather than left to crash the process, in case that guarantee is ever
    // violated by a future refactor.
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    return;
  }

  respondToExecutionResult(res, input.toolName, input.principalId, result);
}

export function registerMcpUiToolCallsRoute(app: Express, deps: McpUiToolCallsRouteDeps): void {
  app.post(MCP_UI_TOOL_CALLS_PATH, async (req: Request, res: Response) => {
    const principalId = readPrincipalId(req);
    if (!principalId) {
      res.status(401).json({ error: `${RUN_PRINCIPAL_HEADER} is required`, code: "UNAUTHENTICATED" });
      return;
    }

    const parsed = parseMcpUiToolCallRequest(req, res);
    if (!parsed) return;

    // ---- Shape 1: an open exchange is waiting for this message. ----
    if (parsed.exchangeId !== undefined) {
      deliverMcpUiExchange(res, deps, { exchangeId: parsed.exchangeId, params: parsed.params, toolId: parsed.toolName, principalId });
      return;
    }

    // ---- Shape 3: a human typed their answer instead of clicking the form, so it names no
    // exchange. Checked before Shape 2 because Shape 2 would EXECUTE the tool afresh — putting a
    // second, unasked-for dialog on screen in reply to an answer to the first. ----
    if (isTypedSurfaceAnswer(parsed.params)) {
      deliverTypedSurfaceAnswer(res, deps, { params: parsed.params, toolId: parsed.toolName, principalId });
      return;
    }

    // ---- Shape 2: legacy two-call redemption (ADR-053). ----
    await executeMcpUiToolCall(res, deps, { toolName: parsed.toolName, params: parsed.params, principalId });
  });
}
