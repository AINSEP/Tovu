/** Retained daemon state at its site owner. Auth precedes the bounded parser, as with tool RPC. */
import { json, type RequestHandler } from "express";
import { requireToolExecutionCaller, type ToolExecutionRouteTarget } from "@jini-ai/daemon/http";
import { DaemonCoreError, daemonCoreRequest, type DaemonCoreRequest, type DaemonAttemptHead } from "#src/assistant/daemon-core-protocol";
import { currentToolExecToken, TOOL_EXEC_TOKEN_ENV_VAR } from "#src/assistant/daemon-access";
import { getAgentDef } from "@jini-ai/agent-runtime";
import { readAssistantToolConsentSnapshot, allowAssistantRunTools } from "#src/server/inbound/assistant/assistant-tool-access";
import type { RouteDeps } from "#src/server/routes/types";

type CoreDeps = Pick<RouteDeps, "workspaceId" | "ownerPrincipalId" | "siteBinding" | "siteStoragePaths" | "chatRunLedger" |
  "agentSessions" | "settingsRepo" | "getEffective" | "settingsUiTabsReady" | "siteTitleReady" | "instructionsNamespace" | "tracker" | "aiTraceSink" | "authorize" | "clock" | "idGen" | "principalRepo" | "settingsReady">;

/** Reuse the server's real attempt/settings/provider owners, with no second ledger or boot.
 * Private daemon credentials alone can call it; run/CLI credentials cannot. Calls never retry.
 * @param required The serving router and already composed site ports.
 * @returns No resources; server shutdown retains provider disposal ownership.
 * @complexity O(1) setup; each RPC performs at most one owner operation, bounded to 16 MiB (matching the existing tool RPC).
 * @example registerAgentDaemonCoreRoutes({ router, deps: routeDeps });
 */
export function registerAgentDaemonCoreRoutes({ router, deps }: { router: ToolExecutionRouteTarget; deps: CoreDeps }, _options = {}): void {
  const env: NodeJS.ProcessEnv = { get [TOOL_EXEC_TOKEN_ENV_VAR]() { return currentToolExecToken(); } };
  const handler: RequestHandler = (req, res, next) => {
    const parsed = daemonCoreRequest.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "invalid retained-state request" }); return; }
    void dispatch({ deps, request: parsed.data }).then(value => {
      res.status(200).set("cache-control", "no-store").json({ value: value ?? null, traceCapture: deps.aiTraceSink?.capture ?? "metadata" });
    }).catch(next);
  };
  router.post("/internal/agent-daemon-core", requireToolExecutionCaller({}, { env, tokenEnvVar: TOOL_EXEC_TOKEN_ENV_VAR }), json({ limit: "16mb" }), handler);
}

/** Indexed owner operations. Never accept a workspace override or create an accepted attempt.
 * Session and mutation writes reuse the store's atomic generation fences, including after cancel.
 * @complexity O(1) indexed owner calls; bootstrap awaits the existing readiness promises.
 */
async function dispatch({ deps, request }: { deps: CoreDeps; request: DaemonCoreRequest }, _options = {}): Promise<unknown> {
  if (request.operation === "bootstrap") return bootstrapSnapshot({ deps });
  if (request.operation === "getEffective") return readSetting({ deps, input: request.input });
  if (request.operation.startsWith("telemetry")) return telemetry({ deps, request });
  const store = deps.chatRunLedger.durable;
  if (!store) throw new DaemonCoreError({ reason: "site attempt authority is unavailable" });
  // All non-bootstrap reads remain site scoped, even when a private caller supplies a run id.
  const input = request.input as { runId: string };
  const run = await store.find({ runId: input.runId }, {});
  if (run && run.workspaceId !== deps.workspaceId) throw new DaemonCoreError({ reason: "foreign attempt workspace" });
  return retainedRunOperation({ deps, request, run, store });
}

/** Site scoping precedes every accepted-attempt operation, including consent. */
async function retainedRunOperation({ deps, request, run, store }: {
  deps: CoreDeps; request: DaemonCoreRequest;
  run: Awaited<ReturnType<NonNullable<CoreDeps["chatRunLedger"]["durable"]>["find"]>>;
  store: NonNullable<CoreDeps["chatRunLedger"]["durable"]>;
}): Promise<unknown> {
  if (request.operation === "cliConsentSnapshot" || request.operation === "cliConsentAllow") return cliConsent({ deps, request, run });
  if (request.operation === "sessionForAttempt") {
    return sessionForAttempt({ deps, run });
  }
  if (request.operation === "find") return attemptHead({ run, principalId: request.input.principalId });
  return durable({ store, request });
}

/** Resolve the actor from the accepted attempt. Wire callers cannot select a principal or site. */
async function cliConsent({ deps, request, run }: {
  deps: CoreDeps;
  request: Extract<DaemonCoreRequest, { operation: "cliConsentSnapshot" | "cliConsentAllow" }>;
  run: Awaited<ReturnType<NonNullable<CoreDeps["chatRunLedger"]["durable"]>["find"]>>;
}): Promise<unknown> {
  if (!isLiveConsentRun({ deps, run })) throw new DaemonCoreError({ reason: "tool consent requires this site's live accepted answer" });
  const principalId = run!.principalId!;
  const person = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: principalId });
  if (person?.kind !== 'user' || person.status !== 'active') throw new DaemonCoreError({ reason: "tool consent requires an active person" });
  if (!getAgentDef({ id: request.input.agentId })) throw new DaemonCoreError({ reason: "tool consent names an unknown agent" });
  const input = { deps, principalId, agentId: request.input.agentId, env: process.env, getDef: getAgentDef };
  if (request.operation === "cliConsentSnapshot") return readAssistantToolConsentSnapshot(input);
  return allowAssistantRunTools({ ...input, keys: request.input.keys, expectedRevisionSeq: request.input.expectedRevisionSeq,
    isLive: async () => {
      const fresh = await deps.chatRunLedger.durable!.find({ runId: request.input.runId }, {});
      return isLiveConsentRun({ deps, run: fresh }) && fresh!.principalId === principalId;
    },
  });
}

