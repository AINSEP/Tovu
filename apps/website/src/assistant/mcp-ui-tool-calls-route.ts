import { randomUUID } from "node:crypto";

import type { Express } from "express";

import type { ToolExecutor } from "@jini-ai/daemon";
import { surfaceCallbackRoutes } from "@jini-ai/daemon/http";
import type { SseSchedulerPort } from "@jini-ai/core/contracts/server";
import type { SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";

import { RUN_PRINCIPAL_HEADER } from "./daemon-access.js";
import { isMcpUiToolCallPermitted } from "./mcp-ui-tool-calls.js";
import { surfaceRouteHost } from "./surface-route-host.js";
import { mountJiniPostRoutesInPlace } from "#src/platform/express/jini-routes";

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
 *    `content_post_delete` takes under ADR-055 Decision 2, and the path a multi-turn conversation
 *    takes for every one of its turns.
 * 2. **A legacy redemption** (ADR-053 Decision 3) — no exchange id, so the answer is a second,
 *    ordinary tool call carrying a confirmation token only the rendered dialog held. No wired tool
 *    takes this path.
 *    Left in place as generic infrastructure for a future tool that genuinely needs a second,
 *    independently-authorized call rather than a held-open one; such a tool would need its own
 *    token store alongside this branch.
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
 * ADR-055 Decision 2) is waiting in, and any future Shape 2 tool's own token store
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
 * Covered by the daemon's existing global bearer gate (`apps/website/src/assistant/daemon-access.ts`'s
 * `requireAgentDaemonToken`, mounted ahead of every route in `agent-daemon-server.ts`) — this
 * module adds no exemption, so only Tovu's own proxy (`apps/website/src/server/runtime/composition/modules/assistant.ts`) can reach it.
 * The admin-session check that actually authenticates the human happens one hop earlier, in that
 * proxy; this route trusts the bearer gate plus {@link RUN_PRINCIPAL_HEADER} the same way every
 * other daemon route already does (`apps/website/src/assistant/daemon-access.ts`).
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
 * verbatim `req.originalUrl` passthrough (`apps/website/src/server/runtime/composition/modules/assistant.ts`) reaches this route with no
 * separate path-rewrite to keep in sync. */
export const MCP_UI_TOOL_CALLS_PATH = "/api/admin/v1/mcp-ui/tool-calls";

export interface McpUiToolCallsRouteDeps {
  toolExecutor: ToolExecutor;
  /**
   * The SAME store `buildAssistantToolRegistrations` was given. A different instance would leave
   * every exchange unreachable — deliveries would 409 while the agent waits out its deadline.
   */
  surfaceExchanges: SurfaceExchangeStore;
  /** Keepalive timers for a restored card's stream. */
  scheduler: SseSchedulerPort;
}

// The endpoint itself — principal header check, body validation, the three answer shapes (exchange
// delivery incl. the restored card's stream, typed answer, legacy redemption) and their exact
// 202/400/401/403/409 bodies — is Jini's (`@jini-ai/daemon/http`'s `surfaceCallbackRoutes`). Tovu
// injects its allowlist: the security-critical check this whole route exists to enforce — see
// `mcp-ui-tool-calls.ts`. Checked again here even though Tovu's proxy
// (`apps/website/src/server/runtime/composition/modules/assistant.ts`) already checks it, because this route — not the
// proxy — is the one call site that can actually reach `toolExecutor.execute`.
// `isMcpUiToolCallPermitted` also admits a federated id, but ONLY as an answer to an open card (G3) —
// Jini decides the answer shape before the check, so Shape 2 can never run one.
//
// In Tovu, Shape 2's `'completed'` is the only outcome a correctly-behaving caller sees: every domain
// tool registered through `registration-kit.ts`'s `buildDomainRegistrations` carries a pass-through
// `policy.authorize: () => "allow"` (ADR-021 §2 — the domain's OWN inline `authorize()`/
// `requireToolPermission` call is the real gate), and `requiresConfirmation` is never set on a
// catalog entry. `'failed'` was, before ADR-055 Decision 2, `content_post_delete`'s own thrown
// "confirmation could not be redeemed" message surfacing as a 400; that call site is dead now —
// `content_post_delete` takes Shape 1, whose rejections surface as Shape 1's 409. `'failed'` is
// kept for a future Shape 2 tool. A throw from `execute` (an unregistered id) is unreachable in
// practice because `isMcpUiToolCallAllowed` only admits ids `buildAssistantToolRegistrations`
// guarantees are registered (boot fails otherwise).

/**
 * Mounts `POST {@link MCP_UI_TOOL_CALLS_PATH}` on the daemon `app`, at this position in its middleware order.
 *
 * @param deps.toolExecutor - The SAME executor `agent-daemon-server.ts` built the registry with —
 * passing a different instance would mean this route executes a tool with no relationship to the
 * tool handler and its process-local state; a token-based handler would fail redemption against
 * a different store instance.
 * @complexity O(1) request handling plus the invoked tool handler's own cost.
 * @overallScore 100
 */
export function registerMcpUiToolCallsRoute({ app, deps }: { app: Express; deps: McpUiToolCallsRouteDeps }, _optional: Record<string, never> = {}): void {
  mountJiniPostRoutesInPlace({ app, routes: surfaceCallbackRoutes({
    path: MCP_UI_TOOL_CALLS_PATH,
    host: surfaceRouteHost(),
    deps: {
      toolExecutor: deps.toolExecutor,
      surfaceExchanges: deps.surfaceExchanges,
      scheduler: deps.scheduler,
      idGenerator: { newId: () => randomUUID() },
      principalHeader: RUN_PRINCIPAL_HEADER,
      admit: ({ toolName, answersAnExchange, typedAnswer }) => isMcpUiToolCallPermitted({ toolName, answersAnExchange }, { typedAnswer }),
    },
  }) });
}
