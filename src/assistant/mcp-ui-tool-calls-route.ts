import { randomUUID } from "node:crypto";

import type { Express, Request, Response } from "express";

import type { Principal } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";

import { RUN_PRINCIPAL_HEADER } from "./run-ownership";
import { isMcpUiToolCallAllowed } from "./mcp-ui-tool-calls";

/**
 * @file The daemon-side half of the MCP-UI confirmation redemption endpoint (ADR-053 Decision 3).
 *
 * Mounted inside `agent-daemon-server.ts` — the only process where the `ToolRegistry`/
 * `ToolExecutor` and the `content_post_delete` handler's `PendingConfirmationStore` actually live
 * (`buildAssistantToolRegistrations` runs exactly once there, at boot). A route in Tovu's own
 * admin server cannot call `confirmations.redeem()` or the handler directly — different process,
 * different memory — and `@jini-ai/core`'s `ToolRegistry` deliberately never exposes a handler
 * outside `ToolExecutor.execute()` even to callers inside this same process (see that package's
 * `tool-registry.ts` module doc: "the only way to actually *run* a tool is through
 * `@jini-ai/daemon`'s `ToolExecutor`"). So this route's whole job is to be the one legal call site,
 * on this process, that turns a browser-authenticated redemption request into
 * `toolExecutor.execute(...)` — the exact same call a model-issued tool invocation makes, which is
 * what makes this "reuse the handler" rather than "reimplement its logic."
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
 * nothing here holds the `executionId` an external `toolExecutor.cancel()` would need. `'failed'` is
 * the real second case: `content_post_delete`'s own thrown "confirmation could not be redeemed"
 * message (a stale/reused/wrong-binding token) surfaces here, and is reported as 400 — the caller
 * (a human who just clicked a dialog) can act on it, and it is not this server's fault.
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
export function registerMcpUiToolCallsRoute(app: Express, deps: McpUiToolCallsRouteDeps): void {
  app.post(MCP_UI_TOOL_CALLS_PATH, async (req: Request, res: Response) => {
    const principalId = readPrincipalId(req);
    if (!principalId) {
      res.status(401).json({ error: `${RUN_PRINCIPAL_HEADER} is required`, code: "UNAUTHENTICATED" });
      return;
    }

    const body = (req.body ?? {}) as { toolName?: unknown; params?: unknown };
    const toolName = body.toolName;
    if (typeof toolName !== "string" || toolName.length === 0) {
      res.status(400).json({ error: "'toolName' must be a non-empty string", code: "VALIDATION_ERROR" });
      return;
    }
    // The security-critical check this whole route exists to enforce — see `mcp-ui-tool-calls.ts`.
    // Checked again here even though Tovu's proxy (`server/modules/assistant.ts`) already checks it,
    // because this route — not the proxy — is the one call site that can actually reach
    // `toolExecutor.execute`. A proxy-only check would be a suggestion, not a boundary.
    if (!isMcpUiToolCallAllowed(toolName)) {
      res.status(403).json({ error: `'${toolName}' is not an MCP-UI-redeemable tool`, code: "TOOL_NOT_ALLOWLISTED" });
      return;
    }
    const params = isPlainObject(body.params) ? body.params : {};

    const principal: Principal = { id: principalId };
    const run = { id: `mcp-ui-redemption:${randomUUID()}` };

    let result: ToolExecutionResult;
    try {
      result = await deps.toolExecutor.execute(principal, run, toolName, params);
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

    respondToExecutionResult(res, toolName, principalId, result);
  });
}
