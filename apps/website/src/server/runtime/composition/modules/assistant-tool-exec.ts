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
import type { RememberedApprovalPort, ToolRegistration } from "@jini-ai/core";
import type { Clock } from "@jini-ai/core/primitives";
import { MAX_DOCUMENT_BYTES } from "@jini-ai/cms/media";
import { createRemoteAttachmentLookup, registerToolExecutionRoutes, type AttachmentLookup, type ToolExecutionRouteTarget } from "@jini-ai/daemon/http";
import type { ByokToolSurface } from "#src/assistant/index";
import { AGENT_DAEMON_TOKEN_ENV_VAR, TOOL_EXEC_TOKEN_ENV_VAR, currentToolExecToken } from "#src/assistant/daemon-access";
import { parseDaemonCallContext, readDaemonCallContext, runWithDaemonCallContext } from "#src/assistant/daemon-call-context";
import type { ConversationToolApprovalStore } from "#src/assistant/external-mcp-tool-approval-ports";
import { createNativeApprovalMemory } from "#src/contracts/core/native-approval-memory";
import { buildLibrarySaveAttachmentTool } from "#src/features/media/library-save-attachment";
import { buildPromoteChatAttachmentTool } from "#src/features/media/promote-chat-attachment";
import { buildListPendingChatAttachmentsTool } from "#src/features/media/list-pending-chat-attachments";
import { createDocumentArchiveReader } from "#src/features/media/document-archive";
import type { InstallAttachmentReader } from "#src/features/plugin-runtime/install-source";
import { getAgentDaemonUrl } from "../../lifecycle/agent-daemon-port.js";
import { createPluginInstallAttachmentReader } from "../plugin-install-attachment-reader.js";

/**
 * Mounts the tool RPC on `router`, which `app.ts` mounts ahead of the public JSON parser (the route
 * gates on token + loopback, then parses its own 16 MiB body). The token is read per request from
 * module memory (`currentToolExecToken`), never from `process.env`.
 * @complexity O(1) setup.
 */
export function registerAssistantToolExecRoutes({ router, toolSurface }: { router: ToolExecutionRouteTarget; toolSurface: Pick<ByokToolSurface, "daemonCalls"> }, _optional = {}): void {
  const tokenEnv: NodeJS.ProcessEnv = { get [TOOL_EXEC_TOKEN_ENV_VAR]() { return currentToolExecToken(); } };
  registerToolExecutionRoutes({ app: router, executor: toolSurface.daemonCalls.executor, listToolsFor: toolSurface.daemonCalls.listToolsFor }, {
    tokenEnvVar: TOOL_EXEC_TOKEN_ENV_VAR,
    env: tokenEnv,
    runWithContext: ({ context, fn }) => runWithDaemonCallContext({ context: parseDaemonCallContext({ value: context }), fn }),
  });
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
