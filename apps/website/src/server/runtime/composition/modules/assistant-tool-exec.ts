/**
 * @file The server end of the agent daemon's tool RPC (ADR-070, memory-savings plan §2.3-§2.4): the
 * daemon keeps the run, this process runs the site tools. `POST /internal/tool-executions` and
 * `GET /internal/tool-catalog` (Jini's `registerToolExecutionRoutes`) sit on the BYOK tool surface's
 * own executor, so a daemon call is gated, approved, audited and recovered exactly as a BYOK call is.
 *
 * Also here: the daemon-call adapters the BYOK module composes into that surface, each a no-op
 * outside a daemon call so BYOK turns behave as before — the three chat-attachment tools (over the
 * daemon-owned attachment store, through its lookup route), the plugin-install attachment reader,
 * and native approval memory keyed to the daemon's conversation.
 */
import { stat, readFile } from "node:fs/promises";
import { json, type Response } from "express";
import { z } from "zod";
import type { RequestHandler } from "express";
import type { RememberedApprovalPort, ToolRegistration } from "@jini-ai/core";
import type { Clock } from "@jini-ai/core/primitives";
import { MAX_DOCUMENT_BYTES } from "@jini-ai/cms/media";
import { createRemoteAttachmentLookup, registerToolExecutionRoutes, requireToolExecutionCaller, type AttachmentLookup, type ToolExecutionRouteTarget } from "@jini-ai/daemon/http";
import type { AdminChartProviderSnapshot } from "#src/contracts/headless/index";
import type { ByokToolSurface } from "#src/assistant/index";
import type { DurableRunHead, DurableRunStore } from "#src/assistant/durable-runs/ports";
import { durableAttemptOwnsAnswer } from "#src/server/inbound/assistant/run-start-decisions";
import { AGENT_DAEMON_TOKEN_ENV_VAR, TOOL_EXEC_TOKEN_ENV_VAR, currentToolExecToken } from "#src/assistant/daemon-access";
import { parseDaemonCallContext, readDaemonCallContext, runWithDaemonCallContext } from "#src/assistant/daemon-call-context";
import type { ConversationToolApprovalStore } from "#src/assistant/external-mcp-tool-approval-ports";
import { createNativeApprovalMemory } from "#src/contracts/core/native-approval-memory";
import { buildLibrarySaveAttachmentTool } from "#src/features/media/library-save-attachment";
import { buildPromoteChatAttachmentTool } from "#src/features/media/promote-chat-attachment";
import { buildListPendingChatAttachmentsTool } from "#src/features/media/list-pending-chat-attachments";
import { createDocumentArchiveReader } from "#src/features/media/document-archive";
import type { InstallAttachmentReader } from '#src/contracts/headless/index';
import { getAgentDaemonUrl } from "../../lifecycle/agent-daemon-port.js";
import { createPluginInstallAttachmentReader } from "../plugin-install-attachment-reader.js";
import { parseRunStartContextRef } from "#src/assistant/run-start-context";
import type { AutomaticPluginRun, createAutomaticPluginRuns } from "#src/features/agent-plugins/automatic-agent-plugins";
import { fetchTextWithTimeout } from "@jini-ai/platform/fetch-with-timeout";

/** Publish one site-prepared consent/state event through the daemon's existing credential gate.
 * No stream or retries: the daemon owns the log, the server owns plugin decisions. A failed
 * delivery propagates to the controller; credentials and payloads are never logged.
 * @complexity O(payload bytes), bounded to 1 MiB with a five-second transport deadline.
 * @example await publishDaemonPluginEvent({ runId, principalId, payload });
 */
