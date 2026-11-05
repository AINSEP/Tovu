import { assistantRunToolFacts } from './assistant-run-tool-facts.js';
import { readAssistantRunToolPolicy, assistantRunPlan, assistantToolSetupMessage } from './assistant-run-tool-policy.js';
import { requestAssistantToolConsent, requestAssistantToolAlternative } from './assistant-tool-consent.js';
import { registerToolAccessLoweringRoute } from './tool-access-lowering-route.js';
import { createChatSettingsGetRegistration, type ChatSettingsSnapshot } from '@jini-ai/daemon/chat-settings';
import { stopRunsForToolAccessChange, admittedToolSources, type ToolAccessRun } from '@jini-ai/daemon';
import { publishJobRecoveryMessage } from "@jini-ai/devops/deploy";
import { createDaemonSiteTools } from "./agent-daemon-site-tools.js";
import { createAgentDaemonIdlePark } from "./agent-daemon-idle-park.js";
import { registerAgentPluginEvents } from "./agent-plugin-preflight-events.js";
import { ensureJsonAgentInstall } from "./ensure-json-agent-install.js";
import { buildAssistantFilesystemNotices } from "./assistant-filesystem-notices.js";
import { readLoginShellEnvironment } from "@jini-ai/platform/child-environment";
import { resolveNativeToolPolicy } from "@jini-ai/agent-runtime/native-tool-policy";
import { resolveFullCliAccess, resolveAssistantCliPermissions } from "#src/contracts/core/assistant-native-fallbacks";
import { resolveHostSignals } from "#src/server/runtime/composition/host-signals";
import { assistantCliPermissions } from "#src/assistant/assistant-subagents-policy";
import { type AssistantCliPermissions } from "#src/contracts/headless/index";
import { createToolGapCollector } from "@jini-ai/daemon/tool-audit";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { AsyncLocalStorage } from "node:async_hooks";
import { sniffContentType } from "@jini-ai/cms/media";
import { prepareByokMessageAttachments } from "./byok-message-attachments.js";
import { ensureToolExecToken, registerDaemonAttachmentLookup, TOOL_EXEC_TOKEN_ENV_VAR, AGENT_DAEMON_TOKEN_ENV_VAR } from "#src/assistant/daemon-access";
/**
 * @file The isolated site scope in the slim agent daemon — a separate OS process from Tovu's own server, per the
 * architecture correction to ADR-049: Tovu does not spawn coding-agent CLIs itself.
 *
 * ADR-070 amends ADR-049's former co-location constraint. The daemon's DelegatedToolBridge
 * still records tool_use/tool_result into this process's real lifecycle, wrapping a routed
 * executor. Site handlers run exclusively in the server through /internal/tool-executions;
 * in-memory site writes therefore reach the serving store too. Only frontend/page/chat tools
 * execute here. The server also owns plugin consent, installed tools and external federation.
 *
 * Retained composition opens only the configured leaf database client. The site owns durable
 * attempts and provider telemetry; memory-local sessions/approvals never replace that authority.
 *
 * Principal propagation: this process has no browser session/cookie of its own. Tovu's proxy
 * layer stamps the authenticated principal's id into `contextRef` (`{prompt, principalId}`,
 * Tovu's own wire format) before forwarding a run-start request here; `onStarted` decodes it and
 * records `runId -> principal` locally so `resolveDelegatedPrincipal` (called later, out of band,
 * by this run's own spawned `jini-mcp` subprocess) can answer without needing Tovu at all.
 *
 * Authorization: the bearer gate below establishes that a caller is Tovu's proxy, not which admin
 * the proxy speaks for — so on its own it lets any logged-in admin read, stream, or cancel any
 * other admin's run by id. `run-ownership.ts` closes that: the proxy asserts its verified principal
 * in a header on every forwarded request, and this process compares it against the run's recorded
 * owner. Enforcement is here rather than in the proxy because this is the process that owns run
 * state, so the ownership record and the run it protects live and die together.
 *
 * Authentication: the relay claim POST has its own live-run credential gate; all other routes use
 * `daemon-auth.ts`'s `requireAgentDaemonToken()`. Both gates run before their `express.json()`,
 * so an unauthenticated caller's body is never even parsed. It requires an exact
 * `Authorization: Bearer <TOVU_AGENT_DAEMON_TOKEN>` match, has no loopback exemption (binding to
 * `127.0.0.1` keeps remote hosts out but does nothing about other local processes, which is the
 * actual threat for a daemon that can start real agent runs and write to `content.db`), and fails
 * closed with 503 when the scope credential is unset. Desktop main initializes each scope
 * through inherited IPC with a distinct proxy credential; standalone boot adopts its existing
 * per-boot token. The runtime environment omits both proxy and site-tool credentials before any
 * CLI probes or agent processes can launch. Deliberately NOT the generic API bearer middleware — see
 * `daemon-auth.ts`'s header for why its loopback short-circuit makes it a no-op here.
 *
 * `/api/delegated-tool-calls` also requires a bearer: the Claude/Codex `jini-mcp` subprocess
 * receives its per-run `JINI_DAEMON_TOKEN` through `mcp-injection.ts` and forwards it on callbacks.
 * After JSON parsing, a second gate binds body.runId to that credential's run. BYOK executes
 * in process and the proxy does not expose this route; no credential-less exemption is needed.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";

import express from "express";

import { createToolRegistry } from "@jini-ai/core";
import type { Principal, ToolExecutionContext, SurfaceEmitter } from "@jini-ai/core";
import { isTerminalRunState, type RunAgentPayload } from '@jini-ai/protocol';
import type { RunLifecycle } from "@jini-ai/daemon";
import { traceRunLifecycle } from "./run-lifecycle-tracing.js";
import { createRoutingToolExecutor, createAgentExecutor, createInMemoryEventLog, createRunLifecycle, prepareMessageAttachments, probeMcpBridge, type MessageAttachmentImage, type UserMessageDelivery } from "@jini-ai/daemon";
import { formatBridgePreflightLogLine, formatRunEndLogLine, formatRunErrorLogLine } from "./run-log-lines.js";
import { bridgePreflightEntry } from "./bridge-preflight-entry.js";
// @jini-ai/agent-runtime owns this seam; @jini-ai/daemon accepts it as an option.
import type { PromptAugmenter } from "@jini-ai/agent-runtime";
import { createAgentSelectionResolver, createNativeAgentRuntime, ensureAgentCapabilities } from "@jini-ai/agent-runtime";
import { createDaemonAuthMiddleware, createDiskAttachmentStore, stageAttachmentClaim, createFrontendControl, registerFrontendRequestRoute, registerAgentRoutes, registerAttachmentRoutes, registerComponentCatalogRoutes, registerDelegatedToolRoutes, registerMessageRelayRoutes, registerRunRoutes, registerToolCatalogRoutes } from "@jini-ai/daemon/http";
import { adminFrontendOwner, adminFrontendRunOwner } from "#src/assistant/admin-frontend-owner";
import { bearerTokenFromHeader } from "@jini-ai/http-kit";
import type { AdapterContext } from "@jini-ai/http-kit";
import type { AttachmentStore, DelegatedToolExecuteRequest, RunMessageRequest, RunStartHandler, StoredAttachment } from "@jini-ai/daemon/http";

/** The `run`/`lifecycle` shape `RunStartHandler` receives — derived rather than imported directly
 *  from `@jini-ai/daemon`/`@jini-ai/protocol` so this file adds no new package-import edge just to
 *  name a type its one existing `RunStartHandler` import already carries structurally. */
type OnStartedContext = Parameters<RunStartHandler>[0];

/** The extra `AgentExecutor.run()` fields a claimed attachment batch contributes. */
type AttachmentRunFields = { imagePaths?: readonly string[]; imageContents?: readonly MessageAttachmentImage[]; attachmentNotice?: string;
  extraAllowedDirs?: readonly string[]; uploadRoot?: string };

/** A run's session-binding decision: the agent it runs and the session fields handed to the CLI. */
type RunSessionBinding = {
  readonly agentId: string;
  readonly sessionFields: { resumeSessionId?: string; newSessionId?: string };
};

import { assemblePromptWithPluginPrefix } from "./plugin-prompt-assembly.js";
import { buildCapabilityManifestPrefix, resolveCapabilityManifestArm } from "./capability-manifest-prefix.js";
import {
  resolveAssistantDisallowedTools,
  ASSISTANT_SETTING_SOURCES,
  buildBaseSystemOverlay,
  buildAssistantSubagentsOverlay,
  resolveAssistantRunSettings,
  resolveBashProhibitionEnabled,
} from "./assistant-system-overlay.js";
import { buildAssistantRuntimeGuidance, createAssistantChromeProbe, resolveAssistantRuntimeLaunch, type AssistantRuntimeGuidanceInput } from "./assistant-runtime-guidance.js";
import { getCustomFsRoot } from "../../../features/fs-files/custom-root-store.js";
import { createAgentDaemonCoreDeps, type AgentDaemonCoreOptions, type AgentDaemonResource } from "../../runtime/composition/agent-daemon-core-deps.js";
import { resolveAgentPermissionMode } from "#src/contracts/core/agent-permission-mode";
import { applyToolApprovalPolicy } from "#src/assistant/tool-approval-policy";
import { pageApprovalOptions } from "#src/assistant/page-approval-context";
import { createAssistantAgentInventory } from "#src/assistant/agents";
import { agentCarriesOwnMemory, extractSessionRefFromEndEvent, resolveResumeSessionField, shouldClearSessionOnFailedResume, wouldForcedColdStartLoseConversationContext, CONCURRENT_RUN_REFUSAL_MESSAGE, createLiveRunTracker, failRunBeforeStart, STOPPING_RUN_WAIT_MS, waitForStoppingRuns, agentAcceptsHostMintedSessionId, resolveHostMintedSessionId, resolveNewSessionField, createConversationStartLock } from "#src/assistant/agent-session-preset";
import { readAssistantCliPermissions } from "#src/assistant/subagent-settings";
import { createCustomInstructionsCache } from "#src/assistant/custom-instructions";
import { DELEGATED_TOOL_CALLS_PATH, requireAgentDaemonToken, createOwnedRunListHandler, createRunOwnerRegistry, requireRunOwnership, RUN_PRINCIPAL_HEADER, createRunScopedCredentials } from "#src/assistant/daemon-access";
import { FRONTEND_CONTROL_CAPABILITIES, withReadOnlyFrontendCapabilities } from "#src/assistant/frontend-control-capabilities";
import { registerA2uiActionsRoute } from "#src/assistant/a2ui-actions-route";
import { registerMcpUiToolCallsRoute } from "#src/assistant/mcp-ui-tool-calls-route";
import { resolveMcpJsonInjection } from "#src/assistant/mcp-injection";
import { parseRunStartContextRef } from "#src/assistant/run-start-context";
import { buildPageContextPromptBlock, type RunPageContext } from "#src/assistant/run-page-context";
import { constrainPrincipalToReadOnlyTools, withReadOnlyToolConstraint } from "#src/assistant/read-only-tool-constraint";
import { createAssistantToolExecutor, delegatedToolErrorDisclosure } from "#src/assistant/tool-recovery-preset";
import { createLostFrontendBindings } from "#src/assistant/lost-frontend-binding";
import { withPageNavigateErrorRewrap } from "#src/assistant/rewrap-page-navigate-error";
import { createRunActiveContextStore, registerRunActiveContextRoute } from "#src/assistant/run-active-context";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { TOVU_MAX_UPLOAD_BYTES } from "#src/contracts/core/upload-limits";
import { registerCredentialRunIntake, registerDurableRunStartRoute, registerDurableToolGuard } from "./durable-run-routes.js";
import { createEarlySessionCapture } from "./early-run-session.js";
import { agentReceivesImageAttachments, durableAttemptOwnsAnswer, resolveStoredSessionId, selectRunHistoryPrompt } from "./run-start-decisions.js";
import { readProcessStart } from "./attempt-process-identity.js";
import { checkReadOnlyTool, defaultDaemonMessages } from "@jini-ai/daemon/read-only-tools";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { awaitBootWorkWithinBound } from "../../runtime/lifecycle/await-boot-work.js";


export interface SiteScopeOptions {
  readonly coreOptions?: AgentDaemonCoreOptions;
  readonly idlePark?: ReturnType<typeof createAgentDaemonIdlePark>;
  readonly probeBridge?: () => Promise<void>;
}
export interface SiteScope {
  readonly app: express.Express;
  readonly lifecycle: RunLifecycle;
  hasExchanges(): boolean;
  dispose(required: Record<string, never>, optional?: Record<string, never>): Promise<void>;
}

/** Copy/validate the bound site's snapshot before any runtime or retained-client side effect.
 * Proxy authority stays out of the runtime environment. O(e) copy for e supplied variables.
 */
