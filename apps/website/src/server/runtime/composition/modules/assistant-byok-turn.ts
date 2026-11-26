import type { ErrorReporter } from "@jini-ai/core/errors/reporter";
import type { ToolAccessRun } from "@jini-ai/daemon";
import { admittedToolSources } from "@jini-ai/daemon";
import type { Request, Response } from "express";
import type { Principal, SurfaceEmission, SurfaceEmitter } from "@jini-ai/core";
import type { ExecutionCredentialPort, ResolvedProviderCredential as ResolvedByokCredential } from "@jini-ai/agent-runtime/providers/credentials";
import { providerTurnAdapters, runProviderToolTurn, type ProviderChatMessage, type ProviderToolExecutor, type ProviderToolTurnInput, type ProviderToolTurnOptions, type ProviderToolTurnResult, type ProviderTurnEvent } from "@jini-ai/agent-runtime/providers/tool-turn";
import type { ByokToolSurface, ByokToolSurfaceDeps } from "#src/assistant/index";
import type { RouteDeps } from "#src/server/routes/types";
import type { AgentRunStatus, AgentRunTrackingOutcome } from "@jini-ai/core/contracts/observability";
import type { TrackerSpan } from "@jini-ai/core/contracts/site/diagnostics-observability";
import { redactedTovuError } from "@tovu/contracts/diagnostics-redaction";
import type { createAutomaticPluginRuns } from "#src/features/agent-plugins/automatic-agent-plugins";
import { createAiTraceRecorder } from "@jini-ai/core/contracts/ai-trace";
import { readChatAgentPluginState } from "@jini-ai/agent-plugins/lifecycle";
import { resolveAgentPluginRefs } from "#src/features/agent-plugins/lifecycle";
import { translateRetiredPluginRefs } from "#src/features/agent-plugins/bundled-catalog";
import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { randomUUID } from "node:crypto";
import { createByokRunUsage } from "./assistant-byok-run-usage.js";
import { prepareByokTurnSetup } from "./assistant-byok-preflight.js";

/** Raises the bound each `run*ToolTurn` adapter would otherwise take from its own
 *  `DEFAULT_MAX_TOOL_TURNS` (8 — verified directly in all four of `@jini-ai/agent-runtime`'s
 *  `providers/{anthropic-messages,openai-chat,azure-chat,google-messages}.ts`, each of which reads
 *  `options.maxToolTurns ?? DEFAULT_MAX_TOOL_TURNS`). 8 is sized for a caller that names a real tool
 *  per action; this route's meta-tool surface costs up to 3 calls per real action
 *  (`search_tools` → `describe_tool` → `execute_delegated_tool`), so 8 truncates an ordinary
 *  multi-step task at roughly its second or third real operation — silently, because a truncated
 *  turn is reported to the client as an ordinary stop. 24 keeps ~6-8 real actions in reach at that
 *  3-calls-each cost. */
const BYOK_MAX_TOOL_TURNS = 24;

/** SSE framing. Local to this module, same convention (and same reason: kept in one place so event
 *  names cannot drift between branches) as `site-assistant.ts`'s identical helper — not shared
 *  cross-module because both are a few lines and neither has a second real caller yet. */
export function sse({ res, event, data }: { res: Response; event: string; data: unknown }, _optional = {}): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function beginStream(req: Request, res: Response): void {
  res.status(200).set({
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    // Same reasoning as `site-assistant.ts`'s identical guard: HTTP/2 throws
    // `ERR_HTTP2_INVALID_CONNECTION_HEADER` on a `connection` header, and dropping it changes
    // nothing observable for an HTTP/1.1 client (keep-alive is already its default there).
    ...(req.httpVersionMajor < 2 ? { connection: "keep-alive" } : {}),
    "x-accel-buffering": "no",
  });
  res.flushHeaders?.();
}

