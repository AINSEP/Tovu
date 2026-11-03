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
import type { RequestHandler } from "express";
import type { RememberedApprovalPort, ToolRegistration } from "@jini-ai/core";
import type { Clock } from "@jini-ai/core/primitives";
import { MAX_DOCUMENT_BYTES } from "@jini-ai/cms/media";
import { createRemoteAttachmentLookup, registerToolExecutionRoutes, requireToolExecutionCaller, type AttachmentLookup, type ToolExecutionRouteTarget } from "@jini-ai/daemon/http";
import type { AdminChartProviderSnapshot } from "#src/contracts/headless/index";
import type { ByokToolSurface } from "#src/assistant/index";
import type { DurableRunStore } from "#src/assistant/durable-runs/ports";
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

type ComponentCatalogDeps = {
  runStore: Pick<DurableRunStore, "find"> | undefined; workspaceId: string;
  components?: { pluginRuntimeReady: Promise<void>; siteTitleReady: Promise<void>;
    chartProviderSnapshot?: (required: Record<string, never>) => Promise<AdminChartProviderSnapshot> };
};

/**
 * Mounts the tool RPC on `router`, which `app.ts` mounts ahead of the public JSON parser (the route
 * gates on token + loopback, then parses its own 16 MiB body). The token is read per request from
 * module memory (`currentToolExecToken`), never from `process.env`.
 * @complexity O(1) setup.
 */
export function registerAssistantToolExecRoutes({ router, toolSurface, runStore, workspaceId, components }: {
  router: ToolExecutionRouteTarget; toolSurface: Pick<ByokToolSurface, "daemonCalls">;
} & ComponentCatalogDeps, _optional = {}): void {
  const tokenEnv: NodeJS.ProcessEnv = { get [TOOL_EXEC_TOKEN_ENV_VAR]() { return currentToolExecToken(); } };
  registerToolExecutionRoutes({ app: router, executor: toolSurface.daemonCalls.executor, listToolsFor: toolSurface.daemonCalls.listToolsFor }, {
    tokenEnvVar: TOOL_EXEC_TOKEN_ENV_VAR,
    env: tokenEnv,
    authorizeRun: requireSiteToolRun({ runStore, workspaceId }),
    runWithContext: ({ context, fn }) => runWithDaemonCallContext({ context: parseDaemonCallContext({ value: context }), fn }),
  });
  // Same private caller gate as execution; never mounted through browser-auth routes.
  router.get("/internal/component-catalog", requireToolExecutionCaller({}, { tokenEnvVar: TOOL_EXEC_TOKEN_ENV_VAR, env: tokenEnv }),
    componentCatalogHandler({ runStore, workspaceId, ...(components ? { components } : {}) }));
}

/** Read metadata only after readiness, checking the live attempt across asynchronous boundaries.
 * Missing/foreign/terminal runs are indistinguishable (404); no principal is accepted on the wire.
 * @complexity Three indexed lookups and O(p + k) projection for p providers and k kinds; no cache.
 */
function componentCatalogHandler({ runStore, workspaceId, components }: ComponentCatalogDeps, _optional = {}): RequestHandler {
  return (req, res, next) => {
    const runId = req.query.runId;
    const refuse = () => { res.status(404).json({ error: { code: "NOT_FOUND", message: "a live site run is required" } }); };
    if (typeof runId !== "string" || !runId || req.query.principalId !== undefined || !runStore) { refuse(); return; }
    void (async () => {
      if (!(await findLiveSiteToolRun({ runId, runStore, workspaceId }))) { refuse(); return; }
      if (!components?.chartProviderSnapshot) { res.status(503).json({ error: "component catalog is unavailable", code: "COMPONENT_CATALOG_UNAVAILABLE" }); return; }
      await Promise.all([components.pluginRuntimeReady, components.siteTitleReady]);
      if (!(await findLiveSiteToolRun({ runId, runStore, workspaceId }))) { refuse(); return; }
      const snapshot = await components.chartProviderSnapshot({});
      if (!(await findLiveSiteToolRun({ runId, runStore, workspaceId }))) { refuse(); return; }
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
 */
async function findLiveSiteToolRun({ runId, runStore, workspaceId, principalId }: {
  runId: string; runStore: Pick<DurableRunStore, "find">; workspaceId: string; principalId?: string;
}, _optional = {}) {
  const run = await runStore.find({ runId }, {});
  if (!durableAttemptOwnsAnswer({ attempt: run }) || run?.runId !== runId || run.workspaceId !== workspaceId) return undefined;
  return principalId === undefined || run.principalId === principalId ? run : undefined;
}

/** Binds both RPC routes to this site's current answer attempt. Wire identity and roles confer no
 * authority; only the stored principal is forwarded. A read-only request may still attenuate it.
 * Missing storage fails closed. One indexed lookup per request; O(1) extra space. */
function requireSiteToolRun({ runStore, workspaceId }: {
  runStore: Pick<DurableRunStore, "find"> | undefined; workspaceId: string;
}, _optional = {}): RequestHandler {
  return (req, res, next) => {
    const body = req.body as { run?: { id?: unknown }; principal?: { id?: unknown; toolAccess?: unknown } } | undefined;
    const execution = req.method === "POST";
    const runId = execution ? body?.run?.id : req.query.runId;
    const principalId = execution ? body?.principal?.id : req.query.principalId;
    const refuse = () => { res.status(403).json({ error: { code: "FORBIDDEN", message: "a live site run with its recorded principal is required" } }); };
    if (!runStore || typeof runId !== "string" || typeof principalId !== "string") { refuse(); return; }
    void findLiveSiteToolRun({ runStore, runId, workspaceId, principalId }).then((run) => {
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