function scopeConfiguration({ siteId, env: suppliedEnv, token }: { siteId: string; env: NodeJS.ProcessEnv; token: string }) {
  if (!suppliedEnv.TOVU_SITE_DIR || !token) throw new Error("site daemon requires an explicit directory and RPC credential");
  const env: NodeJS.ProcessEnv = { ...suppliedEnv, TOVU_WORKSPACE: siteId,
    TOVU_SITE_PROCESS_CWD: suppliedEnv.TOVU_SITE_PROCESS_CWD ?? suppliedEnv.TOVU_SITE_DIR };
  const authEnv = { [AGENT_DAEMON_TOKEN_ENV_VAR]: env[AGENT_DAEMON_TOKEN_ENV_VAR] };
  delete env[AGENT_DAEMON_TOKEN_ENV_VAR];
  env[TOOL_EXEC_TOKEN_ENV_VAR] = token;
  const daemonUrl = env.JINI_AGENT_DAEMON_URL;
  if (!daemonUrl || !authEnv[AGENT_DAEMON_TOKEN_ENV_VAR]) throw new Error("site daemon endpoint and credential are required");
  const port = Number(new URL(daemonUrl).port);
  return { env, authEnv, daemonUrl, port };
}

/** Instantiate the existing lean composition with private site configuration and authority.
 * @param required Canonical server workspace, copied environment and private site RPC credential.
 * @param optional Retained-client test seams and the process-owned union activity monitor.
 * @returns An authenticated app, scoped lifecycle and idempotent site-only drain.
 * @throws On authenticated bootstrap/binding mismatch or retained-resource initialization failure.
 * @complexity One configured leaf client and bounded lifecycle/catalog/attachment owners per site.
 */