/**
 * Transforms one `SurfaceEmission` into the bare `RunAgentPayload`-shaped object this route's own
 * `sse(res, "agent", ...)` writes onto the wire.
 *
 * Mirrors `@jini-ai/daemon`'s `delegated-tool-bridge.ts` `emitSurface` closure byte-for-byte (traced
 * directly, not inferred): `emission.channel` becomes the payload's `type`, `emission.payload`'s own
 * fields are spread in beside it (after stripping any `type`/`toolUseId` a handler tried to smuggle
 * in, so a handler cannot forge either), and `toolUseId` is injected only for the `'mcp-ui'` channel —
 * the one channel whose client-side renderer (`McpUiSurfaceCard`) actually reads it for correlation.
 * This is what lets `apps/admin/src/lib/assistant-transport.ts`'s already-shipped
 * `translateRunAgentPayload` switch render a BYOK-mode surface exactly like a daemon-mode one, with no
 * new frontend branching — see this module's own header for the full trace.
 *
 * Verified end-to-end for `'mcp-ui'` only (`assistant-byok-routes.test.ts`), the one channel a real
 * catalog tool (`content_post_delete`) uses today. Kept channel-agnostic, like its daemon
 * counterpart, so a future channel is not silently dropped — but an untested channel inherits that
 * counterpart's own disclosed scope, not a new guarantee this function makes.
 *
 * @complexity O(k) in `emission.payload`'s own key count.
 * @overallScore 100
 */
export function toWireSurfacePayload({ emission, toolUseId }: { emission: SurfaceEmission; toolUseId: string }, _optional = {}): Record<string, unknown> {
  const safePayload: Record<string, unknown> = { ...emission.payload };
  delete safePayload.type;
  delete safePayload.toolUseId;
  return {
    ...safePayload,
    type: emission.channel,
    ...(emission.channel === "mcp-ui" ? { toolUseId } : {}),
  };
}

/**
 * How a BYOK turn ended, for its agent-run span. An abort (the browser went away) is `canceled`
 * whatever else happened; a throw is `failed` with that error. Provider adapters report their own
 * failures (an HTTP error, a blocked prompt, a bad baseUrl) as an `error` event and still resolve, so
 * a turn that resolved after reporting one is `failed` too: resolving alone is not success.
 * @complexity O(1), pure.
 */
export function byokTurnOutcome(
  { aborted, reportedError }: { aborted: boolean; reportedError: boolean },
  { thrown }: { thrown?: { error: unknown } } = {},
): { status: AgentRunStatus; error?: unknown } {
  if (aborted) return { status: "canceled" };
  if (thrown) return { status: "failed", error: thrown.error };
  return { status: reportedError ? "failed" : "succeeded" };
}

/**
 * Stamps each provider `usage` event with the wall time since the previous one (the first since
 * `startedAt`). Provider adapters report tokens only, and the chat's "Done · 16s" line needs a
 * `durationMs` (it shows nothing without time or cost); the client sums a turn's usage events, so
 * per-event deltas add up to the turn's elapsed time however many usage frames a provider streams.
 * No `costUsd`: there is no pricing table and the chat never estimates money from tokens.
 * @complexity O(1) per event; holds one timestamp.
 */
export function createByokUsageTimer(
  { startedAt }: { startedAt: number },
  { now = Date.now }: { now?: () => number } = {},
): (event: ProviderTurnEvent) => ProviderTurnEvent & { durationMs?: number } {
  let mark = startedAt;
  return (event) => {
    if (event.type !== "usage") return event;
    const at = now();
    const durationMs = Math.max(0, at - mark);
    mark = at;
    return { ...event, durationMs };
  };
}

/** BYOK bypasses the daemon lifecycle, but publishes the same normalized model/tool events.
 * Reuse its recorder so both execution modes report generations with the same semantics. */
function startByokTrace(
  { routeDeps, run, credential, messages }: { routeDeps: Pick<RouteDeps, "aiTraceSink">; run: { id: string }; credential: ResolvedByokCredential; messages: ProviderChatMessage[] },
  _optional = {},
) {
  const trace = routeDeps.aiTraceSink ? createAiTraceRecorder({ sink: routeDeps.aiTraceSink, runId: run.id, agentId: credential.protocol },
    { provider: credential.protocol, model: credential.model, exactSecrets: [credential.apiKey] }) : undefined;
  trace?.start(routeDeps.aiTraceSink?.capture === "full" ? { input: messages.at(-1)?.content ?? null } : {});
  return trace;
}