export async function publishDaemonPluginEvent(required: { runId: string; principalId: string; payload: Record<string, unknown> }, _options = {}): Promise<void> {
  const token = process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
  if (!token) throw new Error("daemon plugin event delivery is unavailable");
  const body = JSON.stringify(required);
  if (Buffer.byteLength(body) > 1024 * 1024) throw new Error("plugin event is too large");
  const { response } = await fetchTextWithTimeout({ url: new URL("/internal/agent-plugin-events", getAgentDaemonUrl()), timeoutMs: 5_000,
    init: { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body, redirect: "error" } }, { maxResponseBytes: 1024 });
  if (!response.ok) throw new Error("daemon plugin event delivery was refused");
}

type PluginPreflightPorts = {
  controller: Pick<ReturnType<typeof createAutomaticPluginRuns>, "start" | "forget">;
  pinnedPrefix: (required: { pluginRefIds: readonly string[] }) => Promise<string | null>;
  emit: (required: { runId: string; principalId: string; payload: Record<string, unknown> }) => Promise<void>;
  refusalPrefix: () => string;
};

type ComponentCatalogDeps = {
  runStore: Pick<DurableRunStore, "find"> | undefined; workspaceId: string;
  plugins?: PluginPreflightPorts;
  components?: { pluginRuntimeReady: Promise<void>; siteTitleReady: Promise<void>;
    chartProviderSnapshot?: (required: Record<string, never>) => Promise<AdminChartProviderSnapshot> };
};

/**
 * Mounts the tool RPC on `router`, which `app.ts` mounts ahead of the public JSON parser (the route
 * gates on token + loopback, then parses its own 16 MiB body). The token is read per request from
 * module memory (`currentToolExecToken`), never from `process.env`.
 * @complexity O(1) setup.
 */
export function registerAssistantToolExecRoutes({ router, toolSurface, runStore, workspaceId, components, plugins }: {
  router: ToolExecutionRouteTarget; toolSurface: Pick<ByokToolSurface, "daemonCalls">;
} & ComponentCatalogDeps, _optional = {}): void {
  const tokenEnv: NodeJS.ProcessEnv = { get [TOOL_EXEC_TOKEN_ENV_VAR]() { return currentToolExecToken(); } };
  registerToolExecutionRoutes({ app: router, executor: toolSurface.daemonCalls.executor, listToolsFor: toolSurface.daemonCalls.listToolsFor }, {
    tokenEnvVar: TOOL_EXEC_TOKEN_ENV_VAR,
    env: tokenEnv,
    authorizeRun: requireSiteToolRun({ runStore, workspaceId, plugins }),
    runWithContext: ({ context, fn }) => runWithDaemonCallContext({ context: parseDaemonCallContext({ value: context }), fn }),
  });
  // Same private caller gate as execution; never mounted through browser-auth routes.
  router.get("/internal/component-catalog", requireToolExecutionCaller({}, { tokenEnvVar: TOOL_EXEC_TOKEN_ENV_VAR, env: tokenEnv }),
    componentCatalogHandler({ runStore, workspaceId, plugins, ...(components ? { components } : {}) }));
  router.post("/internal/agent-plugin-preflight", requireToolExecutionCaller({}, { tokenEnvVar: TOOL_EXEC_TOKEN_ENV_VAR, env: tokenEnv }),
    json({ limit: "1kb" }), agentPluginPreflightHandler({ runStore, workspaceId, plugins }));
}

const preflightBody = z.object({ runId: z.string().min(1) }).strict();

/** One preflight request, never a run-lifetime stream. Identity and prompt state come only from
 * the accepted site attempt. The existing controller keeps consent for subsequent tool calls;
 * short server-to-daemon callbacks append its surfaces to the daemon-owned log.
 * @complexity Indexed run lookups across awaits; plugin discovery belongs to the injected owner.
 */
function agentPluginPreflightHandler(deps: ComponentCatalogDeps, _options = {}): RequestHandler {
  return (req, res, next) => {
    const body = preflightBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "only runId is accepted" }); return; }
    void prepareSitePluginRun({ ...deps, runId: body.data.runId, res }).catch(next);
  };
}

/** Validate ownership across pinned and automatic preparation. The response has no executable
 * registrations and cannot retain an open event stream. O(1) lookups plus plugin-owner work. */