export async function createSiteScope(
  { siteId, env: suppliedEnv, token }: { siteId: string; env: NodeJS.ProcessEnv; token: string }, optional: SiteScopeOptions = {},
): Promise<SiteScope> {
  const { env, authEnv, daemonUrl, port } = scopeConfiguration({ siteId, env: suppliedEnv, token });
  const toolExecTokenHolder: NodeJS.ProcessEnv = {};
  let disposed = false;
  let closing: Promise<void> | undefined;
  let daemonStore: AgentDaemonResource | undefined;
  let disposeAiTracing: () => void = () => {};
  const responses = new Set<express.Response>();
  let activeWork = 0;
  let resolveDrained: (() => void) | undefined;
  const ownerRetentionTimers = new Set<ReturnType<typeof setTimeout>>();
const DEFAULT_AGENT_ID = "claude";
// Adopt the supervisor's private RPC credential before CLI probes or plugin hosts can spawn.
const siteToolToken = ensureToolExecToken({ env, holder: toolExecTokenHolder }, {});
const assistantRuntime = createNativeAgentRuntime({ env: env });
const assistantInventory = createAssistantAgentInventory({ runtime: assistantRuntime });
const { getAgentDef, resolveAgentLaunch } = assistantRuntime;
const resolveAssistantAgentId = createAgentSelectionResolver({ defaultAgentId: DEFAULT_AGENT_ID,
  onFallback: ({ agentId, defaultAgentId }) => console.warn(`[agent-daemon] unknown agent "${agentId}"; using default "${defaultAgentId}"`),
}, { getDef: getAgentDef });
// Chrome guidance and tools follow the same `--help` probe that gates `--chrome` in the argv.
const probeAssistantChrome = createAssistantChromeProbe({ getDef: getAgentDef, resolveAgentLaunch, capabilities: assistantRuntime.state.capabilities,
  ensureAgentCapabilities: input => ensureAgentCapabilities(input, { state: assistantRuntime.state }), env: assistantRuntime.hostEnv });


try {
/**
 * Total bytes one composer turn's staged attachments may sum to (`createDiskAttachmentStore`'s
 * `maxBatchBytes`, `@jini-ai/http-kit`'s own default is 20 MB). Kept at twice
 * {@link TOVU_MAX_UPLOAD_BYTES} (below) — the daemon's own per-file cap — rather than left equal to
 * it, so a turn with one file at the cap still has room for a second small one; that default's own
 * doc says the per-file cap "should be at or below" this value, and an exact match would leave zero
 * headroom for any additional attachment in the same turn. Owner-directed (2026-09-21): the
 * per-file cap rose to 50 MiB alongside the media upload cap it mirrors, so this rose to 100 MiB to
 * keep that headroom.
 */
const ATTACHMENT_MAX_BATCH_BYTES = TOVU_MAX_UPLOAD_BYTES * 2;

/**
 * Opt-in-only diagnostic gate for the base system overlay's Bash-prohibition instrument — see
 * `assistant-system-overlay.ts`'s `resolveBashProhibitionEnabled` for the full rationale (why this
 * exists, why it defaults OFF, and why it is not a security control). Read once here, at module
 * scope like `ATTACHMENT_UPLOAD_DIRECTORY` (below), rather than per-call inside `systemOverlay()`:
 * this is a boot-time operator choice, not a per-run condition.
 */
const bashProhibitionEnabled = resolveBashProhibitionEnabled(env);

/**
 * The agent CLI's permission mode for this daemon process. The rule and its full "why" (no TTY to
 * answer a prompt; bypass unless `TOVU_RUNTIME_MODE=production`; explicit
 * local `TOVU_AGENT_PERMISSION_MODE` overrides, hosted always restricted) live in `contracts/core/agent-permission-mode.ts`, shared with
 * the boot-readiness warning so both always agree on the mode this daemon actually runs in.
 */
function resolvePermissionMode(): "bypass" | "restricted" {
  return resolveAgentPermissionMode({ env: env }, { hostSignals: resolveHostSignals({ env: env }) });
}

// The supervisor pins the site's workspace. The authenticated bootstrap also checks it, so a
// daemon cannot silently attach to another workspace's settings, files or attempt authority.
// Site writes now execute in the server: its bus/drainer delivers their outbox events. There is
// no enqueue-only outbox or disconnected durable ledger in this process, including memory mode.
const routeDeps = await createAgentDaemonCoreDeps({ env, token: siteToolToken }, { ...optional.coreOptions,
  onStoreOpened: (store) => { daemonStore = store; optional.coreOptions?.onStoreOpened?.(store); } });
// Provider plugins stay at the site owner (including project settings/migrations). Forward process
// diagnostics with their daemon attribution; a fatal drain never disposes the server's providers.
// Process error handlers belong to the entry; this scope retains its own tracker and trace sink.

/**
 * Root directory the chat composer's staged image/file uploads land in before a run claims them
 * (`@jini-ai/http-kit`'s `createDiskAttachmentStore`) — deliberately NOT `the process working directory`.
 *
 * The resolution itself moved to `chat-attachment-directory.ts` (see that file for the full
 * anchoring rationale and its disclosed residual risk) and is UNCHANGED by the move — same
 * `TOVU_CHAT_ATTACHMENTS_DIR` override, same `dirname(<content.db>)` fallback. It is a
 * shared function rather than this file's private constant for one reason: the API process now
 * reads these same uploads back over HTTP (`modules/assistant.ts`'s
 * `registerAdminChatAttachmentReadRoute`), and two copies of a path expression in two processes is
 * exactly the "one call site drifts" defect this repo keeps finding.
 *
 * Read off `routeDeps` (hardwiring audit #19, 2026-10-08) rather than resolved here: the composition
 * root that built `routeDeps` resolved it ONCE from the `content.db` it actually opened, so this
 * process's uploads and its database can no longer name two different sites. Declared right after
 * `routeDeps` for that reason. The tool contributors below read the same field off `routeDeps`
 * directly, not this const, so their statement slice stays evaluable on its own (see
 * `__tests__/helpers/daemon-tool-surface.ts`).
 */
const ATTACHMENT_UPLOAD_DIRECTORY = routeDeps.siteStoragePaths.chatAttachmentsDir;

// The in-memory log bounds itself (a run's payloads are compacted 15 min after its `end`; at most
// 1000 runs are held), and the durable transcript is `ai_chat_messages.events_json`. Dropping a run's
// events when the lifecycle evicts its record gives both the same lifetime (memory cause 2, 2026-10-21).
const eventLog = createInMemoryEventLog({});
// Assistant runs → AI trace when a trace provider or analytics AI capability is configured.
const tracing = traceRunLifecycle({ lifecycle: createRunLifecycle({ eventLog }, { dropEventsOnEviction: true }), sink: routeDeps.aiTraceSink });
disposeAiTracing = tracing.dispose;
const lifecycle = tracing.lifecycle;
await lifecycle.rehydrate({}).catch((error: unknown) => {
  console.error("[agent-daemon] lifecycle.rehydrate() failed", error);
});

/**
 * The parked-call store backing the single-call MCP-UI return path (ADR-055 Decision 1).
 *
 * Created here, at the composition root, because exactly two things must share ONE instance and they
 * are wired ~300 lines apart: the tool registrations below (whose handlers park) and
 * `registerMcpUiToolCallsRoute` (which delivers the human's answer into a park). Two instances would
 * not fail loudly — every delivery would 409 while the agent sat blocked until its TTL expired.
 */
const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
const processActivity = optional.idlePark ?? createAgentDaemonIdlePark({ isBusy: () => surfaceExchanges.size() > 0, exit: () => {} }, { env });
const idlePark = { ...processActivity,
  hold(_required: Record<string, never>, _optional = {}) {
    const release = processActivity.hold({}, {});
    activeWork++;
    let released = false;
    return () => {
      if (released) return;
      released = true; release(); activeWork--;
      if (activeWork === 0) resolveDrained?.();
    };
  },
};

// Site registrations, attachment tools, plugin guidance and federation have one owner: the
// server's BYOK composition. Only browser-tab capabilities have executable registrations here.
const chatSettingsByRunId = new Map<string, ChatSettingsSnapshot>();
const toolAccessRuns = new Map<string, ToolAccessRun>();
const revokedToolRuns = new Set<string>();
const cleanupFailures = new Set<string>();
const noToolsNotices = new Set<string>();
const registry = createToolRegistry({});
registry.register(createChatSettingsGetRegistration({ readSnapshot: ({ runId, principalId }) =>
  !revokedToolRuns.has(runId) && principalByRunId.get(runId)?.id === principalId ? chatSettingsByRunId.get(runId) : undefined }));
const siteTools = createDaemonSiteTools({
  baseUrl: env.TOVU_SITE_CALLBACK_ORIGIN ?? env.TOVU_SITE_LISTENER_ORIGIN ?? "",
  token: siteToolToken, localRegistry: registry,
  audit: { sink: routeDeps.toolAttemptAuditSink, workspaceId: routeDeps.workspaceId },
  contextFor: ({ runId }) => ({
    conversationId: liveRunTracker.conversationIdForRun({ runId }, {}),
    attachmentRefs: messageAttachmentRefsByRunId.get(runId) ?? [],
  }),
});
const visibleRegistry = siteTools.registry;

/**
 * Runs whose tab bound with a token this daemon does not know — the tab outlived a restart and has
 * not reconnected yet. Their frontend tools say "reload the admin page" instead of the bare "no
 * frontend is bound". See `lost-frontend-binding.ts`.
 */
const lostFrontendBindings = createLostFrontendBindings();

/**
 * Agent-driven control of the admin's own browser tab and chat pane — `page.navigate`,
 * `page.scroll_to`, `page.find_elements`, `chat.send_message`, `admin.capture_screenshot`, and the
 * rest of {@link FRONTEND_CONTROL_CAPABILITIES} (`page.*` plus all seven of `chat.*`'s verbs — as
 * of 2026-09-24 `chat.reset_conversation` is included too, via a Tovu-owned clone; see that
 * module's own doc for why — plus Tovu's own `admin.*` additions).
 *
 * `createFrontendControl` assembles the three parts (session registry, gated tool registrations,
 * the stream/response routes) and deliberately never hands back the registry — its `invoke`
 * executes a capability on a real admin's real screen with no policy check, no timeout and no
 * audit record, and is safe only because the one thing that can reach it is a `ToolHandler`
 * `ToolExecutor` has already gated.
 *
 * `FRONTEND_CONTROL_CAPABILITIES` is imported rather than restated so the manifest the daemon
 * gates and the manifest `apps/admin` executes are the same array — the two cannot drift into a
 * state where an agent is offered a verb the page/chat pane does not implement, or vice versa.
 */
const frontendControl = createFrontendControl({
  capabilities: FRONTEND_CONTROL_CAPABILITIES,
  session: { resolveOwner: async ({ req }) => adminFrontendOwner({ req, workspaceId: routeDeps.workspaceId }) },
  resolveBindOwner: ({ request }) => adminFrontendRunOwner({ contextRef: request.contextRef, workspaceId: routeDeps.workspaceId }),
  /**
   * Which tab this run may drive. Tovu's own `contextRef` envelope carries it, put there by the
   * admin's `FrontendSessionBridge` (`apps/admin/src/lib/assistant-transport.ts`) and passed
   * through untouched by the proxy.
   *
   * `undefined` is normal, not an error — a run with no originating surface (a future CLI or
   * scheduled trigger) is still legitimate; it simply has no screen, and each `page.*` call it
   * makes is refused by name rather than hanging. A malformed envelope is treated the same way:
   * `onStarted` below already reports and fails the run for that, so throwing here as well would
   * turn one diagnosable error into two.
   */
  resolveBindToken: ({ request }) => {
    try {
      const parsed = JSON.parse(request.contextRef) as { frontendBindToken?: unknown };
      return typeof parsed.frontendBindToken === "string" && parsed.frontendBindToken.length > 0
        ? parsed.frontendBindToken
        : undefined;
    } catch {
      return undefined;
    }
  },
}, {
  // Pass-through `allow`, matching ADR-021 §2 and every other Tovu registration (see
  // `tool-registration-kit.ts`). It is not a missing check: these verbs carry no Tovu permission
  // of their own, and the authorization that matters already happened twice before a call gets
  // here — Tovu's proxy required an admin session to start the run at all, and the daemon will
  // only route the invocation to the one surface bound to THAT run. An agent therefore cannot
  // reach a tab other than the one whose own admin started it.
  policy: { authorize: () => "allow" },
  // Page text is untrusted input to whatever model reads the result back. `page.find_elements`
  // returns labels and values written by the page itself, so bound what one call can return.
  maxOutputBytes: 64 * 1024,
  onBindError: (context) => {
    console.error(`[agent-daemon] run ${context.runId}: could not bind to a frontend surface`, context.error);
    lostFrontendBindings.noteBindError(context);
  },
});
// `withPageNavigateErrorRewrap` (Tovu-side, `assistant/rewrap-page-navigate-error.ts`) rewraps ONLY
// `page.navigate`'s registration so its "not a published page" refusal (`@jini-ai/agentic`'s
// `page-executor.ts:414`) cannot be misread as this codebase's own, unrelated
// `PostRecord.status === "published"` CMS-content concept — see that module's own header for the
// full rationale. Every other registration passes through unchanged.
// `withReadOnlyFrontendCapabilities` marks page.find_elements and admin.capture_screenshot read-only,
// so the read-only delegated-tool gateway runs them (see `frontend-control-capabilities.ts`).
for (const registration of withPageNavigateErrorRewrap(withReadOnlyFrontendCapabilities(frontendControl.toolRegistrations))) {
  // Page clicks carry arbitrary UI effects; apply the same reviewed host policy as WebMCP.
  // Every frontend registration needs a classification, including local chat operations.
  // The server's human chat-card exchange owns page approval for every transport. The browser
  // bridge has no second dialog gate, so an opaque click asks exactly once, including on AG-UI.
  const bound = lostFrontendBindings.wrap(registration);
  registry.register(applyToolApprovalPolicy({ registration: bound, surfaces: { surfaceExchanges } },
    pageApprovalOptions({ toolId: registration.descriptor.id, execute: (...args) => toolExecutor.execute(...args) })));
}
// Wrapped, not bare: `@jini-ai/daemon`'s executor keeps its audit records in an in-process `Map`
// and mints them only AFTER authorization resolves, so an unknown tool id or a throwing
// authorization leaves no trace at all, and everything else is lost on restart. The decorator
// appends a `requested` row before delegating, which is the only ordering under which those cases
// are recorded. Audit is observation — a sink failure can never change a tool call's outcome.
// See `tool-executor-audit.ts`.
// The retained root chooses this same site's content-kernel sink once (or the bounded local
// memory sink). Reuse that connection: a second openContentDb here used to open/migrate a second
// content.db solely for audit. Site tool audit runs at the server owner; this sink observes local
// frontend calls and discovery without constructing site handlers or a second site composition.
const auditSink = routeDeps.toolAttemptAuditSink;
// Local UI effects retain their approved gating/audit stack. Site effects use the server's
// complete stack; the outer descriptor gate verifies read-only authority before either route.
const localToolExecutor = createAssistantToolExecutor({ registry, surfaceExchanges,
  toolAttemptAudit: { sink: auditSink, workspaceId: routeDeps.workspaceId } }, {});
const toolExecutor = withReadOnlyToolConstraint(createRoutingToolExecutor({
  local: localToolExecutor, remote: siteTools.remote,
  isLocal: ({ toolId }) => registry.has({ toolId }),
}, { acquireActivity: () => idlePark.hold({}, {}) }), { registry: siteTools.registry });

/**
 * The admin Instructions tab's system-prompt seam (`core.instructions.custom`) — see
 * `custom-instructions.ts`'s module doc for why this is a refreshable cache rather than a direct
 * ledger read: `PromptAugmenter.systemOverlay()` below is called synchronously, and the cross-process
 * cache the ledger's own `getEffective` keeps would otherwise go stale forever after this process's
 * first read. `onStarted` calls `.refresh()` before every run; `assistantPromptAugmenter.
 * systemOverlay()` reads the result synchronously.
 */
const customInstructionsCache = createCustomInstructionsCache(
  {
    settingsRepo: routeDeps.settingsRepo,
    settingsReady: routeDeps.settingsUiTabsReady,
    getEffective: routeDeps.getEffective,
    instructionsNamespace: routeDeps.instructionsNamespace,
  },
  { workspaceId: routeDeps.workspaceId },
);

// Scope the fresh site setting to its launch, rather than sharing the last chat's grant across
// concurrent runs. The synchronous Jini prompt seam reads the same value as the CLI deny list.
const assistantCliCapabilitiesContext = new AsyncLocalStorage<AssistantCliPermissions["capabilities"]>();
const assistantNativeToolsContext = new AsyncLocalStorage<boolean>();
// Same per-launch scoping for the person's runtime preferences (`assistant-runtime-guidance.ts`).
const assistantRuntimeGuidanceContext = new AsyncLocalStorage<AssistantRuntimeGuidanceInput>();

/**
 * Live-tested 2026-07-30: given a bare natural-language admin request with a matching registered
 * tool (a DB health check, user creation, role listing, form creation), the spawned CLI reliably
 * used its own native Bash/curl instead of `search_tools`/`execute_delegated_tool` — in the worst
 * case, self-authenticating as the seeded site owner via the raw admin login route rather than
 * going through the tool catalog's authorization/risk-classification/audit-log system. The BM25
 * tool-catalog backend itself is not the problem (confirmed healthy via direct query); nothing
 * upstream of it ever told the CLI these tools exist and should be preferred. This overlay is that
 * missing instruction — see `ADS-memory/reports/architecture/ai-workflow-testing-findings.md`.
 */
const assistantPromptAugmenter: PromptAugmenter = {
  contextKinds: () => [],
  augmentUserRequest: ({ basePrompt }) => basePrompt,
  systemOverlay: ({ agentId }) => {
    const def = getAgentDef({ id: agentId });
    // Base overlay text lives in `assistant-system-overlay.ts` now — see that file's own doc for
    // why this had to move (direct unit-testability without booting this whole daemon process) and
    // `bashProhibitionEnabled`'s doc above for the one thing about it that is conditional.
    const baseOverlay = buildBaseSystemOverlay(bashProhibitionEnabled, {
      nativeToolAccess: assistantNativeToolsContext.getStore() === true,
      // Mirrors Jini's `supportsMessageRelay` (agent-executor/message-relay.ts), which the package
      // does not export: MCP-bridged defs relay, native stream-json input (Claude) always wins and
      // never relays. Keep the two aligned or the sentence names a tool the run does not have.
      messageRelayEnabled: def?.externalMcpInjection !== undefined && !(def.promptViaStdin === true && def.promptInputFormat === "stream-json"),
    }) +
      buildAssistantSubagentsOverlay({ capabilities: assistantCliCapabilitiesContext.getStore() ?? assistantCliPermissions({ enabled: false }).capabilities }, {}) +
      buildAssistantRuntimeGuidance({ input: assistantRuntimeGuidanceContext.getStore() }, {}) +
      buildAssistantFilesystemNotices({ agentId, capabilities: assistantCliCapabilitiesContext.getStore() ?? assistantCliPermissions({ enabled: false }).capabilities }, { platform: process.platform });
    // Appended, not replaced: the tool-catalog protocol above is load-bearing for every run
    // regardless of what an operator writes in the Instructions tab, and an operator's custom text
    // should not be able to silently drop it. `readOverlay()` is `null` for an unset/cleared tab
    // (see `custom-instructions.ts`), so a workspace with no custom instructions gets exactly the
    // base overlay this returned before that tab had any consumer at all.
    const customOverlay = customInstructionsCache.readOverlay();
    return customOverlay === null ? baseOverlay : `${baseOverlay}\n\n${customOverlay}`;
  },
};

// Each run's bridge gets its own credential, resolved back to that run's principal; see
// `run-scoped-credential.ts`. A closure because `runCredentials` is declared further down.
const bridgeInjection = {
  toolApprovalOwner: "host" as const,
  ...resolveMcpJsonInjection(daemonUrl, (runId) => runCredentials.mint({ runId: runId }, {}), {
    execPath: process.execPath, electronVersion: process.versions.electron, env,
  }),
  diagnosticToolIds: () => registry.list({}).map(tool => tool.id),
  // Resolve at launch inside the live site scope: concurrent runs must not share a delete grant,
  // and diagnostic IDs must never publish schemas for tools this run cannot discover.
  /** Put theme file tools first within Jini's bounded startup publication (64 tools / 256 KiB of
   * schemas): late contributor registration must not hide them while native file tools are visible.
   * Only reorder admitted IDs; the catalog and executor still own visibility and authorization.
   * @complexity O(n) time/space for n visible tools and four fixed priority IDs. No I/O. */
  startupToolIds: (_required: { readonly runId: string }, _optional = {}) => {
    const toolIds = visibleRegistry.list({}).map(tool => tool.id);
    const themeFileTools = ["theme_list_files", "theme_read_file", "theme_edit_file", "theme_write_file"];
    return [
      ...themeFileTools.filter(id => toolIds.includes(id)),
      ...toolIds.filter(id => !themeFileTools.includes(id)),
    ];
  },
};
const agentExecutor = createAgentExecutor({
  lifecycle,
}, {
  // The same registry and launch resolver `assistant/agents.ts` lists the Local CLI picker from.
  // `@jini-ai/daemon` pins its own exact `@jini-ai/agent-runtime`, which an install can nest as an
  // older copy; left to its defaults the executor would look agents up there, so a CLI the picker
  // shows (e.g. one added in a newer agent-runtime) would fail to start with an unknown agent id.
  getAgentDef,
  resolveAgentLaunch,
  runtimeState: assistantRuntime.state,
  hostEnv: assistantRuntime.hostEnv,
  onCleanupFailure: ({ runId }) => { cleanupFailures.add(runId); console.error('[agent-daemon] CLI cleanup failed'); },
  codexDisablePlugins: assistantRuntime.codexDisablePlugins,
  piGracefulShutdownMs: assistantRuntime.piGracefulShutdownMs,
  mcpJsonInjection: bridgeInjection,
  promptAugmenter: assistantPromptAugmenter,
  // `claudeConfigDirIsolationEnabled` deliberately left at its `@jini-ai/daemon` default (`false`) —
  // see `CreateAgentExecutorOptions.claudeConfigDirIsolationEnabled`'s own doc (Jini) for the full
  // reasoning. Short version: `@jini-ai/daemon`'s Finding-1 fix (2026-09-07) staged an isolated,
  // mkdtemp'd `CLAUDE_CONFIG_DIR` for every spawned `claude` run to stop it reading the operator's
  // real `~/.claude` (skills, plugins, memory index, a 40-tool personal grant). On macOS that
  // isolated dir reports `loggedIn: false` — Claude Code keys its Keychain entry to
  // `CLAUDE_CONFIG_DIR` — and this assistant's default Local CLI runtime supplies no
  // `credentialEnv` (no `ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN`; the operator has declined
  // `claude setup-token`), so an isolated child always ran unauthenticated and every Local CLI run
  // failed with "Not logged in · Please run /login". Leaving this flag off knowingly REOPENS that
  // personal-config leak so the default runtime can log in at all — the tool-restriction gate below
  // (`ASSISTANT_DISALLOWED_TOOLS`) is a separate mechanism and stays fully enforced either way,
  // except the owner's Task opt-in (see
  // its own test, `__tests__/agent-executor.test.ts`'s "still applies disallowedTools ... when
  // CLAUDE_CONFIG_DIR isolation is left at its default" in the daemon package). Flip this back to
  // `true` once a host-provisioned `credentialEnv` exists for this runtime (outranks Keychain login
  // in Claude Code's own auth precedence, so an isolated child would still authenticate).
  claudeConfigDirIsolationEnabled: false,
});

// Initialize needs no callback credential; probe the real launch without minting a run token.
// The run-scoped startup tool fetch is left out of it — see bridge-preflight-entry.ts.

/** Populated by `onStarted`, read by `resolveDelegatedPrincipal` — see module doc. Deleted on
 * terminal transition on purpose: the exempt `/api/delegated-tool-calls` route's remaining defence
 * is that a `runId` only resolves while its run is in flight (`daemon-auth.ts`). */
const principalByRunId = new Map<string, Principal>();
/** Accepted-message refs decoded by `onStarted`, keyed by the SAME lifecycle id used by claim()
 * and delegated tools. `lifecycle.get()` returns public RunStatus without contextRef; parsing it
 * there silently hid every attachment. Keep this binding for the tracked principal's lifetime. */
const messageAttachmentRefsByRunId = new Map<string, readonly string[]>();
/** The durable guard must still identify a chat attempt after its persisted row is deleted or
 * advanced. Public RunStatus has no contextRef, so retain the decoded message id until terminal. */
const durableMessageIdsByRunId = new Map<string, string>();
/** Per-run bridge credentials. Valid only while `principalByRunId` tracks the run, so they share its
 * lifetime; `revoke` on terminal only keeps the map small. See `run-scoped-credential.ts`. */
const runCredentials = createRunScopedCredentials({ principalOfLiveRun: ({ runId }) => disposed || revokedToolRuns.has(runId) ? undefined : principalByRunId.get(runId)?.id }, {});

/**
 * Assigned once, inside `start()`, before `app.listen()` ever binds the port — `onStarted` cannot
 * be invoked by a real request until then, so every call site below sees this populated. Typed
 * `| undefined` anyway (not asserted non-null) because `onStarted`'s own contract is "never throw
 * synchronously past the point a run is already durably started" — a theoretically-unreachable
 * `undefined` here should still fail the one run it affects, not crash the process.
 */
let attachmentStore: AttachmentStore | undefined;
// Only copies handed to a CLI live here; the store retains its own promotion/read-back records.
const stagedAttachmentCleanupByRunId = new Map<string, () => Promise<void>>();



/** The same fact with the opposite lifetime — a finished run is still readable, so its owner must
 * stay known. See `run-ownership.ts` for why the two maps are not redundant. */
const runOwners = createRunOwnerRegistry({}, {});
/** Each live run's admin screen, recorded at run start and forgotten at run end — what `GET /api/active`
 * (`@jini-ai/mcp`'s `get_active_context`) answers from. See `run-active-context.ts`. */
const runActiveContexts = createRunActiveContextStore();
/** `@jini-ai/daemon`'s `DEFAULT_TERMINAL_RETENTION_MS` (24 h, not exported), which `lifecycle` (above)
 *  runs with: how long a terminal run stays readable, and so how long its owner must stay known. */
const RUN_OWNER_RETENTION_MS = 24 * 60 * 60 * 1000;

/** H2 fix — see `agent-run-concurrency.ts`'s own doc. One instance for this process's whole
 * lifetime, registered/unregistered per run inside `onStarted` below. */
const liveRunTracker = createLiveRunTracker({}, {});

/** Defect 1 fix (2026-09-11) — see `conversation-start-lock.ts`'s own doc. One instance for this
 * process's whole lifetime; `onStarted` runs its read-decide-write session-binding section through
 * it so two near-simultaneous turns on one conversation cannot both mint a session. */
const conversationStartLock = createConversationStartLock({}, {});

/**
 * Claims `attachmentIds` against `attachmentStore` and resolves the extra `AgentExecutor.run()`
 * fields the claimed batch contributes (`imagePaths`/`extraAllowedDirs`/`uploadRoot`). Returns
 * `null` when the run should be aborted instead — this function has already called
 * `runLifecycle.finish({status: "failed", ...})` and logged why in that case, mirroring the
 * severity {@link onStarted}'s malformed-`contextRef` branch already gives a failure this early.
 * A no-op ({} fields) when `attachmentIds` is empty — the common case, no store round trip needed.
 */
async function resolveAttachmentRunFields(
  { run, attachmentIds, runLifecycle, agentId = DEFAULT_AGENT_ID }: {
    run: OnStartedContext["run"]; attachmentIds: readonly string[]; runLifecycle: OnStartedContext["lifecycle"]; agentId?: string;
  }, _optional = {},
): Promise<AttachmentRunFields | null> {
  if (attachmentIds.length === 0) return {};

  if (!attachmentStore) {
    // Structurally unreachable (see `attachmentStore`'s own doc) but fails only this run, not the
    // process, if it somehow is.
    await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: "The assistant could not start: attachments are not ready yet." }, {});
    console.error(`[agent-daemon] run ${run.id}: attachment claim requested before the attachment store was ready`);
    return null;
  }

  try {
    // Only `.path` (the opaque capability id) is ever read by `claim()` — it looks up its own
    // internal registry by that id and re-derives `name`/`kind`/`size` from what `register()`
    // recorded at upload time, never from a caller-supplied value. The placeholder `name`/`kind`
    // below satisfy `StoredAttachment`'s shape without asserting anything the store would actually
    // trust.
    const refs: StoredAttachment[] = attachmentIds.map((id) => ({ path: id, name: "", kind: "file" }));
    const originalClaim = await attachmentStore.claim({ attachments: refs, runId: run.id });
    if (originalClaim.batchDirectory === undefined) return {};
    // Register cleanup before yielding so terminalization during the copy still reaps it.
    const staging = stageAttachmentClaim({ claim: originalClaim, filesystemRoot: routeDeps.siteBinding.dir }, {});
    stagedAttachmentCleanupByRunId.set(run.id, async () => (await staging).cleanup());
    const claimed = (await staging).claim;
    const def = getAgentDef({ id: agentId });
    const byPath = new Map(claimed.attachments.map(attachment => [attachment.path, attachment]));
    const prepared = await prepareMessageAttachments({ refs: [...byPath.keys()], read: async ({ ref }) => {
      const attachment = byPath.get(ref)!;
      const bytes = await readFile(attachment.path);
      return { name: attachment.name, path: attachment.path, bytes, mimeType: sniffContentType({ bytes }) };
    } }, { fileAccess: true, imageAccess: agentReceivesImageAttachments({ def }, {}) });
    // Non-image uploads need an explicit prompt notice as well as site-contained staging; otherwise a
    // readable .md/video is never named to the agent. Generic delivery now owns that distinction.
    return { imagePaths: prepared.imagePaths, imageContents: prepared.images, attachmentNotice: prepared.notice,
      uploadRoot: claimed.batchDirectory };

  } catch (error) {
    // Fails the run outright rather than silently continuing without the image: the same severity
    // this handler already gives a malformed `contextRef` above. A user who attached a screenshot
    // and gets a run that never saw it (already-claimed, expired past `retentionMs`, or an
    // integrity check failure) would otherwise get a confusing answer about content the agent never
    // looked at, with nothing explaining why.
    const message = error instanceof Error ? error.message : String(error);
    await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: "The assistant could not start: an attached file could not be read." }, {});
    console.error(`[agent-daemon] run ${run.id}: attachment claim failed`, message);
    return null;
  }
}