function byokTraceOutcome({ aborted, reportedError }: { aborted: boolean; reportedError: boolean }, _optional = {}): "cancelled" | "failed" | "succeeded" {
  const { status } = byokTurnOutcome({ aborted, reportedError });
  if (status === "canceled") return "cancelled";
  return status === "succeeded" ? "succeeded" : "failed";
}

export interface LiveByokToolRun extends ToolAccessRun {
  serverIds: readonly string[]; pluginIds: readonly string[];
  readonly abort: AbortController; readonly done: Promise<void>; lowered: boolean; readonly res: Response;
}

/** Retain every source this dynamic BYOK catalog admitted, including sources later withdrawn.
 * @complexity O(admitted source IDs), memory only; no configuration or network reads. */
export function rememberByokSources(run: LiveByokToolRun, sources: ReturnType<typeof admittedToolSources>): void {
  run.serverIds = [...new Set([...run.serverIds, ...sources.serverIds])];
  run.pluginIds = [...new Set([...run.pluginIds, ...sources.pluginIds])];
}

/** Access revocation is an owner's Stop even when a provider reports its aborted socket as error. */
function endByokResponse({ res, lowered, reason }: { res: Response; lowered: boolean; reason: string }): void {
  sse({ res, event: 'end', data: { reason: lowered ? 'stop' : reason } });
  res.end();
}

/** Preserve partial answer text and the access-change status emitted through the existing stream. */
function endFailedByokResponse({ res, error, lowered }: { res: Response; error: unknown; lowered: boolean }): void {
  if (!lowered) sse({ res, event: 'error', data: { type: 'error', message: error instanceof Error ? error.message : String(error) } });
  endByokResponse({ res, lowered, reason: 'error' });
}

export type ByokTurnContext = {
  reporter: ErrorReporter;
  routeDeps: RouteDeps & ByokToolSurfaceDeps;
  resolvedToolSurface: ByokToolSurface;
  automaticPluginRuns: ReturnType<typeof createAutomaticPluginRuns>;
  credentialPort: ExecutionCredentialPort;
  liveToolRuns: Map<string, LiveByokToolRun>;
};

/** Loads explicit picks independently, so one unavailable plugin cannot discard the others.
   * Returns the ordered prompt suffix and whether any pick failed; failures never escape.
   * @complexity One sequential lifecycle resolution per pinned reference; O(guidance bytes) space. */
async function loadPinnedPluginGuidance({ pinned }: { pinned: string[] }, routeDeps: RouteDeps): Promise<{ prefix: string; skippedPinned: boolean }> {
    let skippedPinned = false;
    let prefix = "";
    for (const pluginId of pinned) {
      // Explicit attachments bypass relevance matching, but a failed attachment must not end a run
      // or discard guidance from the other picks. The lifecycle still enforces activation and trust.
      try {
        const resolved = await resolveAgentPluginRefs({ pluginRefIds: [pluginId], workspaceLayout: routeDeps.agentPluginLayout.forWorkspace({ workspaceId: routeDeps.workspaceId }) }, { deliveryMode: 'inject' });
        if (resolved.ok) prefix += `\n\n${resolved.promptPrefix}`;
        else skippedPinned = true;
      } catch { skippedPinned = true; }
    }
    return { prefix, skippedPinned };
  }

/** Starts the existing automatic plugin lifecycle and appends its guidance; failure leaves the prompt intact.
   * Emits consent/usage surfaces through this turn's response and logs a preflight failure.
   * @complexity One automatic-use preparation; candidate discovery/ranking belongs to that owner. */