function isLiveConsentRun({ deps, run }: {
  deps: CoreDeps; run: Awaited<ReturnType<NonNullable<CoreDeps["chatRunLedger"]["durable"]>["find"]>>;
}): boolean {
  if (!run || run.workspaceId !== deps.workspaceId || !run.principalId || run.cancelReason) return false;
  return ["queued", "running"].includes(run.message.runStatus ?? "");
}

/** Dispatch only daemon-retained methods. Acceptance, advance and recovery stay server-only.
 * @complexity One indexed store call; atomic liveness/uncertainty checks belong to that owner.
 */
async function durable({ store, request }: { store: NonNullable<CoreDeps["chatRunLedger"]["durable"]>; request: DaemonCoreRequest }): Promise<unknown> {
  switch (request.operation) {
    case "captureSession": return store.captureSession(request.input, {});
    case "clearSession": return store.clearSession(request.input, {});
    case "guardTool": return store.guardTool({ ...request.input, input: request.input.input }, {});
    case "completeTool": return store.completeTool(request.input, {});
    default: throw new DaemonCoreError({ reason: "unsupported daemon operation" });
  }
}

/** Provider admission, consent, redaction and buffering remain in the site's existing facades.
 * Flushing a daemon must never dispose the server's provider leases.
 * @complexity One bounded event per request; no retained process-global queue here.
 */
async function telemetry({ deps, request }: { deps: CoreDeps; request: DaemonCoreRequest }): Promise<void> {
  switch (request.operation) {
    case "telemetryCapture": await deps.tracker.capture(request.input, { properties: request.input.properties }); return;
    case "telemetryError": {
      const { name, message, stack, operation, attributes, level } = request.input;
      const error = new Error(message); error.name = name; error.stack = stack;
      deps.tracker.error({ error }, { context: { operation, attributes: { ...attributes, process: "daemon" }, level } }); return;
    }
    case "telemetryTrace": deps.aiTraceSink?.record(request.input); return;
    case "telemetryFlush": await deps.aiTraceSink?.flush?.(); return;
    default: throw new DaemonCoreError({ reason: "unsupported daemon telemetry operation" });
  }
}

/** Resolve a native session only through the site's live accepted attempt, never wire conversation ids.
 * @complexity One indexed lookup; terminal/missing attempts return no locator. */
async function sessionForAttempt({ deps, run }: { deps: CoreDeps; run: Awaited<ReturnType<NonNullable<CoreDeps["chatRunLedger"]["durable"]>["find"]>> }): Promise<string | null> {
  if (!run || run.cancelReason || !["queued", "running"].includes(run.message.runStatus ?? "")) return null;
  return deps.agentSessions.getSessionId({ conversationId: run.conversationId, agentId: run.request.agentId ?? "claude" });
}

/** Project this fresh owner read onto the retained start/gate contract, excluding saved events.
 * @complexity O(1); no transcript copy or retained mirror. A principal mismatch is indistinguishable from absence. */
function attemptHead({ run, principalId }: { run: Awaited<ReturnType<NonNullable<CoreDeps["chatRunLedger"]["durable"]>["find"]>>; principalId?: string }): DaemonAttemptHead | null {
  if (!run || (principalId !== undefined && principalId !== run.principalId)) return null;
  const { runId, workspaceId, messageId, conversationId, cancelReason, request } = run;
  return { runId, workspaceId, messageId, conversationId, cancelReason, request, principalId: run.principalId, message: { runStatus: run.message.runStatus } };
}

/** Await the site's existing readiness; bootstrap never initializes providers, settings or stores.
 * @complexity O(1), fixed readiness promises and one already-seeded owner identity. */
async function bootstrapSnapshot({ deps }: { deps: CoreDeps }): Promise<unknown> {
  await Promise.all([deps.settingsUiTabsReady, deps.siteTitleReady]);
  return { workspaceId: deps.workspaceId, ownerPrincipalId: await deps.ownerPrincipalId,
    siteBinding: deps.siteBinding, siteStoragePaths: deps.siteStoragePaths,
    traceEnabled: deps.aiTraceSink !== undefined, traceCapture: deps.aiTraceSink?.capture ?? "metadata" };
}

/** Read a retained setting in the server's own workspace, preserving fresh ledger semantics.
 * @complexity O(1), fixed readiness and the existing effective-setting resolution. */
async function readSetting({ deps, input }: { deps: CoreDeps; input: Extract<DaemonCoreRequest, { operation: "getEffective" }>["input"] }): Promise<unknown> {
  if (input.scopeContext.workspaceId !== deps.workspaceId) throw new DaemonCoreError({ reason: "foreign settings workspace" });
  await Promise.all([deps.settingsUiTabsReady, deps.siteTitleReady]);
  return deps.getEffective({ repo: deps.settingsRepo }, input);
}