const captureEarlySession = createEarlySessionCapture({ sessions: routeDeps.agentSessions, durable: routeDeps.chatRunLedger.durable, readStart: readProcessStart }, {});

const onStarted: RunStartHandler = ({ request, run: startedRun, lifecycle: runLifecycle }) => {
  const run = Object.freeze({ ...startedRun });
  // Every CLI run is busy, including headless/Aider runs with no conversationId. Terminal waits
  // release malformed starts too; preparation and cleanup below retain their own work holds.
  const releaseRun = idlePark.hold({}, {});
  void runLifecycle.waitForTerminal({ runId: run.id }).catch(() => undefined).finally(releaseRun);
  function noteFullRunInput({ runId, input }: { runId: string; input: string }, _optional = {}): void {
    if (routeDeps.aiTraceSink?.capture === "full") tracing.noteRunInput({ runId, input });
  }
  let prompt: string;
  let coldStartContext: string | undefined;
  let principal: Principal;
  let attachmentIds: readonly string[] = [];
  let pluginRefIds: readonly string[] = [];
  let model: string | undefined;
  let reasoning: string | undefined;
  let conversationId: string | undefined;
  let pageContext: RunPageContext | undefined;
  let durableMessageId: string | undefined;
  let recoveryMode: "native" | "reconstruction" | undefined;
  let recoverySessionId: string | undefined;
  // H1 fix: set once `storedSessionId` is resolved below, read by the stream subscription's
  // `shouldClearSessionOnFailedResume` check — `null` (unchanged) means this run never attempted a
  // resume in the first place, so a failed/no-sessionRef end event has nothing stale to clear.
  let attemptedResumeSessionId: string | null = null;
  try {
    // `frontendBindToken` also rides in this envelope but is deliberately not read here —
    // `createFrontendControl`'s own `resolveBindToken` above owns that field, so there is exactly
    // one place that decides which tab a run may drive.
    const decoded = parseRunStartContextRef(request.contextRef);
    coldStartContext = decoded.coldStartContext;
    prompt = decoded.prompt;
    noteFullRunInput({ runId: run.id, input: prompt });
    principal = Object.freeze({ id: decoded.principalId });
    attachmentIds = decoded.attachmentIds;
    pluginRefIds = decoded.pluginRefIds;
    model = decoded.model;
    reasoning = decoded.reasoning;
    conversationId = decoded.conversationId;
    pageContext = decoded.pageContext;
    durableMessageId = decoded.assistantMessageId;
    recoveryMode = decoded.recoveryMode;
    recoverySessionId = decoded.recoverySessionId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: "The assistant could not start: the request was malformed." }, {});
    console.error(`[agent-daemon] run ${run.id}: malformed contextRef`, message);
    return;
  }

  // One agent id for the whole run: the session subscription, attachment preparation and the
  // session binding below must all key by the same agent.
  // Saved selections can outlive an adapter; resolve once before any per-agent state is read.
  let agentId = resolveAssistantAgentId({ agentId: request.agentId });
  const pluginAbort = new AbortController();
  const unsubscribePluginCancel = runLifecycle.onCancelRequested({ runId: run.id, listener: () => pluginAbort.abort() });
  const identity = Object.freeze({ siteId, runId: run.id, principal });
  principalByRunId.set(identity.runId, identity.principal);
  toolAccessRuns.set(run.id, { runId: run.id, agentId, pluginIds: pluginRefIds });
  messageAttachmentRefsByRunId.set(run.id, attachmentIds);
  if (durableMessageId !== undefined) durableMessageIdsByRunId.set(run.id, durableMessageId);
  runOwners.record({ runId: run.id, principalId: principal.id }, {});
  // Durable admin turns settle in the API, which can observe daemon death and recovery. Only
  // standalone daemon runs report here, so a recovery attempt never becomes another logical run.
  if (durableMessageId === undefined) {
    routeDeps.tracker.capture({ name: "assistant_run_started", userId: principal.id }, { properties: { chatSurface: "daemon", logicalRunId: run.id, eventId: `assistant-start:${run.id}` } });
    void runLifecycle.stream({ runId: run.id, onEvent: event => {
      if (event.kind === "end") routeDeps.tracker.capture({ name: "assistant_run_finished", userId: principal.id }, { properties: { chatSurface: "daemon", logicalRunId: run.id, ...(event.payload.status ? { outcome: event.payload.status } : {}), eventId: `assistant-finish:${run.id}` } });
    } });
  }

  // H2 fix (`agent-run-concurrency.ts`): registered synchronously, in this same
  // never-`await`-ed-yet prefix, so a second `onStarted` call for the same conversation — however
  // close together the two requests arrive — is guaranteed to observe this run as already live.
  // A no-op when `conversationId` is absent, matching the stream subscription below: there is
  // nothing to key concurrency by for a daemon client other than the admin chat pane.
  if (conversationId !== undefined) liveRunTracker.register({ conversationId: conversationId, runId: run.id }, {});
  if (pageContext !== undefined) runActiveContexts.record(run.id, pageContext);
  void runLifecycle.waitForTerminal({ runId: run.id }).catch(() => undefined).finally(() => {
    const releaseCleanup = idlePark.hold({}, {});
    pluginAbort.abort();
    unsubscribePluginCancel();
    siteTools.finish({ runId: run.id });
    principalByRunId.delete(run.id);
    chatSettingsByRunId.delete(run.id);
    toolAccessRuns.delete(run.id);
    revokedToolRuns.delete(run.id);
    messageAttachmentRefsByRunId.delete(run.id);
    durableMessageIdsByRunId.delete(run.id);
    runCredentials.revoke({ runId: run.id }, {});
    runActiveContexts.forget(run.id);
    // The owner must outlive the run's end (a finished run is still read and replayed), but not the
    // lifecycle's own terminal record, or this map grows for the daemon's lifetime. Once forgotten,
    // a still-present run is denied to everyone (`requireRunOwnership` fails closed), never opened.
    const retention = setTimeout(() => {
      ownerRetentionTimers.delete(retention);
      runOwners.forget({ runId: run.id }, {});
      cleanupFailures.delete(run.id);
    }, RUN_OWNER_RETENTION_MS).unref();
    ownerRetentionTimers.add(retention);
    if (conversationId !== undefined) liveRunTracker.unregister({ conversationId: conversationId, runId: run.id }, {});
    // Safe to call even for a run that claimed nothing (`AttachmentStore.cleanupRun`'s own
    // contract) — always wired, not only when `attachmentIds` was non-empty, so a run that failed
    // before reaching the claim step below still releases anything a *retry* of the same run id
    // could theoretically have claimed. Best-effort: a cleanup failure must not resurface as a run
    // failure this late in the run's life, and the store's own `retentionMs`/`pruneExpired` is the
    // backstop if this never runs at all (process crash, etc.).
    const cleanupStaged = stagedAttachmentCleanupByRunId.get(run.id);
    stagedAttachmentCleanupByRunId.delete(run.id);
    const stagedCleanup = cleanupStaged?.().catch(() => console.error('[agent-daemon] staged attachment cleanup failed'));
    const claimedCleanup = attachmentStore?.cleanupRun({ runId: run.id }).catch((error: unknown) => {
      console.error(`[agent-daemon] run ${run.id}: attachment cleanup failed`, error);
    });
    void Promise.allSettled([stagedCleanup, claimedCleanup]).finally(releaseCleanup);
  });

  // Session-resume capture (Gap 5, `RunEndPayload.sessionRef` — `@jini-ai/protocol`'s doc on that
  // field): watches this run's own event stream for its terminal `end` event and persists whatever
  // agent-CLI session id it reports, so the NEXT turn in this conversation can resume it instead of
  // spawning cold (`agent-session-resume.ts`). A no-op subscription when `conversationId` is absent
  // — any daemon client other than the admin chat pane, today — since there is nowhere to key the
  // stored id by. Subscribed here, before `agentExecutor.run()` is ever called below, so a run that
  // fails immediately after spawn still has its `end` event observed (`stream()`'s own contract:
  // subscribe-before-replay never loses an event to timing).
  if (conversationId !== undefined) {
    const resolvedConversationId = conversationId;
    void runLifecycle.stream({ runId: run.id, onEvent: (event) => {
      if (event.kind === "error") {
        console.error(formatRunErrorLogLine({ runId: run.id, payload: event.payload }));
      }
      // Terminal-outcome log line (2026-09-06 chat-death investigation). This subscription already
      // exists, already sees every `end` event, and already has `run.id` in scope — so this is the
      // cheapest possible place to write down HOW a run ended. Until now nothing did: the daemon
      // logged a run that `failed to start` (see the `.catch` at the bottom of this function) but
      // said nothing at all about a run that started fine and then died, which is exactly the case
      // an operator cannot otherwise diagnose. `@jini-ai/daemon`'s `finish()` emits this `end` event
      // as the ONLY record of the terminal status, the event log backing it is in-memory
      // (`createInMemoryEventLog()` above), and the admin client discards the status — so without
      // this line the exit code exists nowhere durable and nowhere visible.
      if (event.kind === "end") {
        const line = formatRunEndLogLine({ runId: run.id, payload: event.payload, agentId: agentId, conversationId: resolvedConversationId, resumeAttempted: attemptedResumeSessionId !== null });
        if (event.payload.status === "succeeded") console.log(line);
        else console.error(line);
      }
      // Status carries capture-style locators (Codex/opencode) before end. A killed process must
      // not lose its locator; generation checks also prevent a stale attempt changing the session.
      const releaseSessionSave = idlePark.hold({}, {});
      void captureEarlySession({ event, runId: run.id, conversationId: resolvedConversationId, agentId: agentId }, { durableBinding: durableMessageId !== undefined })
        .catch((error: unknown) => console.error(`[agent-daemon] run ${run.id}: failed to persist agent session id`, error)).finally(releaseSessionSave);
      if (extractSessionRefFromEndEvent({ event: event }, {}) !== undefined) return;
      // H1 fix: this run attempted `--resume <attemptedResumeSessionId>` and reached its terminal
      // `end` event without the CLI ever reconfirming a session id — the stored id is unconfirmed
      // at best, and per this repo's own daemon-restarted-from-a-different-cwd hazard, frequently
      // dead. Clear it so the NEXT turn falls back to a cold start instead of retrying the same
      // dead id forever. See `shouldClearSessionOnFailedResume`'s own doc for the full condition.
      if (shouldClearSessionOnFailedResume({ event: event, attemptedResumeSessionId: attemptedResumeSessionId }, {})) {
        const releaseSessionClear = idlePark.hold({}, {});
        const cleared = durableMessageId && routeDeps.chatRunLedger.durable
          ? routeDeps.chatRunLedger.durable.clearSession({ runId: run.id, sessionId: attemptedResumeSessionId! }, {})
          : routeDeps.agentSessions.clearSessionId({ conversationId: resolvedConversationId, agentId: agentId });
        void cleared.catch((error: unknown) => {
          console.error(`[agent-daemon] run ${run.id}: failed to clear dead agent session id`, error);
        }).finally(releaseSessionClear);
      }
    } });
  }

  // Bind this run to the tab that started it, so `page.*` calls have an addressee. A run has
  // exactly one originating surface, which is what makes the routing unambiguous with several
  // admin tabs open — there is no heuristic that could pick a window nobody is watching.
  //
  // A failed bind never fails the run (see `onBindError` above): the agent simply cannot drive the
  // page and says so on each attempt, where killing an otherwise-working session over one optional
  // channel would turn a degraded run into no run at all. The facade also releases the binding on
  // terminal, so a long-lived tab does not accumulate bindings for runs that ended.
  frontendControl.bindOnStarted({ request, run, lifecycle: runLifecycle });

  // Refresh the custom-instructions cache before starting the agent, not concurrently with it: this
  // is the one point in a run's lifecycle before `systemOverlay()` is called (synchronously, inside
  // `run()`'s own argv-building step) where an `await` is still possible. Sequencing here — rather
  // than racing the refresh against `run()` and hoping the internal timing works out — makes the
  // guarantee independent of `@jini-ai/daemon`'s internal ordering. `refresh()` never rejects (see
  // `custom-instructions.ts`), so this adds no new failure path before `run()` is even reached.
  const releasePreparation = idlePark.hold({}, {});
  // Static stage names identify the failing preparation boundary without copying the request.
  let startupStage = 'custom instructions';
  void customInstructionsCache
    .refresh()
    .then(async () => {
      // One generic preparation turns every claimed file into image pixels or a file notice.
      // Runtime wire adapters decide how to carry those pixels; the CMS adapter owns authorization.
      startupStage = 'attachment preparation';
      const attachmentRunFields = await resolveAttachmentRunFields({ run, attachmentIds, runLifecycle, agentId }, {});
      if (!attachmentRunFields) return;
      pluginAbort.signal.throwIfAborted();
      startupStage = 'Agent Plugin preparation';
      await siteTools.start({ runId: run.id, principalId: principal.id });
      const pluginPreparation = await prepareSitePlugins({}, {});
      if (pluginPreparation.prefix === null) {
        await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: "The assistant could not start: a selected Agent Plugin could not be loaded." }, {});
        return;
      }
      const pluginPromptPrefix = pluginPreparation.prefix;

      /** A durable memory attempt reads its site's locator: local memory sessions deliberately
       * survive only this daemon, while early capture writes at the site owner. Called inside the
       * existing conversation lock. O(1), one session lookup; no identity comes from wire fields. */
      async function readPriorSessionId(_required: Record<string, never>, _options = {}): Promise<string | null> {
        if (durableMessageId && routeDeps.getSessionForAttempt) return routeDeps.getSessionForAttempt({ runId: run.id });
        if (conversationId === undefined) return null;
        return routeDeps.agentSessions.getSessionId({ conversationId, agentId });
      }

      /*
       * This run's entire session-binding decision, in ONE function so it can be handed to
       * `conversationStartLock` as a single critical section (Defect 1, 2026-09-11). It reads the
       * stored id, applies the H2 concurrency gate, refuses the run when starting cold would
       * silently drop history, mints and persists a fresh id when this is a genuine cold start, and
       * returns the `AgentExecutor.run()` session fields that decision produces — `null` meaning
       * "refused, the run is already finished as failed, stop."
       *
       * Extracted as its own function originally for complexity (2026-09-03 — this handler's async
       * continuation was at cyclomatic 11 against this repo's 9 ceiling) so `onStarted`'s own branch
       * count reflects sequencing, not this decision's own branches. Declared and called right here,
       * inline, rather than hoisted to module scope: this file's own wiring tests
       * (`agent-daemon-server.session-resume-wiring.unit.test.ts` and
       * `agent-daemon-server.session-binding-wiring.unit.test.ts`, which prove ordering by reading
       * this file's raw SOURCE rather than importing it — see their docs for why) assert that
       * `routeDeps.agentSessions.getSessionId(`/`liveRunTracker.hasConcurrentLiveRun(`/
       * `routeDeps.agentSessions.setSessionId(` appear, in this relative order, strictly before
       * `agentExecutor.run` below; keeping this body here preserves that ordering byte-for-byte.
       */
      async function resolveSessionBinding(): Promise<RunSessionBinding | null> {
        // Resolved AFTER attachments/prompt, same "no ordering dependency either way" reasoning as
        // the plugin prefix above. Looked up unconditionally (unlike before the H2-context-loss fix
        // below, which needs to know whether a session exists even when `hasConcurrentLiveRun` will
        // refuse to use it) — `null` (no conversationId at all, or nothing on record yet) is what
        // makes `resolveResumeSessionField` a no-op below, so this run starts cold. Since the
        // Defect 1 fix a cold start is no longer id-less: `resolveHostMintedSessionId` below mints
        // one and persists it before the CLI is spawned, which is what this comment used to say was
        // deliberately NOT happening.
        const priorSessionId = await readPriorSessionId({}, {});
        // Recovery is authoritative about native resume (see `resolveStoredSessionId`).
        const storedSessionId = resolveStoredSessionId({ recoveryMode, recoverySessionId, priorSessionId }, {});
        // A run the user just stopped is still exiting for a few seconds. Wait for it, so a message
        // sent right after Stop resumes the session instead of being refused (2026-09-27).
        if (conversationId !== undefined) {
          await waitForStoppingRuns({ tracker: liveRunTracker, lifecycle: runLifecycle, conversationId, runId: run.id }, { timeoutMs: STOPPING_RUN_WAIT_MS });
        }
        // The H2 fix: refusing to resume when another run for this conversation is already live
        // means at most one process ever holds `--resume <id>` for that CLI session at a time,
        // closing the two-live-`--resume`-processes-on-one-transcript-file hazard even though the
        // two runs' `end` events can still race each other for the store's last write — see
        // `agent-run-concurrency.ts`'s own module doc for the full reasoning and why an in-process
        // tracker needs no special handling across a daemon restart.
        const hasConcurrentLiveRun = conversationId !== undefined && liveRunTracker.hasConcurrentLiveRun({ conversationId: conversationId, runId: run.id }, {});

        // H2-context-loss fix: H2 alone silently drops conversation history for a
        // `carriesOwnMemory` agent — see `wouldForcedColdStartLoseConversationContext`'s own doc for
        // the full mechanism. The client already sent only the bare latest message trusting this run
        // to resume; forcing it cold here would answer with none of the conversation `storedSessionId`
        // proves actually exists. Refuse the run outright (same "fail loud, not silently degrade"
        // precedent as the attachment-claim-failure branch above) rather than let the CLI answer
        // blind.
        if (
          wouldForcedColdStartLoseConversationContext({
            storedSessionId,
            hasConcurrentLiveRun,
            carriesOwnMemory: agentCarriesOwnMemory({ agentId: agentId }, {}),
          }, {})
        ) {
          await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: CONCURRENT_RUN_REFUSAL_MESSAGE }, {});
          console.error(
            `[agent-daemon] run ${run.id}: refused — conversation "${conversationId}" has a live concurrent run holding agent "${agentId}"'s resumable session, and this agent carries its own memory; starting cold would silently drop conversation history`,
          );
          return null;
        }

        const effectiveResumeSessionId = hasConcurrentLiveRun ? null : storedSessionId;
        attemptedResumeSessionId = effectiveResumeSessionId;

        /*
         * Defect 1 fix (2026-09-11). BEHAVIOR CHANGE, stated explicitly: a cold start for a def
         * that accepts a host-minted session id now spawns the CLI under an id THIS process chose
         * and wrote down first, instead of letting the CLI choose one and hoping the run survives
         * long enough to report it back on its terminal `end` event.
         *
         * Why the old shape lost conversations: `extractSessionRefFromEndEvent` (the only writer
         * before this) can only run if an `end` event actually arrives. A run killed by a daemon
         * respawn, or one that fails in its first few hundred milliseconds, never produces one —
         * so the conversation stayed unbound even though the CLI had already created a real
         * session, and the NEXT turn started cold and answered with none of the history.
         *
         * The residual risk, disclosed rather than hidden: if the CLI dies before creating its own
         * session file, the id persisted here names a session that does not exist, and the next
         * turn's `--resume` fails. That failure is visible (the run ends failed) and self-healing
         * — `shouldClearSessionOnFailedResume` clears the dead id, so the turn after starts cold.
         * That is a strictly better failure than the silent, permanent history loss it replaces.
         */
        const hostMintedSessionId = resolveHostMintedSessionId({
          conversationId,
          effectiveResumeSessionId,
          acceptsHostMintedSessionId: agentAcceptsHostMintedSessionId({ agentId: agentId }, {}),
          mint: randomUUID,
        }, {});
        if (conversationId !== undefined && hostMintedSessionId !== null) {
          // Awaited, and inside the conversation lock: the whole point is that the binding is
          // durable BEFORE the CLI is spawned. A failure here is logged and the run continues —
          // losing resumability for one conversation is the pre-fix behavior, where failing the
          // run outright would cost the user a turn over a bookkeeping write.
          const prepared = durableMessageId && routeDeps.chatRunLedger.durable
            ? routeDeps.chatRunLedger.durable.captureSession({ runId: run.id, sessionId: hostMintedSessionId, confirmed: false }, {})
            : routeDeps.agentSessions.setSessionId({ conversationId, agentId, sessionId: hostMintedSessionId });
          await prepared.catch((error: unknown) => {
            console.error(`[agent-daemon] run ${run.id}: failed to persist minted agent session id at dispatch`, error);
          });
        }

        return {
          agentId,
          sessionFields: { ...resolveResumeSessionField({ storedSessionId: effectiveResumeSessionId }, {}), ...resolveNewSessionField({ hostMintedSessionId: hostMintedSessionId }, {}) },
        };
      }
      // Serialized per conversation (`conversation-start-lock.ts`): `resolveSessionBinding` is a
      // read-modify-write over `assistant_agent_sessions` with an `await` in the middle, so two
      // near-simultaneous turns on one conversation could otherwise both observe an empty session
      // slot and both mint — forking the conversation exactly the way the terminal-event-only write
      // did. Deliberately does NOT cover `agentExecutor.run` below: holding the lock across a whole
      // agent run would queue a second tab's turn behind it for minutes with no feedback.
      startupStage = 'tool access consent';
      const admitted = siteTools.withRun({ runId: run.id, fn: () => admittedToolSources({ tools: visibleRegistry.list({}) }) });
      toolAccessRuns.set(run.id, { runId: run.id, agentId, ...admitted, pluginIds: [...new Set([...pluginRefIds, ...admitted.pluginIds])] });
      const selectedAgent = await prepareRunToolAccess({ selectedAgentId: agentId });
      if (selectedAgent === null) return;
      agentId = selectedAgent;
      toolAccessRuns.set(run.id, { ...toolAccessRuns.get(run.id)!, agentId });
      startupStage = 'session binding';
      const sessionBinding = await conversationStartLock.run({ conversationId: conversationId, critical: resolveSessionBinding }, {});
      if (sessionBinding === null) return;
      // The browser cannot know whether the daemon still has a native session to resume.
      prompt = selectRunHistoryPrompt({ prompt, coldStartContext, resumeSessionId: sessionBinding.sessionFields.resumeSessionId,
        carriesOwnMemory: agentCarriesOwnMemory({ agentId: sessionBinding.agentId }, {}) }, {});
      // Select history before decorating it, so cold starts retain the same page, attachment and
      // plugin instructions as resumes.
      // `<<SUBAGENT_DISPATCH>>` is AGENTS.md's own documented marker (Mandatory Startup section,
      // detection priority 1) for "skip the whole AI-Dev-Shop startup ceremony — this is a
      // dispatched subagent receiving a task prompt, not an interactive human session." Without it,
      // every chat-pane run re-runs the full dev-tooling bootstrap (reads AGENTS.md, prints the
      // startup banner, offers to install slash commands) before touching the user's actual request
      // — confirmed live, burning real turns on a product-facing feature that has nothing to do with
      // this repo's own AI-Dev-Shop pipeline.
      // The admin screen this message was sent from goes AFTER the marker (the marker only works as
      // the prompt's first line) and directly before the operator's words, so "this page" has
      // something to refer to — see `run-page-context.ts`. `""` (no context) leaves the prompt as is.
      prompt = `<<SUBAGENT_DISPATCH>>\n\n${assemblePromptWithPluginPrefix(prompt, buildPageContextPromptBlock(pageContext))}`;
      prompt += attachmentRunFields.attachmentNotice ?? "";
      // Experimental delivery-mechanism measurement (see capability-manifest-prefix.ts's own header) —
      // prepended BEFORE the plugin prefix. Off by default; a no-op unless a probe sets
      // `TOVU_CAPABILITY_MANIFEST_ARM` for this process.
      prompt = assemblePromptWithPluginPrefix(prompt, buildCapabilityManifestPrefix(resolveCapabilityManifestArm(env)));
      // What this boot REFUSED to admit from external MCP servers, in the one channel a model does
      // not have to go looking for. Not a tool, deliberately: a model that does not know it is
      // missing anything never calls the tool that would tell it — see `refusal-notice.ts`. `""`
      // on a clean boot, in which case `assemblePromptWithPluginPrefix` is a no-op.
      prompt = assemblePromptWithPluginPrefix(prompt, pluginPreparation.refusalPrefix);
      prompt = assemblePromptWithPluginPrefix(prompt, pluginPromptPrefix);
      if (!(await durableAttemptStillOwnsAnswer())) {
        await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: "This execution attempt no longer owns the answer." }, {}); return;
      }
      startupStage = 'CLI launch';
      await launchAgentRun({ sessionBinding, attachmentRunFields }, {});
    })
    // `AgentExecutor.run()` already transitions the run to `'failed'` via `lifecycle.finish()` on
    // every failure path before it rejects — this catch only guards against an unhandled rejection.
    // (The attachment-claim failure branch above finishes the run itself and returns before ever
    // reaching `run()`, so it does not rely on this catch for that.)
    .catch((error: unknown) => {
      console.error(`[agent-daemon] run ${run.id} failed to start`, error);
      // A startup rejection must terminalize its attempt so its slot and credentials release.
      void failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: "The assistant could not start this execution attempt.",
        startup: { stage: startupStage, error } }, {});
    }).finally(releasePreparation);

  /** The server owns pinned guidance and automatic consent, including later tool-triggered
   * preparation. No controller or plugin lifecycle is constructed in this process. Transport
   * failure remains optional for automatic guidance, but an explicit pinned pick fails closed. */
  async function prepareSitePlugins(_required: Record<string, never>, _optional = {}): Promise<{ prefix: string | null; refusalPrefix: string }> {
    try { return await siteTools.preflight({ runId: run.id, signal: pluginAbort.signal }); }
    catch {
      console.warn('[agent-plugins] automatic preflight unavailable');
      return { prefix: pluginRefIds.length ? null : "", refusalPrefix: "" };
    }
  }

  /** A durable attempt must still own its answer when the agent is about to launch: a stop or a
   * newer attempt may have taken over while this run was preparing. A non-durable run always does. */
  async function durableAttemptStillOwnsAnswer(): Promise<boolean> {
    if (!durableMessageId || !routeDeps.chatRunLedger.durable) return true;
    const attempt = await routeDeps.chatRunLedger.durable.find({ runId: run.id }, {});
    return durableAttemptOwnsAnswer({ attempt }, {});
  }

  /** Resolves this run's native-tool grant from one launch snapshot and dispatches the agent CLI.
   * Declared after the continuation that calls it so the session binding above stays textually
   * ahead of `agentExecutor.run` (the wiring tests read this file's source in order). */
  async function launchAgentRun(
    { sessionBinding, attachmentRunFields }: { sessionBinding: RunSessionBinding; attachmentRunFields: AttachmentRunFields }, _optional = {},
  ): Promise<void> {
    startupStage = 'native tool policy';
    const access = await verifyLaunchToolPolicy({ agentId: sessionBinding.agentId });
    if (!access) return;
    const { snapshot, plan } = access;
    const { isOwner, def, policy, nativeCapabilities } = snapshot;
    warnRunFilesystemLimit({ agentId: sessionBinding.agentId, shell: nativeCapabilities.shell });
    const chatSettings = recordRunToolSnapshot({ snapshot, plan, agentId: sessionBinding.agentId });
    await emitNoToolsNotice({ agentId: sessionBinding.agentId, snapshot, bridged: plan.bridged });
    const nativeToolAccess = Object.values(nativeCapabilities).some(Boolean);
    startupStage = 'tool-gap audit subscription';
    await observeRunToolGaps({ isOwner, agentId: sessionBinding.agentId }, {});
    // One launch snapshot supplies every dimension; edits affect only subsequent runs.
    const subagentsEnabled = nativeCapabilities.subagents;
    // Fresh per-person runtime preferences; a failed read falls back to the registered defaults.
    startupStage = 'runtime preferences';
    const runtimeLaunch = await resolveAssistantRuntimeLaunch({ deps: { settingsRepo: routeDeps.settingsRepo, getEffective: routeDeps.getEffective,
      settingsReady: routeDeps.siteTitleReady, workspaceId: routeDeps.workspaceId }, principalId: principal.id, agentId: sessionBinding.agentId, subagentsEnabled, isOwner }, { getDef: getAgentDef, probeChrome: probeAssistantChrome });
    startupStage = 'shell environment';
    const parityEnv = nativeCapabilities.loginEnvironment ? await readLoginShellEnvironment({ baseEnv: env,
      excludedPrefixes: ["TOVU_", "JINI_"], excludedKeys: ["DATABASE_URL"], excludedSuffixes: ["_ROOT_KEY"] }, {}) : undefined;
    // Owner 2026-10-27: the folder picked with the composer's folder control is readable, never writable.
    const pickedFolder = getCustomFsRoot(routeDeps.workspaceId, { siteDir: routeDeps.siteBinding.dir });
    const runGuidance = { ...runtimeLaunch.guidance, chatSettings, ...(pickedFolder ? { pickedFolder } : {}) };
    startupStage = 'CLI bridge preparation';
    if (!(await prepareCliLaunch({ def, allowed: nativeCapabilities.userMcp }, {}))) return;
    if (!(await runToolAccessIsLive())) return;
    const executeRun = () => agentExecutor.run({
      runId: run.id,
      agentId: sessionBinding.agentId,
      prompt,
      // In dev the server starts from the repo root, where CLIs auto-load Codex AGENTS.md
      // and Claude CLAUDE.md; use the site so the in-app assistant avoids developer bootstrap.
      // 2026-10-23: the former dev override could widen this boundary to the whole repo.
      cwd: routeDeps.siteBinding.dir,
    }, {
      filesystemRoot: routeDeps.siteBinding.dir,
      permissionMode: policy.permissionMode ?? resolvePermissionMode(),
      nativeToolAccess,
      nativeCapabilities,
      cliParity: nativeToolAccess,
      ...(parityEnv ? { env: parityEnv } : {}),
      // Explicit capability denies are applied by the runtime after this legacy native grant.
      // Read path denies remain defense in depth for owner-authorized local filesystem access.
      disallowedTools: resolveAssistantDisallowedTools({ agentId: sessionBinding.agentId, subagentsEnabled, nativeToolAccess }, {}),
      // Site chat excludes personal hooks and permissions even when personal configuration is on.
      // Keep the locked settings policy when the owner switches personal configuration off.
      // See ASSISTANT_SETTING_SOURCES for why these layers are excluded in locked runs.
      ...(nativeCapabilities.userSettings ? {} : { settingSources: ASSISTANT_SETTING_SOURCES }),
      // Site runs retain the host's auto-memory/no-system-search policy rather than user hooks; Full CLI cannot omit it.
      settings: resolveAssistantRunSettings((env.HOME ?? env.USERPROFILE ?? homedir()), existsSync),
      ...(model !== undefined ? { model } : {}),
      // Same spread shape as `model` immediately above: `AgentExecutor.run()` passes it into the
      // def's own `buildArgs` options, which is where it becomes real argv.
      ...(reasoning !== undefined ? { reasoning } : {}),
      ...attachmentRunFields,
      ...(pickedFolder ? { readOnlyExtraDirs: [pickedFolder] } : {}),
      // Both session fields at once — `resolveResumeSessionField(effectiveResumeSessionId)` for a
      // resumed turn and `resolveNewSessionField(hostMintedSessionId)` for a cold one. They are
      // mutually exclusive by construction (`resolveHostMintedSessionId` mints only when there is
      // nothing to resume), and both are empty objects when they do not apply, so exactly one key
      // ever reaches `AgentExecutor.run()`. Assembled inside `resolveSessionBinding` above so the
      // id that was persisted and the id handed to the CLI can never drift apart.
      ...sessionBinding.sessionFields,
      // Claude in Chrome: `chromeIntegration` (+ its MCP server on the allow-list) for a supporting
      // runtime, nothing otherwise. Every deny above still applies; see `assistant-runtime-guidance.ts`.
      ...runtimeLaunch.runOptions,
    });
    const runWithCapabilities = () => assistantCliCapabilitiesContext.run(nativeCapabilities,
      () => siteTools.withRun({ runId: run.id, fn: executeRun }));
    if (disposed) {
      // Cancellation records intent; no executor exists yet to emit the terminal event and
      // release this run's activity hold after withdrawal during preparation.
      await runLifecycle.finish({ runId: run.id, status: "cancelled", code: null, signal: null, resumable: false });
      return;
    }
    startupStage = 'CLI execution';
    await assistantRuntimeGuidanceContext.run(runGuidance,
      () => assistantNativeToolsContext.run(nativeToolAccess, runWithCapabilities));
  }

  function warnRunFilesystemLimit({ agentId, shell }: { agentId: string; shell: boolean }): void {
    if (agentId === 'claude' && process.platform === 'win32' && shell) console.warn('[agent-daemon] shell is not folder-limited on this platform');
  }

  async function verifyLaunchToolPolicy({ agentId }: { agentId: string }) {
    const snapshot = await resolveRunNativePolicy({ agentId });
    if (!(await runToolAccessIsLive())) return null;
    const plan = assistantRunPlan({ snapshot, installed: !!snapshot.def && !!resolveAgentLaunch({ def: snapshot.def }).launchPath });
    if (plan.verdict !== 'RUN') {
      await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: 'Tool access changed before this answer started. Send your message again to review it.' }, {}); return null;
    }
    return { snapshot, plan };
  }

  function recordRunToolSnapshot({ snapshot, plan, agentId }: {
    snapshot: Awaited<ReturnType<typeof resolveRunNativePolicy>>; plan: Extract<ReturnType<typeof assistantRunPlan>, { verdict: 'RUN' }>; agentId: string;
  }) {
    const tools = siteTools.withRun({ runId: run.id, fn: () => visibleRegistry.list({}) });
    const sources = admittedToolSources({ tools });
    toolAccessRuns.set(run.id, { runId: run.id, agentId, ...sources, pluginIds: [...new Set([...pluginRefIds, ...sources.pluginIds])] });
    const facts = assistantRunToolFacts({ agentId, snapshot, plan, tools, ...(model ? { model } : {}), ...(reasoning ? { effort: reasoning } : {}) });
    chatSettingsByRunId.set(run.id, facts);
    return facts;
  }

  async function emitNoToolsNotice({ agentId, snapshot, bridged }: { agentId: string; snapshot: Awaited<ReturnType<typeof resolveRunNativePolicy>>; bridged: boolean }): Promise<void> {
    const key = `${conversationId ?? run.id}:${agentId}`;
    if (bridged || noToolsNotices.has(key)) return;
    noToolsNotices.add(key);
    const name = snapshot.def?.name ?? agentId;
    await runLifecycle.emit({ runId: run.id, input: { event: 'agent', data: { type: 'status', label: 'no_tools', detail: `${name} can't use tools provided here. It works with its own.` } } });
  }

  /** Fresh host-gated selected-agent grants, shared with the owner consent click. */
  async function resolveRunNativePolicy({ agentId }: { agentId: string }, _optional = {}) {
    return readAssistantRunToolPolicy({ deps: routeDeps, principalId: principal.id, agentId, env, getDef: getAgentDef });
  }

  function runToolPolicyInput({ agentId }: { agentId: string }) {
    return { deps: routeDeps, principalId: principal.id, agentId, env, getDef: getAgentDef };
  }

  async function runToolAccessIsLive(): Promise<boolean> {
    const current = await runLifecycle.get({ runId: run.id });
    if (current && pluginAbort.signal.aborted && !isTerminalRunState({ state: current.state })) {
      await runLifecycle.finish({ runId: run.id, status: 'cancelled', code: null, signal: null, resumable: false });
      return false;
    }
    return !disposed && !pluginAbort.signal.aborted && !revokedToolRuns.has(run.id) && !!current && !isTerminalRunState({ state: current.state });
  }

  /** Consent precedes session binding, persistent repair, per-run tokens and CLI spawn. */
  async function prepareRunToolAccess({ selectedAgentId }: { selectedAgentId: string }): Promise<string | null> {
    let selected = selectedAgentId;
    while (await runToolAccessIsLive()) {
      const decision = await prepareAgentToolChoice({ selected });
      if (decision === null || decision === true) return decision === true ? selected : null;
      selected = decision;
    }
    return null;
  }

  async function prepareAgentToolChoice({ selected }: { selected: string }): Promise<string | true | null> {
    const snapshot = await resolveRunNativePolicy({ agentId: selected });
    const inventory = await assistantInventory.listAssistantAgents();
    const detected = inventory.find(agent => agent.id === selected);
    const plan = assistantRunPlan({ snapshot, installed: !!snapshot.def && !!resolveAgentLaunch({ def: snapshot.def }).launchPath,
      ...(detected?.authStatus ? { auth: detected.authStatus } : {}) });
    if (plan.verdict === 'RUN') return true;
    if (plan.verdict === 'SETUP' || !snapshot.def) return prepareUnavailableToolChoice({ selected, snapshot, plan, inventory });
    const result = await askForRunToolAccess({ snapshot, keys: plan.keys, inventory });
    if (result.status === 'alternative') return result.agentId;
    if (result.status === 'allowed') return selected;
    await runLifecycle.finish({ runId: run.id, status: 'cancelled', code: null, signal: null, resumable: false }); return null;
  }

  async function prepareUnavailableToolChoice({ selected, snapshot, plan, inventory }: {
    selected: string; snapshot: Awaited<ReturnType<typeof resolveRunNativePolicy>>; plan: ReturnType<typeof assistantRunPlan>;
    inventory: Awaited<ReturnType<typeof assistantInventory.listAssistantAgents>>;
  }): Promise<string | null> {
    const name = snapshot.def?.name ?? selected;
    const message = assistantToolSetupMessage({ name, reason: plan.verdict === 'SETUP' ? plan.reason : 'not_installed',
      ...(snapshot.lock ? { lock: snapshot.lock } : {}), ...('keys' in plan ? { keys: plan.keys } : {}) });
    const alternatives = await qualifiedRunAlternatives({ inventory, selectedAgentId: selected, snapshot });
    if (alternatives.length) {
      const alternative = await withRunToolAccessCard({ ask: ({ ctx, emitSurface }) => requestAssistantToolAlternative({ name, message,
        ctx, surfaces: { surfaceExchanges }, alternatives, isLive: runToolAccessIsLive }, { emitSurface }) });
      if (alternative) return alternative;
    }
    await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message }, {});
    return null;
  }

  async function askForRunToolAccess({ snapshot, keys, inventory }: {
    snapshot: Awaited<ReturnType<typeof resolveRunNativePolicy>>; keys: readonly string[];
    inventory: Awaited<ReturnType<typeof assistantInventory.listAssistantAgents>>;
  }) {
    const selected = snapshot.def!;
    const alternatives = await qualifiedRunAlternatives({ inventory, selectedAgentId: selected.id, snapshot });
    return withRunToolAccessCard({ ask: ({ ctx, emitSurface }) => requestAssistantToolConsent({ def: selected, keys, surfaces: { surfaceExchanges }, ctx,
      isLive: runToolAccessIsLive,
      readFresh: () => routeDeps.readToolConsentSnapshot({ runId: run.id, agentId: selected.id }),
      allowSelected: input => runToolAccessIsLive().then(live => live ? routeDeps.allowRunTools({ runId: run.id, ...input }) : false),
    }, { alternatives, emitSurface }) });
  }

  /** Both access and setup cards use the existing principal-bound exchange event stream. */
  async function withRunToolAccessCard<T>({ ask }: {
    ask: (input: { ctx: ToolExecutionContext; emitSurface: SurfaceEmitter }) => Promise<T>;
  }): Promise<T> {
    const toolUseId = randomUUID();
    await runLifecycle.emit({ runId: run.id, input: { event: 'agent', data: { type: 'tool_use', id: toolUseId, name: 'settings_set_value', input: {} } } });
    try {
      return await ask({ ctx: { executionId: toolUseId, principal, run: { id: run.id }, input: {}, signal: pluginAbort.signal },
        emitSurface: async emission => { await runLifecycle.emit({ runId: run.id, input: { event: 'agent', data: { ...emission.payload, type: emission.channel, toolUseId } as RunAgentPayload } }); },
      });
    } finally {
      await runLifecycle.emit({ runId: run.id, input: { event: 'agent', data: { type: 'tool_result', toolUseId, content: 'Tool access request reviewed.' } } });
    }
  }

  function qualifiedRunAlternatives({ inventory, selectedAgentId, snapshot }: {
    inventory: Awaited<ReturnType<typeof assistantInventory.listAssistantAgents>>; selectedAgentId: string;
    snapshot: Awaited<ReturnType<typeof resolveRunNativePolicy>>;
  }) {
    // Reuse the launch snapshot for choices; the selected agent is read fresh before dispatch.
    const alternatives = [];
    for (const agent of inventory) {
      if (agent.id === selectedAgentId || !agent.available || agent.authStatus === 'missing') continue;
      const def = getAgentDef({ id: agent.id });
      const effective = resolveAssistantCliPermissions({ isOwner: snapshot.isOwner, env, settings: snapshot.settings, agentId: agent.id }, { hostSignals: resolveHostSignals({ env }) });
      const policy = resolveNativeToolPolicy({ def: def ?? {}, policy: { nativeToolAccess: effective.enabled, nativeCapabilities: effective.capabilities } });
      const candidate = { ...snapshot, def, effective, policy, nativeCapabilities: effective.capabilities };
      if (assistantRunPlan({ snapshot: candidate, installed: true }).verdict === 'RUN') alternatives.push({ agentId: agent.id, name: agent.name });
    }
    return alternatives;
  }

  /** Attach the owner's tool-gap audit to this run; subscription errors abort startup. O(1). */
  async function observeRunToolGaps({ isOwner, agentId }: { isOwner: boolean; agentId: string }, _optional = {}): Promise<void> {
    // Subscribe before spawn, independently of any browser watch. Owner fallbacks survive reloads.
    if (isOwner) {
      const gaps = createToolGapCollector({ sink: routeDeps.toolAttemptAuditSink,
        workspaceId: routeDeps.workspaceId, principalId: principal.id, site: routeDeps.siteBinding.dir,
        chatId: conversationId ?? run.id, runId: run.id, provider: agentId,
        redact: text => redactSecretShapes({ text }).text,
      }, { onError: () => console.error("[tool-gaps] audit write failed") });
      await runLifecycle.stream({ runId: run.id, onEvent: event => gaps.observe({ event }, {}) });
    }
  }

  /** Verify/repair CLI bridge registration before emitting its access note. A failed recovery
   * terminalizes the run and returns false; lifecycle emission errors propagate. O(config bytes). */
  async function prepareCliLaunch({ def, allowed }: { def: ReturnType<typeof getAgentDef>; allowed: boolean }, _optional = {}): Promise<boolean> {
    if (def?.externalMcpInjection === 'env-passthrough') {
      try {
        await ensureJsonAgentInstall({ agentId: def.id, allowed, spec: { command: bridgeInjection.command,
          args: [...(bridgeInjection.args ?? [])], env: { ...bridgeInjection.env } },
          ctx: { home: (env.HOME ?? env.USERPROFILE ?? homedir()), platform: process.platform, serverName: 'jini' } }, {});
      } catch (error) {
        await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: `${def.name}'s connector could not be installed safely in its personal settings. Choose another available agent for this message.`,
          startup: { stage: startupStage, error } }, {}); return false;
      }
    }
    if (def?.fullCliAccessNote) await runLifecycle.emit({ runId: run.id, input: {
      event: 'agent', data: { type: 'status', label: 'full_cli_access', detail: def.fullCliAccessNote },
    } });
    return true;
  }
};