async function appendAutomaticPluginGuidance({ run, principal, conversationId, pluginBody, messages, pinned, abort, res, system }: {
    run: { id: string }; principal: Principal; conversationId: string;
    pluginBody: { agentPluginState?: unknown; userPrompt?: unknown }; messages: ProviderChatMessage[];
    pinned: string[]; abort: AbortController; res: Response; system: string;
  }, automaticPluginRuns: ReturnType<typeof createAutomaticPluginRuns>): Promise<string> {
    try {
      const guidance = await automaticPluginRuns.start({ runId: run.id, context: {
        principal, conversationId, state: readChatAgentPluginState({ value: pluginBody.agentPluginState }),
        query: typeof pluginBody.userPrompt === 'string' ? pluginBody.userPrompt.slice(0, 16000) : messages[messages.length - 1]?.content ?? '', pinned, signal: abort.signal,
        emitSurface: async emission => { sse({ res, event: 'agent', data: toWireSurfacePayload({ emission, toolUseId: `agent-plugins:${run.id}` }) }); },
        publish: async value => { sse({ res, event: 'agent', data: { type: 'agent_plugins', ...value } }); },
      } });
      if (guidance) system += `\n\n${guidance}`;
    } catch (error) { console.warn('[agent-plugins] automatic BYOK preflight unavailable', formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)); }

    return system;
  }

/** Composes pinned and automatic guidance before provider planning; plugin failures remain fail-soft.
   * Registers response-close cleanup and returns the augmented prompt.
   * @complexity O(pinned references + guidance bytes), plus the automatic lifecycle's preparation. */
async function preparePluginGuidance({ req, res, run, principal, messages, abort, system }: {
    req: Request; res: Response; run: { id: string }; principal: Principal; messages: ProviderChatMessage[]; abort: AbortController; system: string;
  }, context: Pick<ByokTurnContext, "routeDeps" | "automaticPluginRuns">): Promise<string> {
    const { routeDeps, automaticPluginRuns } = context;
    // Preflight uses the same catalog/consent/guidance owner as CLI, before the provider plans.
    const pluginBody = (req.body ?? {}) as { conversationId?: unknown; agentPluginState?: unknown; pluginRefIds?: unknown; userPrompt?: unknown };
    const conversationId = typeof pluginBody.conversationId === 'string' ? pluginBody.conversationId : undefined;
    const pinned = Array.isArray(pluginBody.pluginRefIds) ? pluginBody.pluginRefIds.filter((id): id is string => typeof id === 'string') : [];
    const { prefix, skippedPinned } = await loadPinnedPluginGuidance({ pinned }, routeDeps);
    system += prefix;
    if (skippedPinned) sse({ res, event: 'agent', data: { type: 'status', label: 'Some selected Agent Plugins could not be loaded and were skipped.' } });
    res.on('close', () => automaticPluginRuns.forget({ runId: run.id }));
    if (!conversationId) return system;
    return appendAutomaticPluginGuidance({ run, principal, conversationId, pluginBody, messages, pinned, abort, res, system }, automaticPluginRuns);
  }


/** Arms this turn's abort before its first await and reports a response that closed before entry,
 * since an already-closed response emits no further `close`. The same controller later reaches the
 * provider and every tool call. `release` detaches the listener.
 * @complexity O(1); one close listener, removed by `release`; no I/O. */
function bindTurnAbort({ res }: { res: Response }, _optional = {}): { abort: AbortController; release: () => void } {
  // Same reasoning as `site-assistant.ts`'s identical guard: a browser tab closing must stop the
  // upstream provider call and any in-flight tool execution, not run to completion unobserved.
  const abort = new AbortController();
  const onClose = () => { if (!res.writableEnded) abort.abort(); };
  res.once("close", onClose);
  if ((res.destroyed || res.closed) && !res.writableEnded) abort.abort();
  return { abort, release: () => { res.off("close", onClose); } };
}

/** Arms the turn's abort, then prepares and runs it; the close listener is detached on every exit.
 * @complexity O(1) here; the cost is `runWatchedByokTurn`'s. */
