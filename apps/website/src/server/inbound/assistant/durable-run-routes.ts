import {
  redactAdminRunContextRef,
  type ChatRunLedger,
  type DurableRunStore,
  UNKNOWN_MUTATION_ERROR,
  RUN_PRINCIPAL_HEADER,
} from "#src/assistant/session-services";
import type { Express } from "express";
import type { RunStartHandler } from "@jini-ai/daemon/http";

type Lifecycle = Parameters<RunStartHandler>[0]["lifecycle"];

/** Always precedes run routes, including starts that have no durable chat binding. */
export function registerCredentialRunIntake({ app }: { app: Express }, _optional = {}): void {
  app.post("/api/runs", (req, res, next) => {
    const body = (req.body ?? {}) as { contextRef?: unknown };
    // This route precedes the ordinary daemon route too, so headless starts use the same guard.
    if (typeof body.contextRef === "string") {
      try { body.contextRef = redactAdminRunContextRef({ contextRef: body.contextRef }, {}); }
      catch { res.status(400).json({ error: "The run context must be a JSON object.", code: "VALIDATION_ERROR" }); return; }
    }
    next();
  });
}

/** Tovu chooses the attempt id before dispatch. The published daemon lifecycle already accepts
 * runId; this host route exposes it only for an authenticated, persisted staff-chat binding. */
export function registerDurableRunStartRoute(
  { app, lifecycle, onStarted, store }: { app: Express; lifecycle: Lifecycle; onStarted: RunStartHandler; store: DurableRunStore }, _optional = {},
): void {
  app.post("/api/runs", (req, res, next) => {
    const body = (req.body ?? {}) as { runId?: unknown; contextRef?: unknown; agentId?: string };
    if (typeof body.runId !== "string") { next(); return; }
    void start({ runId: body.runId }, {}).catch(next);
    async function start({ runId }: { runId: string }, _options = {}) {
      const run = await store.find({ runId, principalId: req.get(RUN_PRINCIPAL_HEADER) ?? "" }, {});
      if (!run || run.cancelReason || !["queued", "running"].includes(run.message.runStatus ?? "")) {
        res.status(409).json({ error: "This execution attempt no longer owns the answer.", code: "STALE_RUN_ATTEMPT" }); return;
      }
      const request = { contextRef: typeof body.contextRef === "string" ? body.contextRef : run.request.contextRef, agentId: run.request.agentId, idempotencyKey: runId };
      const started = await lifecycle.start({ contextRef: request.contextRef }, { ...request, runId });
      if (started.started) await onStarted({ request, run: started.run, lifecycle });
      res.status(201).json({ run: (await lifecycle.get({ runId })) ?? started.run, started: started.started });
    }
  });
}

/** Only delegated mutations have this guarantee; runtimes' private shells do not pass through
 * this gateway. Registered tools without read-only metadata fail closed as potentially mutating.
 * Unregistered ids reach the daemon's not-found response without creating mutation orphans. */
export function registerDurableToolGuard(
  { app, ledger, isRegistered, isReadOnly, messageIdForAttempt }: { app: Express; ledger: ChatRunLedger;
    isRegistered: (required: { toolId: string }, optional: {}) => boolean; isReadOnly: (required: { toolId: string }, optional: {}) => boolean;
    messageIdForAttempt: (required: { runId: string }, optional: {}) => Promise<string | null> }, _optional = {},
): void {
  app.post("/api/delegated-tool-calls", (req, res, next) => {
    const body = (req.body ?? {}) as { runId?: unknown; toolId?: unknown; input?: unknown; toolUseId?: string; requireReadOnly?: unknown };
    if (typeof body.runId !== "string" || typeof body.toolId !== "string") { next(); return; }
    const { runId, toolId, input, toolUseId } = body;
    // An absent handler cannot mutate; ledgering it would turn a routing error into an unknown outcome.
    if (!isRegistered({ toolId }, {})) { next(); return; }
    const store = ledger.durable;
    if (!store) { next(); return; }
    // The daemon either verifies a constrained call is read-only or refuses it before execution.
    // Ledgering a refusal would leave an orphan that blocks the advised unrestricted retry.
    const readOnly = body.requireReadOnly === true || isReadOnly({ toolId }, {});
    void guard({ runId, toolId, input, toolUseId }, {}).then((outcome) => {
      if (outcome === "allowed") {
        if (toolUseId && !readOnly) captureCompletedToolResponse({ res, store, runId, toolUseId }, {});
        next(); return;
      }
      const unknown = outcome === "unknown";
      res.status(409).json({ error: { code: unknown ? "TOOL_OUTCOME_UNKNOWN" : "STALE_RUN_ATTEMPT",
        message: unknown ? UNKNOWN_MUTATION_ERROR : "This execution attempt no longer owns the answer." } });
    }).catch(next);
    async function guard(required: { runId: string; toolId: string; input: unknown; toolUseId?: string }, _options = {}) {
      const run = await store!.find({ runId: required.runId }, {});
      // Non-chat clients retain their existing lifecycle-owned execution policy.
      if (!run) {
        return await messageIdForAttempt({ runId: required.runId }, {}) ? "stale" : "allowed";
      }
      if (run.cancelReason || !["queued", "running"].includes(run.message.runStatus ?? "")) return "stale";
      if (readOnly) return "allowed";
      return store!.guardTool(required, {});
    }
  });
}

function captureCompletedToolResponse(
  { res, store, runId, toolUseId }: { res: import("express").Response; store: DurableRunStore; runId: string; toolUseId: string }, _optional = {},
): void {
  const send = res.json.bind(res);
  res.json = (body: unknown) => {
    const result = (body as { result?: { status?: string; output?: unknown } })?.result;
    if (result?.status !== "completed") return send(body);
    // Do not publish a successful mutation before its result is saved. The normal checkpoint
    // still folds the richer bridge event; this barrier only closes the crash-before-checkpoint gap.
    void store.completeTool({ runId, toolUseId, content: JSON.stringify(result.output) ?? "null" }, {})
      .then(() => send(body), () => { res.status(503); send({ error: { code: "TOOL_OUTCOME_UNKNOWN", message: UNKNOWN_MUTATION_ERROR } }); });
    return res;
  };
}