/** Fails closed: an untracked `runId` throws rather than fabricating a principal — see
 * `src/server/modules/assistant.ts`'s identical guard for the full rationale.
 *
 * A `requireReadOnly` request (the wire flag `@jini-ai/mcp`'s `execute_readonly_delegated_tool`
 * sets, and which `@jini-ai/http-kit` hands to this host-owned resolver verbatim) resolves to an
 * ATTENUATED principal instead of the tracked one. That is what carries the constraint past this
 * route and into the execution itself, where `withReadOnlyToolConstraint` enforces it on every
 * dispatch rather than only on the id the caller named — the route's own check answers for that one
 * id, and a decorator can dispatch another. See `read-only-tool-constraint.ts`. */
const resolvePrincipal = ({ request }: { readonly request: DelegatedToolExecuteRequest }): Principal => {
  const principal = principalByRunId.get(request.runId);
  if (!principal) throw new Error(`no principal is tracked for run "${request.runId}"`);
  return request.requireReadOnly === true ? constrainPrincipalToReadOnlyTools(principal) : principal;
};

/** Resolve discovery authority from a still-live per-run credential, never a wire principal. */
function resolveDiscoveryCaller(req: express.Request) {
  const token = bearerTokenFromHeader({ header: req.get("authorization") });
  return token ? runCredentials.resolveCaller({ token }) : undefined;
}