async function prepareSitePluginRun({ runStore, workspaceId, plugins, runId, res }: ComponentCatalogDeps & {
  runId: string; res: Response;
}, _options = {}): Promise<void> {
  const refuse = () => { res.status(404).json({ error: "a live site run is required" }); };
  if (!runStore) { refuse(); return; }
  const lookup = () => findLiveSiteToolRun({ runId, runStore, workspaceId, plugins });
  const run = await lookup();
  if (!run?.principalId) { refuse(); return; }
  if (!plugins) { res.status(503).json({ error: "plugin preflight is unavailable" }); return; }
  const parsed = JSON.parse(run.request.contextRef) as Record<string, unknown>;
  const context = parseRunStartContextRef(JSON.stringify({ ...parsed, principalId: run.principalId }));
  const pinnedPrefix = await plugins.pinnedPrefix({ pluginRefIds: context.pluginRefIds });
  if (!(await lookup())) { refuse(); return; }
  const prefix = await prepareAutomaticSitePlugins({ run: { ...run, principalId: run.principalId }, context, pinnedPrefix, plugins, res, lookup });
  if (!(await lookup())) { refuse(); return; }
  res.status(200).set("cache-control", "no-store").json({ prefix, refusalPrefix: plugins.refusalPrefix() });
}

/** Bind the existing controller to durable identity and a log emitter that rechecks liveness.
 * Pinned failures remain explicit; automatic guidance preserves its existing fail-open contract.
 * @complexity One controller start, indexed checks per emitted event; O(prefix bytes) space.
 */
async function prepareAutomaticSitePlugins({ run, context, pinnedPrefix, plugins, res, lookup }: {
  run: DurableRunHead & { principalId: string }; context: ReturnType<typeof parseRunStartContextRef>;
  pinnedPrefix: string | null; plugins: PluginPreflightPorts; res: Response;
  lookup: () => Promise<DurableRunHead | undefined>;
}, _options = {}): Promise<string | null> {
  if (pinnedPrefix === null) return null;
  const runId = run.runId;
  const abort = new AbortController();
  // A dropped preparation request releases this attempt. Durable pending answers can still
  // rejoin their logical turn. Normal response completion leaves the controller live for tools.
  res.once("close", () => {
    if (res.writableEnded) return;
    abort.abort();
    plugins.controller.forget({ runId }, { preservePending: true });
  });
  const emit = async (payload: Record<string, unknown>) => {
    if (await lookup()) await plugins.emit({ runId, principalId: run.principalId, payload });
  };
  const pluginContext: AutomaticPluginRun = {
    principal: { id: run.principalId }, conversationId: run.conversationId, state: context.agentPluginState,
    query: context.userPrompt ?? context.prompt, pinned: context.pluginRefIds, signal: abort.signal,
    emitSurface: emission => emit({ ...emission.payload, type: emission.channel,
      ...(emission.channel === "mcp-ui" ? { toolUseId: `agent-plugins:${runId}` } : {}) }),
    publish: value => emit({ type: "agent_plugins", ...value }),
  };
  try {
    const automaticPrefix = await plugins.controller.start({ runId, messageId: run.messageId, context: pluginContext });
    return [pinnedPrefix, automaticPrefix].filter(Boolean).join("\n\n");
  } catch { console.warn("[agent-plugins] automatic preflight unavailable"); return pinnedPrefix; }
}

/** Read metadata only after readiness, checking the live attempt across asynchronous boundaries.
 * Missing/foreign/terminal runs are indistinguishable (404); no principal is accepted on the wire.
 * @complexity Three indexed lookups and O(p + k) projection for p providers and k kinds; no cache.
 */