export async function handleTurn({ req, res, context }: { req: Request; res: Response; context: ByokTurnContext }, _optional = {}): Promise<void> {
    // Why: awaiting turn preparation (credentials, readiness, federation, prompt) opens a
    // cancellation window before the stream exists. A close listener bound only once streaming
    // starts never fires for a browser that already left, and the turn would then pay a provider
    // for an answer nobody reads. So the abort is armed before credential, attachment or federation
    // I/O, every step re-checks it before starting new work, and the listener is detached on every exit.
    const { abort, release } = bindTurnAbort({ res });
    try { return await runWatchedByokTurn({ req, res, context, abort }); }
    finally { release(); }
  }

/** Opens the stream, registers the live run for access lowering and drives one provider turn with the
 * armed controller. The run's registration and cleanup stay paired in one try/finally; a lowered run
 * ends cleanly, and a Stop during plugin guidance ends the stream before provider dispatch.
 * @complexity O(admitted tools) to snapshot sources, plus plugin preparation and the provider turn. */
async function runWatchedByokTurn({ req, res, context, abort }: {
    req: Request; res: Response; context: ByokTurnContext; abort: AbortController;
  }, _optional = {}): Promise<void> {
    const { routeDeps, resolvedToolSurface, liveToolRuns } = context;
    const setup = await prepareByokTurnSetup({ req, res, context, abort });
    if (!setup) return undefined;
    const { messages, principal, credential } = setup;
    let { system } = setup;

    const run = { id: randomUUID() };

    beginStream(req, res);
    let finishCleanup!: () => void;
    const done = new Promise<void>(resolve => { finishCleanup = resolve; });
    const liveToolRun = { runId: run.id, agentId: `api:${credential.protocol}`, ...admittedToolSources({ tools: resolvedToolSurface.registry.list({}) }), abort, done, lowered: false, res };
    liveToolRuns.set(run.id, liveToolRun);
    try {
      system = await preparePluginGuidance({ req, res, run, principal, messages, abort, system }, context);
      // Plugin guidance is the last await before the paid call; a Stop during it ends here.
      if (abort.signal.aborted) return endByokResponse({ res, lowered: liveToolRun.lowered, reason: 'stop' });

      // Older injected surfaces retain their wrapper contract; production creates one exposure per run.
      const toolRun = resolvedToolSurface.createRun?.({ principal, run });

      const executeTool = createByokToolExecutor({ abort, liveToolRun, resolvedToolSurface, res, toolRun, principal, run });
      return await traceByokTurn({ routeDeps, resolvedToolSurface, run, credential, messages, principal, abort, res, system, liveToolRun, toolRun, executeTool });
    } catch (error) {
      if (!liveToolRun.lowered) throw error;
      return endByokResponse({ res, lowered: true, reason: 'stop' });
    } finally { liveToolRuns.delete(run.id); finishCleanup(); }
  }
      // Starts with the meta-tool set and promotes concrete definitions after describe_tool.
      // The legacy dispatch below is owned by the same surface: `call.name` is one of
      // `search_tools`/`describe_tool`/`execute_delegated_tool`, and a real tool id arrives as the
      // third one's `toolId` argument. The unwrap, the status mapping, and the "model named something
      // that isn't callable" case all live in `byok-tool-surface.ts` beside the descriptors that
      // create them, so the two cannot drift apart. Authorization is unmoved by any of this — see
      // `META_TOOL_DESCRIPTORS`' own doc.
      //
      // `emitSurface` is built fresh per call (not once for the whole turn), because it needs THIS
      // call's own `call.id` as the correlation `toolUseId` a rendered mcp-ui card is tagged with —
      // `runProviderToolTurn`'s adapters invoke `executeTool` once per model-issued tool call, so a new
      // closure per invocation costs nothing a turn with real tool calls wasn't already paying.