const app = express();
app.use((_req, res, next) => {
  if (disposed) { res.status(503).json({ error: "site scope is closed" }); return; }
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
registerMessageRelayRoutes({ app, agentExecutor, runScopedCallers: runCredentials });

// Before every other route's `express.json()` — an unauthenticated caller's body is never parsed. See this
// file's module doc and `daemon-auth.ts` for the fail-closed contract. No exemptions: the spawned
// bridge now presents JINI_DAEMON_TOKEN on delegated calls too. BYOK dispatches in process, and
// the proxy does not expose the delegated route (`daemon-auth.ts`'s DELEGATED_TOOL_CALLS_PATH).
// `runScopedCallers`: each run's bridge presents its own per-run credential, which reaches only the
// bridge's routes and stands for that run's principal, never one the caller asserts
// (`run-scoped-credential.ts`). The proxy token alone still carries a proxy-asserted principal.
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
const adapter: AdapterContext = { resolvedPortRef: { current: port }, env: env,
  // These are the environment names the previously imported http-kit origin guard read.
  // Preserve that deployed contract when supplying the now-explicit origin configuration.
  allowedOriginsEnvVar: "JINI_ALLOWED_ORIGINS", webPortEnvVar: "JINI_WEB_PORT", bindHostEnvVar: "JINI_BIND_HOST" };

// Per-run authorization, mounted between the bearer gate and the run routes it protects. The gate
// above proves the caller is Tovu's proxy; these two prove *which admin* the proxy is speaking for,
// which is the question neither the gate nor the proxy's own session check can answer. Both must
// precede `registerRunRoutes`: the middleware so it runs first, and the list handler so it shadows
// http-kit's unscoped `runListRoute` under Express's first-match-wins routing. See
// `run-ownership.ts` for the ownership model and the 404-not-403 rationale.
app.use("/api/runs/:runId", requireRunOwnership({ registry: runOwners, lifecycle: lifecycle }, {}));
app.get("/api/runs", createOwnedRunListHandler({ lifecycle, registry: runOwners }, {}));

registerCredentialRunIntake({ app }, {});
if (routeDeps.chatRunLedger.durable) registerDurableRunStartRoute({ app, lifecycle, onStarted, store: routeDeps.chatRunLedger.durable }, {});
/** Delivers authorized screenshot pixels through the existing live-input path. Reads do not claim
 * uploads: an unsupported runtime or an ending run must leave the whole turn available for the
 * idle attachment claim. Non-image files wait for idle delivery, which also grants directory access.
 * @complexity O(b) time/space in attachment bytes, bounded by the existing upload limits.
 */
async function deliverRunUserMessage(
  { runId, text, id, attachmentIds = [] }: RunMessageRequest, _optional = {},
): Promise<UserMessageDelivery> {
  if (attachmentIds.length === 0) return agentExecutor.sendUserMessage({ runId, text, id });
  const principal = principalByRunId.get(runId);
  if (principal === undefined) return "not-running";
  const prepared = await prepareByokMessageAttachments({
    refs: attachmentIds, principalId: principal.id, uploadDirectory: ATTACHMENT_UPLOAD_DIRECTORY,
  }, {});
  if (prepared.notice !== "") return "unsupported";
  return agentExecutor.sendUserMessage({ runId, text, id, attachmentIds }, { imageContents: prepared.images });
}

registerRunRoutes({ app, deps: { lifecycle, onStarted,
  deliverUserMessage: (input) => agentExecutor.sendUserMessage(input),
  deliverUserMessageWithAttachments: (input) => deliverRunUserMessage(input, {}),
}, adapter });
// `rescanAgents` wired explicitly (not left to fall back to `listAgents`, `@jini-ai/http-kit`'s own
// default): `listAssistantAgents` is now cached (see `agents.ts`'s module doc — this file's own
// gap was the fallback silently serving the same stale cache `POST /api/agents/rescan` exists to
// bypass). `rescanAssistantAgents` is the one path that actually forces a fresh PATH probe.
registerAgentRoutes({ app, deps: { listAgents: assistantInventory.listAssistantAgents, rescanAgents: assistantInventory.rescanAssistantAgents }, adapter });
// `GET /api/active` — the one route `jini-mcp` calls (`get_active_context`) that this daemon never
// served, so it answered 404. Behind the bearer gate above like every route but the delegated one.
registerRunActiveContextRoute(app, runActiveContexts);
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
  toolRegistry: siteTools.registry,
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
registerDelegatedToolRoutes({ app, deps: delegatedToolRouteDeps, adapter });
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
// `src/server/modules/assistant.ts` for the proxy half.
registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
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
// `src/server/modules/assistant.ts`.
frontendControl.httpExtension({ app, context: { adapter } });
// Runless WebMCP uses the same policy/exchange/audit stack as a daemon run. The proxy supplies
// the authenticated principal; the bind token and tab id constrain the effect to its own screen.
registerFrontendRequestRoute({ app, path: "/api/frontend-sessions/request", control: frontendControl,
  executor: toolExecutor, capabilityIds: FRONTEND_CONTROL_CAPABILITIES.filter(entry => entry.id.startsWith("page.")).map(entry => entry.id),
  resolveOwner: async ({ req }) => adminFrontendOwner({ req, workspaceId: routeDeps.workspaceId }),
});

  // Discovery is scoped by each run's credential; the server refreshes its own plugin/settings
  // state before returning descriptors. The native FTS owner is released with the final run.
  registerToolCatalogRoutes({ app, deps: { catalog: siteTools.catalog }, adapter });
  app.use("/api/components", (req, res, next) => {
    const caller = resolveDiscoveryCaller(req);
    if (!caller) { res.status(404).json({ error: "a live run is required" }); return; }
    void siteTools.refreshComponents({ runId: caller.runId }).then(() => {
      siteTools.withRun({ runId: caller.runId, fn: () => next() });
    }).catch(() => {
      res.status(503).json({ error: "component catalog is unavailable", code: "COMPONENT_CATALOG_UNAVAILABLE" });
    });
  });
  registerComponentCatalogRoutes({ app, deps: { catalog: siteTools.components }, adapter });

  // `createDiskAttachmentStore` is async (it reconciles `uploadDirectory` against the previous
  // process on construction — see its own doc), so it cannot be a module-scope `const` the way
  // `agentExecutor`/`toolExecutor` are. Assigned into the scope-local `attachmentStore` binding
  // `onStarted` reads, and awaited here — before the host mounts this scope — so no request
  // can ever reach this process while `attachmentStore` is still unset (`onStarted`'s own doc
  // explains why that matters).
  //
  // `retainAcrossRestarts` is NOT optional for this host, and the reason is specific to how this
  // process is started. The daemon is a `spawn()` child of `src/index.ts`, which dev runs under
  // `tsx watch` — so every save anywhere in `apps/website/src` kills and respawns it (see
  // `agent-daemon-supervisor.ts`). Without this option the store empties `uploadDirectory` on each
  // of those constructions, which means an unrelated source edit silently destroys every chat
  // attachment a user has staged but not yet sent. That is not a hypothetical: an upload was
  // observed erased by an API reload ~90 seconds later. The store's default is deliberately the
  // conservative one for hosts whose process lifetime really does bound an upload's; this host is
  // not one of them.
  //
  // Adoption is authenticated, not blind — a file that changed between processes is rejected by the
  // same integrity gate `claim()` applies, and anything unaccounted for is swept. Reverting to the
  // previous behavior is deleting this one option.
  attachmentStore = await createDiskAttachmentStore({
    uploadDirectory: ATTACHMENT_UPLOAD_DIRECTORY,
  }, {
    retainAcrossRestarts: true,
    maxBatchBytes: ATTACHMENT_MAX_BATCH_BYTES,
  });
  // Server-side attachment tools consult the sole live owner, including uploads made after boot.
  // The adapter adds its own full-daemon-token gate; run credentials cannot access this route.
  registerDaemonAttachmentLookup({ app, store: attachmentStore }, { env: authEnv });
  // Registered ahead of `express.json()` in spirit (see `attachments.ts`'s own "mount before any
  // global body parser" note) even though call order here is necessarily after it (`express.json()`
  // is synchronous module-scope code above; this file's own body-parser-skip behavior for a
  // non-JSON `content-type` is what actually protects the upload route — see
  // `src/server/modules/assistant.ts#forwardAttachmentUpload`'s doc for the full trace of why an
  // `application/octet-stream` POST survives `express.json()` regardless of registration order).
  registerAttachmentRoutes({ app, deps: {
      store: attachmentStore,
      acquireActivity: () => idlePark.hold({}, {}),
      // The trusted-downstream-of-the-bearer-gate header `forwardAttachmentUpload`
      // (`server/runtime/composition/modules/assistant.ts`) now stamps from the uploading admin's
      // OWN session — see that function's doc. This is what `chat_list_pending_attachments`
      // (`list-pending-chat-attachments.ts`) scopes its listing by.
      resolveOwnerId: ({ req }) => req.get(RUN_PRINCIPAL_HEADER) ?? undefined,
      // Without this, `@jini-ai/http-kit`'s own default (20 MB) silently undercuts
      // `TOVU_MAX_UPLOAD_BYTES` for the one media path that reaches it (a chat attachment promoted
      // to the library, `promote-chat-attachment.ts`) — this route's hard, streaming-enforced byte
      // cap, not just the client's own pre-check (`AssistantDock.hooks.tsx`'s
      // `useAttachmentUploader`, which must independently match this so a rejection surfaces before
      // the bytes are ever sent, not just after).
      maxAttachmentBytes: TOVU_MAX_UPLOAD_BYTES,
    }, adapter });


  if (optional.probeBridge) await optional.probeBridge();
  else {
void probeMcpBridge({ entry: bridgePreflightEntry({ injection: bridgeInjection }) }, {}).then((result) => {
  const line = formatBridgePreflightLogLine({ result });
  if (result.ok) console.log(line);
  else console.error(line);
});

  }
  return { app, lifecycle, hasExchanges: () => surfaceExchanges.size() > 0,
    dispose(_required: Record<string, never>, _optional = {}): Promise<void> {
      if (closing) return closing;
      disposed = true; // Fence intake and live run credentials before the first await.
      closing = (async () => {
        const runs = await lifecycle.list({});
        for (const run of runs) runCredentials.revoke({ runId: run.id }, {});
        const drains = runs.filter(run => !isTerminalRunState({ state: run.state })).map(async run => {
          await lifecycle.cancel({ runId: run.id });
          await lifecycle.waitForTerminal({ runId: run.id }, { signal: AbortSignal.timeout(5_000) });
        });
        await awaitBootWorkWithinBound({ work: drains }, { timeoutMs: 5_000 });
        // Terminal callbacks own session saves and attachment cleanup beyond the run's end.
        const drained = activeWork === 0 ? Promise.resolve() : new Promise<void>(resolve => { resolveDrained = resolve; });
        // Keep the retained client alive until accepted preparation/cleanup really settles.
        // The inherited IPC deadline bounds callers; timing out must not close beneath live work.
        await drained;
        for (const response of responses) response.end();
        responses.clear();
        for (const timer of ownerRetentionTimers) clearTimeout(timer);
        ownerRetentionTimers.clear();
        if (!optional.idlePark) processActivity.stop({}, {});
        disposeAiTracing();
        try { await assistantInventory.dispose({}); }
        finally { await daemonStore?.close(); }
      })();
      return closing;
    },
  };
} catch (error) {
  disposeAiTracing();
  await assistantInventory.dispose({}).catch(() => {});
  await daemonStore?.close().catch(() => {});
  throw error;
}
}