function componentCatalogHandler({ runStore, workspaceId, components, plugins }: ComponentCatalogDeps, _optional = {}): RequestHandler {
  return (req, res, next) => {
    const runId = req.query.runId;
    const refuse = () => { res.status(404).json({ error: { code: "NOT_FOUND", message: "a live site run is required" } }); };
    if (typeof runId !== "string" || !runId || req.query.principalId !== undefined || !runStore) { refuse(); return; }
    void (async () => {
      if (!(await findLiveSiteToolRun({ runId, runStore, workspaceId, plugins }))) { refuse(); return; }
      if (!components?.chartProviderSnapshot) { res.status(503).json({ error: "component catalog is unavailable", code: "COMPONENT_CATALOG_UNAVAILABLE" }); return; }
      await Promise.all([components.pluginRuntimeReady, components.siteTitleReady]);
      if (!(await findLiveSiteToolRun({ runId, runStore, workspaceId, plugins }))) { refuse(); return; }
      const snapshot = await components.chartProviderSnapshot({});
      if (!(await findLiveSiteToolRun({ runId, runStore, workspaceId, plugins }))) { refuse(); return; }
      // res.json would let Express add an ETag and turn a later request into a stale 304.
      res.status(200).setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify({ snapshot: { generation: snapshot.generation, siteProvider: snapshot.siteProvider,
        providers: snapshot.providers.map(({ id, kinds, javascript, stylesheet }) => ({ id, kinds, javascript,
          ...(stylesheet === undefined ? {} : { stylesheet }) })),
      } }));
    })().catch(next);
  };
}

/** Shared authority for execution and both catalogs. The stored live attempt supplies identity;
 * a supplied principal only constrains it. Missing, foreign and terminal records fail closed.
 * @complexity One indexed lookup and O(1) extra space. Storage failures propagate to the route.
 * @example const run = await findLiveSiteToolRun({ runId, runStore, workspaceId });
 */
export async function findLiveSiteToolRun({ runId, runStore, workspaceId, principalId, plugins }: {
  runId: string; runStore: Pick<DurableRunStore, "find">; workspaceId: string; principalId?: string;
  plugins?: Pick<PluginPreflightPorts, "controller">;
}, _optional = {}): Promise<DurableRunHead | undefined> {
  const run = await runStore.find({ runId }, {});
  if (!durableAttemptOwnsAnswer({ attempt: run }) || run?.runId !== runId || run.workspaceId !== workspaceId) {
    plugins?.controller.forget({ runId }, { preservePending: true });
    return undefined;
  }
  return principalId === undefined || run.principalId === principalId ? run : undefined;
}

/** Binds both RPC routes to this site's current answer attempt. Wire identity and roles confer no
 * authority; only the stored principal is forwarded. A read-only request may still attenuate it.
 * Missing storage fails closed. One indexed lookup per request; O(1) extra space. */
function requireSiteToolRun({ runStore, workspaceId, plugins }: {
  runStore: Pick<DurableRunStore, "find"> | undefined; workspaceId: string;
  plugins?: PluginPreflightPorts;
}, _optional = {}): RequestHandler {
  return (req, res, next) => {
    const body = req.body as { run?: { id?: unknown }; principal?: { id?: unknown; toolAccess?: unknown } } | undefined;
    const execution = req.method === "POST";
    const runId = execution ? body?.run?.id : req.query.runId;
    const principalId = execution ? body?.principal?.id : req.query.principalId;
    const refuse = () => { res.status(403).json({ error: { code: "FORBIDDEN", message: "a live site run with its recorded principal is required" } }); };
    if (!runStore || typeof runId !== "string" || typeof principalId !== "string") { refuse(); return; }
    void findLiveSiteToolRun({ runStore, runId, workspaceId, principalId, plugins }).then((run) => {
      if (!run) { refuse(); return; }
      if (execution) req.body.principal = { id: run.principalId, ...(body?.principal?.toolAccess === "read-only" ? { toolAccess: "read-only" } : {}) };
      next();
    }).catch(next);
  };
}

