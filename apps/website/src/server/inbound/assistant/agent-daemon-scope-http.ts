import express from "express";
import type { Principal } from "@jini-ai/core";
import { stopRunsForToolAccessChange, type createAgentExecutor, type ToolExecutor, type RunLifecycle, type UserMessageDelivery, type ToolAccessRun } from "@jini-ai/daemon";
import { createDaemonAuthMiddleware, frontendRequestRoutes, agentRoutes, componentCatalogRoutes, delegatedToolRoutes, messageRelayRoutes, runRoutes, toolCatalogRoutes, type createFrontendControl, type RunStartHandler, type RunMessageRequest, type DelegatedToolExecuteRequest } from "@jini-ai/daemon/http";
import { bearerTokenFromHeader, createLocalSameOriginPolicy, type RouteHostContext } from "@jini-ai/core/contracts/server";
import { publishJobRecoveryMessage } from "@jini-ai/devops/deploy";
import { createRunScopedCredentials, createRunOwnerRegistry, DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken, requireRunOwnership, createOwnedRunListHandler } from "#src/assistant/daemon-access";
import { constrainPrincipalToReadOnlyTools } from "#src/assistant/read-only-tool-constraint";
import { delegatedToolErrorDisclosure } from "#src/assistant/tool-recovery-preset";
import { FRONTEND_CONTROL_CAPABILITIES } from "#src/assistant/frontend-control-capabilities";
import { adminFrontendOwner } from "#src/assistant/admin-frontend-owner";
import { registerMcpUiToolCallsRoute } from "#src/assistant/mcp-ui-tool-calls-route";
import { registerA2uiActionsRoute } from "#src/assistant/a2ui-actions-route";
import { registerRunActiveContextRoute, type RunActiveContextStore } from "#src/assistant/run-active-context";
import { checkReadOnlyTool, defaultDaemonMessages } from "@jini-ai/daemon/read-only-tools";
import { daemonRouteHost, mountJiniRoutes, nodeIntervalScheduler } from "../../runtime/composition/jini-routes.js";
import { registerAgentPluginEvents } from "./agent-plugin-preflight-events.js";
import { registerToolAccessLoweringRoute } from "./tool-access-lowering-route.js";
import { registerCredentialRunIntake, registerDurableRunStartRoute, registerDurableToolGuard } from "./durable-run-routes.js";
import type { AgentDaemonCoreDeps } from "../../runtime/composition/agent-daemon-core-deps.js";
import type { createDaemonSiteTools } from "./agent-daemon-site-tools.js";
import type { createAgentDaemonIdlePark } from "./agent-daemon-idle-park.js"; import type { createAssistantAgentInventory } from "#src/assistant/agents"; import type { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";

type ScopeAppPorts = {
  env: NodeJS.ProcessEnv; authEnv: NodeJS.ProcessEnv; port: number; isDisposed(): boolean;
  responses: Set<express.Response>; idlePark: ReturnType<typeof createAgentDaemonIdlePark>;
  lifecycle: RunLifecycle; principalByRunId: Map<string, Principal>; runCredentials: ReturnType<typeof createRunScopedCredentials>;
  durableMessageIdsByRunId: Map<string, string>; runOwners: ReturnType<typeof createRunOwnerRegistry>; agentExecutor: ReturnType<typeof createAgentExecutor>;
  toolAccessRuns: Map<string, ToolAccessRun>; revokedToolRuns: Set<string>; cleanupFailures: Set<string>;
  siteTools: ReturnType<typeof createDaemonSiteTools>; routeDeps: AgentDaemonCoreDeps; onStarted: RunStartHandler;
  deliverRunUserMessage(input: RunMessageRequest, optional: object): Promise<UserMessageDelivery>;
  assistantInventory: ReturnType<typeof createAssistantAgentInventory>; runActiveContexts: RunActiveContextStore;
  toolExecutor: ToolExecutor; surfaceExchanges: ReturnType<typeof createSurfaceExchangeStore>;
  frontendControl: ReturnType<typeof createFrontendControl>;
};
type MountPorts = ScopeAppPorts & { app: express.Express; routeHost: ReturnType<typeof daemonRouteHost>; resolvePrincipal(input: { request: DelegatedToolExecuteRequest }): Principal; resolveDiscoveryCaller(req: express.Request): ReturnType<ScopeAppPorts['runCredentials']['resolveCaller']> };


/** Fails closed: an untracked `runId` throws rather than fabricating a principal — see
 * `apps/website/src/server/runtime/composition/modules/assistant.ts`'s identical guard for the full rationale.
 *
 * A `requireReadOnly` request (the wire flag `@jini-ai/mcp`'s `execute_readonly_delegated_tool`
 * sets, and which `@jini-ai/http-kit` hands to this host-owned resolver verbatim) resolves to an
 * ATTENUATED principal instead of the tracked one. That is what carries the constraint past this
 * route and into the execution itself, where `withReadOnlyToolConstraint` enforces it on every
 * dispatch rather than only on the id the caller named — the route's own check answers for that one
 * id, and a decorator can dispatch another. See `read-only-tool-constraint.ts`. */
function resolvePrincipal({ principalByRunId, request }: { principalByRunId: Map<string, Principal>; readonly request: DelegatedToolExecuteRequest }, _optional = {}): Principal {
  const principal = principalByRunId.get(request.runId);
  if (!principal) throw new Error(`no principal is tracked for run "${request.runId}"`);
  return request.requireReadOnly === true ? constrainPrincipalToReadOnlyTools(principal) : principal;


/** Resolve discovery authority from a still-live per-run credential, never a wire principal. */
function resolveDiscoveryCaller({ runCredentials }: Pick<ScopeAppPorts, 'runCredentials'>, req: express.Request) {
  const token = bearerTokenFromHeader({ header: req.get("authorization") });
  return token ? runCredentials.resolveCaller({ token }) : undefined;
}

export function createScopeApp(required: ScopeAppPorts, _optional = {}) {
  const { port, env } = required;
  const app = express();
  mountIntake({ ...required, app });
  mountGuards({ ...required, app, resolveDiscoveryCaller: req => resolveDiscoveryCaller(required, req) });
const adapter: RouteHostContext = { originPolicy: createLocalSameOriginPolicy({ port: () => port, env,
  // These are the environment names the previously imported http-kit origin guard read.
  // Preserve that deployed contract when supplying the now-explicit origin configuration.
  config: { allowedOriginsEnvVar: "JINI_ALLOWED_ORIGINS", webPortEnvVar: "JINI_WEB_PORT", bindHostEnvVar: "JINI_BIND_HOST" } }) }; const routeHost = daemonRouteHost({ context: adapter, parserLimitBytes: 6 * 1024 * 1024 }); // 6 MiB = the `express.json({ limit: "6mb" })` parser above; route lists derive their own body limit from it.
  const ports = { ...required, app, routeHost, resolveDiscoveryCaller: (req: express.Request) => resolveDiscoveryCaller(required, req),
    resolvePrincipal: ({ request }: { request: DelegatedToolExecuteRequest }) => resolvePrincipal({ principalByRunId: required.principalByRunId, request }) };
  mountRunRoutes(ports);
  mountDelegatedRoutes(ports);
  mountSurfaceRoutes(ports);
  return { app, routeHost };
}

function mountIntake({ app, isDisposed, responses, idlePark, lifecycle, principalByRunId, authEnv, runCredentials, agentExecutor }: ScopeAppPorts & { app: express.Express }, _optional = {}) {
app.use((_req, res, next) => {
  if (isDisposed()) { res.status(503).json({ error: "site scope is closed" }); return; }
  responses.add(res); res.once("close", () => responses.delete(res));
  next();
});
app.use(idlePark.middleware);
registerAgentPluginEvents({ app, lifecycle, principalFor: ({ runId }) => principalByRunId.get(runId)?.id }, { env: authEnv });

// Only this POST uses Jini's credential-bound claim authorization instead of the proxy/owner gates.
// Authenticate before parsing; the handler re-resolves the live credential and checks the URL run.
// Mount before requireRunOwnership: no proxy principal header or retained owner record is needed.
app.post("/api/runs/:runId/messages/claim", createDaemonAuthMiddleware({
  authorizationHeaderName: "authorization",
  authorize: ({ request }) => {
    const token = bearerTokenFromHeader({ header: request.headers.authorization });
    const caller = token ? runCredentials.resolveCaller({ token }) : undefined;
    return caller ? { allowed: true } : { allowed: false, status: 401,
      body: { error: { code: "UNAUTHENTICATED", message: "a live run credential is required" } } };
  },
}), express.json({ limit: "1kb" })); // The only valid body is `{ via }`.
mountJiniRoutes({ app, routes: messageRelayRoutes({ agentExecutor, runScopedCallers: runCredentials }) });
}

function mountGuards({ app, authEnv, runCredentials, toolAccessRuns, revokedToolRuns, lifecycle, cleanupFailures, siteTools, resolveDiscoveryCaller }: Pick<MountPorts, "app" | "authEnv" | "runCredentials" | "toolAccessRuns" | "revokedToolRuns" | "lifecycle" | "cleanupFailures" | "siteTools" | "resolveDiscoveryCaller">, _optional = {}) {
// Before every other route's `express.json()` — an unauthenticated caller's body is never parsed. See this
// file's module doc and `apps/website/src/assistant/daemon-access.ts` for the fail-closed contract. No exemptions: the spawned
// bridge now presents JINI_DAEMON_TOKEN on delegated calls too. BYOK dispatches in process, and
// the proxy does not expose the delegated route (`apps/website/src/assistant/daemon-access.ts`'s DELEGATED_TOOL_CALLS_PATH).
// `runScopedCallers`: each run's bridge presents its own per-run credential, which reaches only the
// bridge's routes and stands for that run's principal, never one the caller asserts
// (`Jini packages/daemon/src/run-credentials.ts`). The proxy token alone still carries a proxy-asserted principal.
app.use(requireAgentDaemonToken({ env: authEnv, runScopedCallers: runCredentials }, {}));
// Default (100kb) is too small for `admin.capture_screenshot`'s answer: a base64-encoded JPEG of an
// admin viewport, posted back to `/api/frontend-sessions/:id/responses`
// (`frontend-session-bridge.ts`'s `respond()`), routinely exceeds it even after
// `agent-screenshot.ts`'s own quality/size retries — a silent 413 would look like a capture bug
// rather than the transport limit it actually is. Raised, not removed: this still bounds the worst
// case for every route mounted below (all of them, since this is `app.use` with no path), and every
// caller reaching them is already past `requireAgentDaemonToken` above, so this is not a new
// unauthenticated attack surface, only a larger authenticated one.
app.use(express.json({ limit: "6mb" }));
mountToolAccessLowering({ app, toolAccessRuns, revokedToolRuns, runCredentials, lifecycle, cleanupFailures });
// Re-resolve each bridge credential after parsing; neither a proxy identity nor a previous
// caller's snapshot can supply an unscoped catalog. Native async context survives all awaits.
app.use(["/api/tools", "/api/components", DELEGATED_TOOL_CALLS_PATH], (req, res, next) => {
  const caller = resolveDiscoveryCaller(req);
  if (!caller) { res.status(404).json({ error: "a live run is required" }); return; }
  try { siteTools.withRun({ runId: caller.runId, fn: () => next() }); }
  catch (error) { next(error); }
});
// Re-resolve the bearer after parsing, so even a credential that expired while parsing fails
// closed. Run credentials must match body.runId before any delegated handler or tool can execute;
// proxy credentials retain their existing authority.
app.post(DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken({ env: authEnv, runScopedCallers: runCredentials, validateDelegatedRunId: true }, {}));
}

function mountToolAccessLowering({ app, toolAccessRuns, revokedToolRuns, runCredentials, lifecycle, cleanupFailures }: Pick<MountPorts, "app" | "toolAccessRuns" | "revokedToolRuns" | "runCredentials" | "lifecycle" | "cleanupFailures">, _optional = {}) {
registerToolAccessLoweringRoute({ app, lower: change => stopRunsForToolAccessChange({ runs: [...toolAccessRuns.values()], change,
  revoke: ({ runId }) => { revokedToolRuns.add(runId); runCredentials.revoke({ runId }); },
  cancel: async ({ runId }) => { await lifecycle.cancel({ runId }); },
  waitForCleanup: async ({ runId }) => {
    await lifecycle.waitForTerminal({ runId }, { signal: AbortSignal.timeout(8_000) });
    if (cleanupFailures.has(runId)) throw new Error('CLI cleanup failed');
  },
  notice: async ({ runId, message }) => {
    await Promise.all([
      lifecycle.emit({ runId, input: { event: 'agent', data: { type: 'status', label: 'tool_access_changed', detail: message } } }),
      lifecycle.emit({ runId, input: { event: 'agent', data: { type: 'text_delta', delta: `\n\n${message}` } } }),
    ]);
  },
}) });
}

function mountRunRoutes({ app, runOwners, lifecycle, routeDeps, onStarted, routeHost, agentExecutor, deliverRunUserMessage, assistantInventory, runActiveContexts }: MountPorts, _optional = {}) {
// Per-run authorization, mounted between the bearer gate and the run routes it protects. The gate
// above proves the caller is Tovu's proxy; these two prove *which admin* the proxy is speaking for,
// which is the question neither the gate nor the proxy's own session check can answer. Both must
// precede `runRoutes`: the middleware so it runs first, and the list handler so it shadows
// http-kit's unscoped `runListRoute` under Express's first-match-wins routing. See
// `Jini packages/daemon/src/run-credentials.ts` for the ownership model and the 404-not-403 rationale.
app.use("/api/runs/:runId", requireRunOwnership({ registry: runOwners, lifecycle: lifecycle }, {}));
app.get("/api/runs", createOwnedRunListHandler({ lifecycle, registry: runOwners }, {}));

registerCredentialRunIntake({ app }, {});
if (routeDeps.chatRunLedger.durable) registerDurableRunStartRoute({ app, lifecycle, onStarted, store: routeDeps.chatRunLedger.durable }, {});
mountJiniRoutes({ app, routes: runRoutes({ deps: { lifecycle, onStarted,
  deliverUserMessage: (input) => agentExecutor.sendUserMessage(input),
  deliverUserMessageWithAttachments: (input) => deliverRunUserMessage(input, {}),
}, host: routeHost }) });
// `rescanAgents` wired explicitly (not left to fall back to `listAgents`, `@jini-ai/http-kit`'s own
// default): `listAssistantAgents` is now cached (see `agents.ts`'s module doc — this file's own
// gap was the fallback silently serving the same stale cache `POST /api/agents/rescan` exists to
// bypass). `rescanAssistantAgents` is the one path that actually forces a fresh PATH probe.
mountJiniRoutes({ app, routes: agentRoutes({ deps: { listAgents: assistantInventory.listAssistantAgents, rescanAgents: assistantInventory.rescanAssistantAgents }, host: routeHost }) });
// `GET /api/active` — the one route `jini-mcp` calls (`get_active_context`) that this daemon never
// served, so it answered 404. Behind the bearer gate above like every route but the delegated one.
registerRunActiveContextRoute(app, runActiveContexts);
}

function mountDelegatedRoutes({ app, lifecycle, toolExecutor, resolvePrincipal, siteTools, routeDeps, durableMessageIdsByRunId, routeHost }: MountPorts, _optional = {}) {
// `toolRegistry` is what lets a `requireReadOnly` call be CHECKED. Without it the read-only
// gateway does not weaken to a pass-through -- it fails closed and refuses every call -- so
// omitting it silently disables the gateway rather than silently widening it.
// `delegatedToolErrorDisclosure()` supplies both error-disclosure options: `isModelSafeToolFailure`
// lets a failure `withRedactedToolFailures` already redacted (it carries an `ERR-…` id) reach the
// model as `422 Error <ID>: <reason>`, and `describeInternalError` gives every other failure http-kit
// would answer with a bare `500 INTERNAL_ERROR` (unknown tool id, timed-out, cancelled, a throwing
// `resolvePrincipal`) the same redacted `Error <ID>: <reason>` text.
// Built as a variable, not an inline literal: `describeInternalError` is newer than the published
// @jini-ai/http-kit 0.3.7 types, and a non-literal argument is not excess-property-checked, so this
// compiles against both. Against 0.3.7 at runtime the option is inert (bare 500s return) until
// Tovu's http-kit range is bumped to the release that ships it.
const delegatedToolRouteDeps = {
  lifecycle,
  toolExecutor,
  resolvePrincipal,
  toolRegistry: siteTools.registry, toolFamilies: siteTools.families,
  ...delegatedToolErrorDisclosure({}, {}),
  // Static jobs live at the site server. Read once through its normal permission gate after a
  // lost delegated response; the five-second deadline cannot extend or repeat the publish.
  recoverInterruptedTool: async ({ principal, runId, toolId, result }: {
    principal: import("@jini-ai/core").Principal; runId: string; toolId: string; result: import("@jini-ai/daemon").ToolExecutionResult;
  }) => {
    if (toolId !== "deployment_execute_static_publish") return undefined;
    try {
      const checked = await toolExecutor.execute({ principal, run: { id: runId }, toolId: "deployment_get_static_publish_status", input: { executionId: result.executionId } }, { signal: AbortSignal.timeout(5_000) });
      const output = checked.output as { status?: unknown; message?: unknown } | null;
      if (checked.status === "completed" && output?.status && typeof output.message === "string") return output.message;
    } catch { /* A failed status read cannot prove whether the publish started. */ }
    return publishJobRecoveryMessage({ statusToolId: "deployment_get_static_publish_status" });
  },
};
registerDurableToolGuard({ app, ledger: routeDeps.chatRunLedger,
  isRegistered: ({ toolId }) => siteTools.registry.has({ toolId }),
  isReadOnly: ({ toolId }) => checkReadOnlyTool({ toolId, registry: siteTools.registry, messages: defaultDaemonMessages.readOnly }, {}) === null,
  async messageIdForAttempt({ runId }) {
    return durableMessageIdsByRunId.get(runId) ?? null;
  },
}, {});
mountJiniRoutes({ app, routes: delegatedToolRoutes({ deps: delegatedToolRouteDeps, host: routeHost }) });
}

function mountSurfaceRoutes({ app, toolExecutor, surfaceExchanges, frontendControl, routeHost, routeDeps, siteTools, resolveDiscoveryCaller }: MountPorts, _optional = {}) {
// The MCP-UI callback endpoint. Two shapes reach it: an exchange delivery, where a form's OR
// content_post_delete's answer resolves an agent tool call still waiting on it (ADR-055 Decision 1
// for forms, Decision 2 for the destructive delete), and the legacy confirmation redemption shape
// (ADR-053 Decision 3), which no wired tool currently uses — `content_post_delete` was the only
// tool that ever took it, and it moved to the exchange shape above.
// Same non-exemption reasoning as `frontendControl.httpExtension` just below: the
// browser reaches this through Tovu's session-authenticated proxy, which attaches the bearer token
// like every other forwarded route, so no `exemptPaths` entry is needed or wanted. See
// `mcp-ui-tool-calls-route.ts` for why this must live in THIS process (it is the one holding the
// `ToolExecutor`/`SurfaceExchangeStore` an exchange delivery actually needs) and
// `apps/website/src/server/runtime/composition/modules/assistant.ts` for the proxy half.
registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges, scheduler: nodeIntervalScheduler });
// A2UI's own inbound channel (ADR-055 Decision 1, generalized) — a rendered surface's `action`/
// `functionResponse`/`error` re-entering the process that holds the exchange it answers. Unlike
// the MCP-UI route above, this never touches `toolExecutor` at all (there is no tool-call shape to
// fall back to for A2UI) — see `a2ui-actions-route.ts`'s own module doc. Same non-exemption
// reasoning: reached only through Tovu's session-authenticated proxy, which attaches the bearer
// token like every other forwarded route.
registerA2uiActionsRoute(app, { surfaceExchanges });
// The browser half of the `page.*` channel: an SSE stream that carries invocations down to the
// admin tab, and a POST that carries its answers back. Deliberately NOT added to the bearer gate's
// `exemptPaths` — unlike `/api/delegated-tool-calls` (whose caller is a spawned `jini-mcp`
// subprocess that holds no token), these two are reached by the browser through Tovu's own
// session-authenticated proxy, which attaches the bearer like every other forwarded route. See
// `apps/website/src/server/runtime/composition/modules/assistant.ts`.
mountJiniRoutes({ app, routes: frontendControl.routes({ host: routeHost }) });
// Runless WebMCP uses the same policy/exchange/audit stack as a daemon run. The proxy supplies
// the authenticated principal; the bind token and tab id constrain the effect to its own screen.
mountJiniRoutes({ app, routes: frontendRequestRoutes({ path: "/api/frontend-sessions/request", control: frontendControl, host: routeHost,
  executor: toolExecutor, capabilityIds: FRONTEND_CONTROL_CAPABILITIES.filter(entry => entry.id.startsWith("page.")).map(entry => entry.id),
  resolveOwner: async (input) => adminFrontendOwner({ ...input, workspaceId: routeDeps.workspaceId }),
}) });

  mountDiscoveryRoutes({ app, siteTools, routeHost, resolveDiscoveryCaller });
}

function mountDiscoveryRoutes({ app, siteTools, routeHost, resolveDiscoveryCaller }: Pick<MountPorts, "app" | "siteTools" | "routeHost" | "resolveDiscoveryCaller">, _optional = {}) {
  // Discovery is scoped by each run's credential; the server refreshes its own plugin/settings
  // state before returning descriptors. The native FTS owner is released with the final run.
  mountJiniRoutes({ app, routes: toolCatalogRoutes({ deps: { catalog: siteTools.catalog }, host: routeHost }) });
  app.use("/api/components", (req, res, next) => {
    const caller = resolveDiscoveryCaller(req);
    if (!caller) { res.status(404).json({ error: "a live run is required" }); return; }
    void siteTools.refreshComponents({ runId: caller.runId }).then(() => {
      siteTools.withRun({ runId: caller.runId, fn: () => next() });
    }).catch(() => {
      res.status(503).json({ error: "component catalog is unavailable", code: "COMPONENT_CATALOG_UNAVAILABLE" });
    });
  });
  mountJiniRoutes({ app, routes: componentCatalogRoutes({ deps: { catalog: siteTools.components }, host: routeHost }) });
}