function createByokToolExecutor({ abort, liveToolRun, resolvedToolSurface, res, toolRun, principal, run }: {
  abort: AbortController; liveToolRun: LiveByokToolRun; resolvedToolSurface: ByokToolSurface; res: Response;
  toolRun: ReturnType<NonNullable<ByokToolSurface["createRun"]>> | undefined; principal: Principal; run: { id: string };
}, _optional = {}): ProviderToolExecutor {
  return (call: { id: string; name: string; input: unknown }) => {
        abort.signal.throwIfAborted();
        rememberByokSources(liveToolRun, admittedToolSources({ tools: resolvedToolSurface.registry.list({}) }));
        const emitSurface: SurfaceEmitter = async (emission) => {
          sse({ res, event: "agent", data: toWireSurfacePayload({ emission, toolUseId: call.id }) });
        };
        if (toolRun) return toolRun.executeTool(call, { signal: abort.signal, emitSurface });
        return resolvedToolSurface.executeMetaTool({ principal: principal, run: run, call: call }, { signal: abort.signal, emitSurface: emitSurface });
      };
}

function finishFailedTurn({ error, aiTrace, abort, routeDeps, principal, run, span, runUsage, reportedError, reportRunFailure, res, liveToolRun }: {
  error: unknown; aiTrace: ReturnType<typeof startByokTrace>; abort: AbortController; routeDeps: RouteDeps;
  principal: Principal; run: { id: string }; span: TrackerSpan<AgentRunTrackingOutcome>;
  runUsage: ReturnType<typeof createByokRunUsage>; reportedError: boolean; reportRunFailure: (required: { error: unknown }) => void;
  res: Response; liveToolRun: LiveByokToolRun;
}, _optional = {}): void {
          aiTrace?.observe({ type: "error", message: error instanceof Error ? error.message : String(error) });
          aiTrace?.finish({ outcome: abort.signal.aborted ? "cancelled" : "failed" });
          void routeDeps.tracker.capture({ name: "assistant_run_finished", userId: principal.id }, { properties: { chatSurface: "admin", logicalRunId: run.id, outcome: abort.signal.aborted ? "cancelled" : "failed", eventId: `assistant-finish:${run.id}` } });
          span.setOutcome(runUsage.withUsage(byokTurnOutcome({ aborted: abort.signal.aborted, reportedError }, { thrown: { error } })));
          if (!abort.signal.aborted && !reportedError) reportRunFailure({ error });
          endFailedByokResponse({ res, error, lowered: liveToolRun.lowered });
}

// One agent-run span per turn (its own trace root); the turn runs inside it, so its tool calls'
      // DB and outbound spans nest under the run rather than the long-lived request.