/** The daemon's attachment store, reached over its lookup route with the daemon token; `undefined` with no token. */
function defaultDaemonAttachmentLookup(): AttachmentLookup | undefined {
  const token = process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
  return token ? createRemoteAttachmentLookup({ baseUrl: getAgentDaemonUrl(), token }) : undefined;
}

/** The attached refs of the message that started the daemon's run; none outside a daemon call. */
const messageAttachmentRefs = (): readonly string[] => readDaemonCallContext()?.attachmentRefs ?? [];

/**
 * The three chat-attachment tools, mirroring `agent-daemon-server.ts`'s registrations. The store is
 * the daemon's (its sole owner); this process never builds one. Outside a daemon call `getStore`
 * answers `undefined`, which each tool already reports as "not available".
 * @param required.registrations The surface's own registrations; promote reuses `media_upload_asset`'s handler.
 * @param optional.getLookup Test seam; defaults to the daemon's remote lookup.
 * @complexity O(registrations) to find `media_upload_asset`.
 */
export function buildDaemonAttachmentTools(
  { deps, registrations }: { deps: Parameters<typeof buildLibrarySaveAttachmentTool>[0]["deps"]; registrations: readonly ToolRegistration[] },
  { getLookup = defaultDaemonAttachmentLookup }: { getLookup?: () => AttachmentLookup | undefined } = {},
): ToolRegistration[] {
  const getStore = (): AttachmentLookup | undefined => (readDaemonCallContext() ? getLookup() : undefined);
  const tools: ToolRegistration[] = [
    buildLibrarySaveAttachmentTool({
      deps, getStore, getMessageAttachmentRefs: messageAttachmentRefs, archiveReader: createDocumentArchiveReader({}),
      readFile: async (path) => {
        // The daemon's resolver already checked this issued path's run and integrity. Bound allocation too:
        // chat accepts larger media than Library documents, and unsaved attachments stay temporary.
        if ((await stat(path)).size > MAX_DOCUMENT_BYTES) throw new Error("document exceeds the 10 MiB limit");
        return readFile(path);
      },
    }),
    buildListPendingChatAttachmentsTool({ getStore, getMessageAttachmentRefs: messageAttachmentRefs }),
  ];
  const mediaUpload = registrations.find((registration) => registration.descriptor.id === "media_upload_asset");
  if (mediaUpload) tools.push(buildPromoteChatAttachmentTool({ getStore, mediaUploadHandler: mediaUpload.handler, readFile }));
  return tools;
}

/**
 * Plugin-install attachments: in a daemon call only the run's own message refs are readable (as the
 * daemon's reader binds them); otherwise BYOK's owner-scoped reader, unchanged.
 */
export function createDaemonAwareInstallAttachmentReader({ uploadDirectory }: { uploadDirectory: string }, _optional = {}): InstallAttachmentReader {
  const daemon = createPluginInstallAttachmentReader({}, { uploadDirectory, getMessageAttachmentRefs: messageAttachmentRefs });
  const byok = createPluginInstallAttachmentReader({}, { uploadDirectory });
  return (input, options) => (readDaemonCallContext() ? daemon : byok)(input, options);
}

/**
 * Native approval memory keyed to the daemon's conversation. A BYOK turn has none, so outside a
 * daemon call nothing is remembered (`has` → false, `grant` → no-op) — exactly as with no memory
 * bound; binding the real one there would fail every "yes" with NATIVE_APPROVAL_CONVERSATION_REQUIRED.
 */
export function createDaemonApprovalMemory({ store, workspaceId, clock }: { store: ConversationToolApprovalStore; workspaceId: string; clock: Clock }, _optional = {}): RememberedApprovalPort {
  const inner = createNativeApprovalMemory({ store, workspaceId, clock, conversationIdForRun: () => readDaemonCallContext()?.conversationId });
  return {
    has: async (input) => (readDaemonCallContext() ? inner.has(input) : false),
    grant: async (input) => { if (readDaemonCallContext()) await inner.grant(input); },
  };
}