function traceByokTurn({ routeDeps, resolvedToolSurface, run, credential, messages, principal, abort, res, system, liveToolRun, toolRun, executeTool }: {
  routeDeps: RouteDeps & ByokToolSurfaceDeps; resolvedToolSurface: ByokToolSurface; run: { id: string };
  credential: ResolvedByokCredential; messages: ProviderChatMessage[]; principal: Principal; abort: AbortController; res: Response; system: string;
  liveToolRun: LiveByokToolRun; toolRun: ReturnType<NonNullable<ByokToolSurface["createRun"]>> | undefined;
  executeTool: ProviderToolExecutor;
}) {
  return routeDeps.tracker.trace({ name: "assistant.run", run: async (span) => {
        const aiTrace = startByokTrace({ routeDeps, run, credential, messages });
        void routeDeps.tracker.capture({ name: "assistant_run_started", userId: principal.id }, { properties: { chatSurface: "admin", logicalRunId: run.id, eventId: `assistant-start:${run.id}` } });
        let reportedError = false;
        // A failed turn (a provider error event or a throw, not an owner's cancel) is an incident for
        // the error tracker too: the protocol and run id only, the key blanked even without a known shape.
        const reportRunFailure = ({ error }: { error: unknown }, _optional = {}) => routeDeps.tracker.error({ error: error instanceof Error ? error : redactedTovuError({ error }) }, { context: { operation: "assistant.run", attributes: { agent: credential.protocol, runId: run.id }, exactSecrets: [credential.apiKey] } });
        const stampUsage = createByokUsageTimer({ startedAt: Date.now() });
        const runUsage = createByokRunUsage();
        let result: ProviderToolTurnResult;
        try {
          result = await runProviderToolTurn(...byokProviderTurnOptions({ credential, system, messages, toolRun, resolvedToolSurface, executeTool, abort,
            // `error`-typed events get their OWN SSE event name, not folded into `agent` — mirrors the
            // daemon path's distinct `source.addEventListener("error", ...)` on the client
            // (`assistant-transport.ts`), which is what actually calls `handlers.onError` rather than
            // rendering an unrecognized `ext` event. Everything else rides `agent` unchanged, reusing
            // `translateRunAgentPayload`'s existing switch on the client with zero new cases.
            
            onEvent: (event: ProviderTurnEvent) => {
              if (liveToolRun.lowered) return;
              aiTrace?.observe(event as unknown as Record<string, unknown>);
              runUsage.observe(event);
              // Reporting a disconnect's AbortError would mark this active span failed despite its canceled outcome.
              if (event.type === "error" && !abort.signal.aborted && !reportedError) { reportedError = true; reportRunFailure({ error: new Error(event.message) }); }
              sse({ res, event: event.type === "error" ? "error" : "agent", data: stampUsage(event) });
            }
          }));
        } catch (error) {
          finishFailedTurn({ error, aiTrace, abort, routeDeps, principal, run, span, runUsage, reportedError, reportRunFailure, res, liveToolRun });
          return;
        }

        span.setOutcome(runUsage.withUsage(byokTurnOutcome({ aborted: abort.signal.aborted, reportedError })));
        aiTrace?.finish({ outcome: byokTraceOutcome({ aborted: abort.signal.aborted, reportedError }) });
        void routeDeps.tracker.capture({ name: "assistant_run_finished", userId: principal.id }, { properties: { chatSurface: "admin", logicalRunId: run.id, outcome: byokTraceOutcome({ aborted: abort.signal.aborted, reportedError }), eventId: `assistant-finish:${run.id}` } });
        endByokResponse({ res, lowered: liveToolRun.lowered, reason: result.stopReason ?? 'stop' });
      } }, { agent: { runId: run.id, agentName: credential.protocol } });
}

function byokProviderTurnOptions({ credential, system, messages, toolRun, resolvedToolSurface, executeTool, abort, onEvent }: {
  credential: ResolvedByokCredential; toolRun: ReturnType<NonNullable<ByokToolSurface["createRun"]>> | undefined;
  resolvedToolSurface: ByokToolSurface; abort: AbortController;
} & Pick<ProviderToolTurnInput, "system" | "messages" | "executeTool" | "onEvent">): [ProviderToolTurnInput, ProviderToolTurnOptions] {
  return [{
            protocol: credential.protocol,
            adapters: providerTurnAdapters,
            apiKey: credential.apiKey,
            model: credential.model,
            system,
            messages,
            // 3 descriptors, not all 131. The full catalog is ~119 KB (~30 k tokens) of `inputSchema`
            // re-sent on EVERY message; the meta-set is under 1 KB and initially reaches the same tools through
            // `search_tools` → `describe_tool` → `execute_delegated_tool`. See `META_TOOL_DESCRIPTORS`.
            tools: toolRun?.getToolSnapshot() ?? resolvedToolSurface.metaTools,
            executeTool,
            // `error`-typed events get their OWN SSE event name, not folded into `agent` — mirrors the
            // daemon path's distinct `source.addEventListener("error", ...)` on the client
            // (`assistant-transport.ts`), which is what actually calls `handlers.onError` rather than
            // rendering an unrecognized `ext` event. Everything else rides `agent` unchanged, reusing
            // `translateRunAgentPayload`'s existing switch on the client with zero new cases.
            onEvent,
          }, {
            ...(credential.baseUrl ? { baseUrl: credential.baseUrl } : {}),
            ...(credential.maxTokens !== undefined ? { maxTokens: credential.maxTokens } : {}),
            maxToolTurns: BYOK_MAX_TOOL_TURNS,
            getToolSnapshot: toolRun?.getToolSnapshot,
            onSchemaFallback: ({ toolId, protocol, reason }) => {
              console.warn("[assistant-byok] tool schema fallback", { toolId, protocol, reason });
            },
            signal: abort.signal,
          }];
}



