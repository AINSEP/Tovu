import { createRunStartHandler, type RunStartRequired } from './agent-daemon-run-start.js';
import { createScopeApp } from './agent-daemon-scope-http.js';
import { createAttachmentRunFieldsResolver, createRunUserMessageDelivery, openScopeAttachments, mountScopeAttachments } from './agent-daemon-scope-attachments.js';
import { createScopeRuntime, createScopePromptAugmenter, createScopeBridge, createScopeAgentExecutor, startBridgeProbe } from './agent-daemon-scope-runtime.js';
import { createScopeToolRegistry, createScopeToolExecutor } from './agent-daemon-scope-tools.js';
import { createScopeLifetime } from './agent-daemon-scope-lifetime.js';
import type { AgentDaemonCoreDeps } from '../../runtime/composition/agent-daemon-core-deps.js';
import { type ChatSettingsSnapshot } from '@jini-ai/daemon/chat-settings';
import { type ToolAccessRun } from '@jini-ai/daemon';
import { createAgentDaemonIdlePark } from "./agent-daemon-idle-park.js";
import { type AssistantCliPermissions } from "@tovu/contracts/assistant-subagents-policy";
import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";
import { AsyncLocalStorage } from "node:async_hooks";
import { TOOL_EXEC_TOKEN_ENV_VAR, AGENT_DAEMON_TOKEN_ENV_VAR } from "#src/assistant/daemon-access";
import express from "express";
import { type Principal } from "@jini-ai/core";
import { traceRunLifecycle } from "./run-lifecycle-tracing.js";
import { createInMemoryEventLog, createRunLifecycle, type RunLifecycle } from "@jini-ai/daemon";
import type { AttachmentStore } from "@jini-ai/daemon/http";
import { resolveBashProhibitionEnabled } from "./assistant-system-overlay.js";
import { type AssistantRuntimeGuidanceInput } from "./assistant-runtime-guidance.js";
import { createAgentDaemonCoreDeps, type AgentDaemonCoreOptions, type AgentDaemonResource } from "../../runtime/composition/agent-daemon-core-deps.js";

import { createAssistantAgentInventory } from "#src/assistant/agents";
import { createLiveRunTracker, createConversationStartLock } from "#src/assistant/agent-session-preset";
import { createCustomInstructionsCache } from "#src/assistant/custom-instructions";
import { createRunOwnerRegistry, createRunScopedCredentials } from "#src/assistant/daemon-access";
import { createRunActiveContextStore } from "#src/assistant/run-active-context";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createEarlySessionCapture } from "./early-run-session.js";
import { readProcessStart } from "./attempt-process-identity.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import type { ExclusiveRunLease } from "@jini-ai/daemon/exclusive-run-lease";



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
 * other admin's run by id. `apps/website/src/assistant/daemon-access.ts` closes that: the proxy asserts its verified principal
 * in a header on every forwarded request, and this process compares it against the run's recorded
 * owner. Enforcement is here rather than in the proxy because this is the process that owns run
 * state, so the ownership record and the run it protects live and die together.
 *
 * Authentication: the relay claim POST has its own live-run credential gate; all other routes use
 * `apps/website/src/assistant/daemon-access.ts`'s `requireAgentDaemonToken()`. Both gates run before their `express.json()`,
 * so an unauthenticated caller's body is never even parsed. It requires an exact
 * `Authorization: Bearer <TOVU_AGENT_DAEMON_TOKEN>` match, has no loopback exemption (binding to
 * `127.0.0.1` keeps remote hosts out but does nothing about other local processes, which is the
 * actual threat for a daemon that can start real agent runs and write to `content.db`), and fails
 * closed with 503 when the scope credential is unset. Desktop main initializes each scope
 * through inherited IPC with a distinct proxy credential; standalone boot adopts its existing
 * per-boot token. The runtime environment omits both proxy and site-tool credentials before any
 * CLI probes or agent processes can launch. Deliberately NOT the generic API bearer middleware — see
 * `Jini packages/http-kit/src/api-security-middleware.ts`'s header for why its loopback short-circuit makes it a no-op here.
 *
 * `/api/delegated-tool-calls` also requires a bearer: the Claude/Codex `jini-mcp` subprocess
 * receives its per-run `JINI_DAEMON_TOKEN` through `mcp-injection.ts` and forwards it on callbacks.
 * After JSON parsing, a second gate binds body.runId to that credential's run. BYOK executes
 * in process and the proxy does not expose this route; no credential-less exemption is needed.
 */


type ScopeRunState = RunStartRequired['state'] & {
  runActiveContexts: ReturnType<typeof createRunActiveContextStore>; RUN_OWNER_RETENTION_MS: number;
};

export interface SiteScopeOptions {
  readonly coreOptions?: AgentDaemonCoreOptions;
  readonly idlePark?: ReturnType<typeof createAgentDaemonIdlePark>;
  /** The daemon-wide browser integration lease, shared by every site scope it hosts. */
  readonly browserLease?: ExclusiveRunLease;
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
export async function createSiteScope({ siteId, env: suppliedEnv, token }: { siteId: string; env: NodeJS.ProcessEnv; token: string }, optional: SiteScopeOptions = {}): Promise<SiteScope> {
  const { env, authEnv, daemonUrl, port } = scopeConfiguration({ siteId, env: suppliedEnv, token });
  const toolExecTokenHolder: NodeJS.ProcessEnv = {};
  let daemonStore: AgentDaemonResource | undefined; let disposeAiTracing: () => void = () => {};
const { DEFAULT_AGENT_ID, siteToolToken, assistantRuntime, assistantInventory, getAgentDef, resolveAgentLaunch, resolveAssistantAgentId, probeAssistantChrome, resolvePermissionMode } = createScopeRuntime({ env, toolExecTokenHolder });

try {

/**
 * Opt-in-only diagnostic gate for the base system overlay's Bash-prohibition instrument — see
 * `assistant-system-overlay.ts`'s `resolveBashProhibitionEnabled` for the full rationale (why this
 * exists, why it defaults OFF, and why it is not a security control). Read once here, at module
 * scope like `ATTACHMENT_UPLOAD_DIRECTORY` (below), rather than per-call inside `systemOverlay()`:
 * this is a boot-time operator choice, not a per-run condition.
 */
const bashProhibitionEnabled = resolveBashProhibitionEnabled(env);

// The supervisor pins the site's workspace. The authenticated bootstrap also checks it, so a
// daemon cannot silently attach to another workspace's settings, files or attempt authority.
// Site writes now execute in the server: its bus/drainer delivers their outbox events. There is
// no enqueue-only outbox or disconnected durable ledger in this process, including memory mode.
const routeDeps = await createAgentDaemonCoreDeps({ env, token: siteToolToken }, { ...optional.coreOptions,
  onStoreOpened: ({ resource }, _optional = {}) => { daemonStore = resource; optional.coreOptions?.onStoreOpened?.({ resource }); } });
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

const tracing = createScopeTracing({ routeDeps });
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
const lifetime = createScopeLifetime({ processActivity, ownsIdlePark: !optional.idlePark, lifecycle, assistantInventory, getRunCredentials: () => runCredentials, getDaemonStore: () => daemonStore, disposeAiTracing: () => disposeAiTracing() });
const { responses, ownerRetentionTimers, idlePark } = lifetime;

// Site registrations, attachment tools, plugin guidance and federation have one owner: the
// server's BYOK composition. Only browser-tab capabilities have executable registrations here.
const chatSettingsByRunId = new Map<string, ChatSettingsSnapshot>(); const toolAccessRuns = new Map<string, ToolAccessRun>();
const revokedToolRuns = new Set<string>(); const cleanupFailures = new Set<string>(); const noToolsNotices = new Set<string>();
const { registry, siteTools, visibleRegistry, frontendControl } = createScopeToolRegistry({ env, siteToolToken, routeDeps, surfaceExchanges, readSnapshot: ({ runId, principalId }) => !revokedToolRuns.has(runId) && principalByRunId.get(runId)?.id === principalId ? chatSettingsByRunId.get(runId) : undefined, contextFor: ({ runId }) => ({ conversationId: liveRunTracker.conversationIdForRun({ runId }, {}), attachmentRefs: messageAttachmentRefsByRunId.get(runId) ?? [] }), execute: (...args) => toolExecutor.execute(...args) });
const toolExecutor = createScopeToolExecutor({ routeDeps, registry, surfaceExchanges, siteTools, idlePark });

/**
 * The admin Instructions tab's system-prompt seam (`core.instructions.custom`) — see
 * `custom-instructions.ts`'s module doc for why this is a refreshable cache rather than a direct
 * ledger read: `PromptAugmenter.systemOverlay()` below is called synchronously, and the cross-process
 * cache the ledger's own `getEffective` keeps would otherwise go stale forever after this process's
 * first read. `onStarted` calls `.refresh()` before every run; `assistantPromptAugmenter.
 * systemOverlay()` reads the result synchronously.
 */
const customInstructionsCache = createCustomInstructionsCache( { settingsRepo: routeDeps.settingsRepo, settingsReady: routeDeps.settingsUiTabsReady, getEffective: routeDeps.getEffective, instructionsNamespace: routeDeps.instructionsNamespace, }, { workspaceId: routeDeps.workspaceId }, );

// Scope the fresh site setting to its launch, rather than sharing the last chat's grant across
// concurrent runs. The synchronous Jini prompt seam reads the same value as the CLI deny list.
const assistantCliCapabilitiesContext = new AsyncLocalStorage<AssistantCliPermissions["capabilities"]>();
const assistantNativeToolsContext = new AsyncLocalStorage<boolean>();
// Same per-launch scoping for the person's runtime preferences (`assistant-runtime-guidance.ts`).
const assistantRuntimeGuidanceContext = new AsyncLocalStorage<AssistantRuntimeGuidanceInput>();

const assistantPromptAugmenter = createScopePromptAugmenter({ getAgentDef, bashProhibitionEnabled, assistantNativeToolsContext, assistantCliCapabilitiesContext, assistantRuntimeGuidanceContext, customInstructionsCache });

const bridgeInjection = createScopeBridge({ daemonUrl, env, registry, visibleRegistry, mintRunCredential: (runId) => runCredentials.mint({ runId: runId }, {}) });
const { agentExecutor, agentRuntime, daemonRuntime } = createScopeAgentExecutor({ lifecycle, assistantRuntime, cleanupFailures, bridgeInjection, assistantPromptAugmenter });

// Initialize needs no callback credential; probe the real launch without minting a run token.
// The run-scoped startup tool fetch is left out of it — see bridge-preflight-entry.ts.

/**
 * Assigned once, inside `start()`, before `app.listen()` ever binds the port — `onStarted` cannot
 * be invoked by a real request until then, so every call site below sees this populated. Typed
 * `| undefined` anyway (not asserted non-null) because `onStarted`'s own contract is "never throw
 * synchronously past the point a run is already durably started" — a theoretically-unreachable
 * `undefined` here should still fail the one run it affects, not crash the process.
 */
let attachmentStore: AttachmentStore | undefined;
const state = createScopeRunState({ isDisposed: lifetime.isDisposed, revokedToolRuns, chatSettingsByRunId, toolAccessRuns, noToolsNotices, cleanupFailures, ownerRetentionTimers });
const { principalByRunId, messageAttachmentRefsByRunId, durableMessageIdsByRunId, runCredentials, stagedAttachmentCleanupByRunId, runOwners, runActiveContexts, RUN_OWNER_RETENTION_MS, liveRunTracker, conversationStartLock } = state;

const resolveAttachmentRunFields = createAttachmentRunFieldsResolver({ getAttachmentStore: () => attachmentStore, routeDeps, stagedAttachmentCleanupByRunId, defaultAgentId: DEFAULT_AGENT_ID, getAgentDef });

const captureEarlySession = createEarlySessionCapture({ sessions: routeDeps.agentSessions, durable: routeDeps.chatRunLedger.durable, readStart: readProcessStart }, {});

const onStarted = createRunStartHandler({ state, siteId, env, routeDeps, siteTools, agentExecutor, startupMessage: agentRuntime.failures.startupMessage, customInstructionsCache, idlePark, getAgentDef, resolveAgentLaunch, resolveAssistantAgentId, assistantInventory, visibleRegistry, surfaceExchanges, frontendControl, captureEarlySession, bridgeInjection, resolvePermissionMode, probeAssistantChrome, tracing, runActiveContexts, assistantCliCapabilitiesContext, assistantNativeToolsContext, assistantRuntimeGuidanceContext, getAttachmentStore: () => attachmentStore, isDisposed: lifetime.isDisposed }, { browserLease: optional.browserLease, resolveAttachmentRunFields, ownerRetentionMs: RUN_OWNER_RETENTION_MS });

const deliverRunUserMessage = createRunUserMessageDelivery({ principalByRunId, ATTACHMENT_UPLOAD_DIRECTORY, agentExecutor });
const { app, routeHost } = createScopeApp({ env, authEnv, port, isDisposed: lifetime.isDisposed, responses, idlePark, lifecycle, principalByRunId, runCredentials, runOwners, agentExecutor, toolAccessRuns, revokedToolRuns, cleanupFailures, siteTools, routeDeps, onStarted, deliverRunUserMessage, assistantInventory, runActiveContexts, toolExecutor, surfaceExchanges, frontendControl, durableMessageIdsByRunId });

  attachmentStore = await openScopeAttachments({ ATTACHMENT_UPLOAD_DIRECTORY });
  mountScopeAttachments({ app, attachmentStore, routeHost, authEnv, idlePark });

  if (optional.probeBridge) await optional.probeBridge();
  else startBridgeProbe({ bridgeInjection, spawn: daemonRuntime.spawn, hostEnv: assistantRuntime.hostEnv });
  return { app, lifecycle, hasExchanges: () => surfaceExchanges.size() > 0, dispose: lifetime.dispose };
} catch (error) {
  return unwindScope({ error, disposeAiTracing, assistantInventory, daemonStore });
}
}

function createScopeRunState({ isDisposed, revokedToolRuns, chatSettingsByRunId, toolAccessRuns, noToolsNotices, cleanupFailures, ownerRetentionTimers }: {
  isDisposed: () => boolean;
} & Pick<ScopeRunState, 'revokedToolRuns' | 'chatSettingsByRunId' | 'toolAccessRuns' | 'noToolsNotices' | 'cleanupFailures' | 'ownerRetentionTimers'>, _optional = {}): ScopeRunState {
/** Populated by `onStarted`, read by `resolveDelegatedPrincipal` — see module doc. Deleted on
 * terminal transition on purpose: the exempt `/api/delegated-tool-calls` route's remaining defence
 * is that a `runId` only resolves while its run is in flight (`Jini packages/daemon/src/run-credentials.ts`). */
const principalByRunId = new Map<string, Principal>();
/** Accepted-message refs decoded by `onStarted`, keyed by the SAME lifecycle id used by claim()
 * and delegated tools. `lifecycle.get()` returns public RunStatus without contextRef; parsing it
 * there silently hid every attachment. Keep this binding for the tracked principal's lifetime. */
const messageAttachmentRefsByRunId = new Map<string, readonly string[]>();
/** The durable guard must still identify a chat attempt after its persisted row is deleted or
 * advanced. Public RunStatus has no contextRef, so retain the decoded message id until terminal. */
const durableMessageIdsByRunId = new Map<string, string>();
/** Per-run bridge credentials. Valid only while `principalByRunId` tracks the run, so they share its
 * lifetime; `revoke` on terminal only keeps the map small. See `Jini packages/daemon/src/run-credentials.ts`. */
const runCredentials = createRunScopedCredentials({ principalOfLiveRun: ({ runId }) => isDisposed() || revokedToolRuns.has(runId) ? undefined : principalByRunId.get(runId)?.id }, {});

// Only copies handed to a CLI live here; the store retains its own promotion/read-back records.
const stagedAttachmentCleanupByRunId = new Map<string, () => Promise<void>>();



/** The same fact with the opposite lifetime — a finished run is still readable, so its owner must
 * stay known. See `Jini packages/daemon/src/run-credentials.ts` for why the two maps are not redundant. */
const runOwners = createRunOwnerRegistry({}, {});
/** Each live run's admin screen, recorded at run start and forgotten at run end — what `GET /api/active`
 * (`@jini-ai/mcp`'s `get_active_context`) answers from. See `run-active-context.ts`. */
const runActiveContexts = createRunActiveContextStore();
/** `@jini-ai/daemon`'s `DEFAULT_TERMINAL_RETENTION_MS` (24 h, not exported), which `lifecycle` (above)
 *  runs with: how long a terminal run stays readable, and so how long its owner must stay known. */
const RUN_OWNER_RETENTION_MS = 24 * 60 * 60 * 1000;

/** H2 fix — see `Jini packages/daemon/src/session-coordination.ts`'s own doc. One instance for this process's whole
 * lifetime, registered/unregistered per run inside `onStarted` below. */
const liveRunTracker = createLiveRunTracker({}, {});

/** Defect 1 fix (2026-09-11) — see `Jini packages/daemon/src/session-coordination.ts`'s own doc. One instance for this
 * process's whole lifetime; `onStarted` runs its read-decide-write session-binding section through
 * it so two near-simultaneous turns on one conversation cannot both mint a session. */
const conversationStartLock = createConversationStartLock({}, {});

  return { principalByRunId, messageAttachmentRefsByRunId, durableMessageIdsByRunId, runCredentials,
    stagedAttachmentCleanupByRunId, runOwners, runActiveContexts, RUN_OWNER_RETENTION_MS, liveRunTracker, conversationStartLock,
    revokedToolRuns, chatSettingsByRunId, toolAccessRuns, noToolsNotices, cleanupFailures, ownerRetentionTimers };
}

function createScopeTracing({ routeDeps }: { routeDeps: Pick<AgentDaemonCoreDeps, "aiTraceSink"> }, _optional = {}) {
// The in-memory log bounds itself (a run's payloads are compacted 15 min after its `end`; at most
// 1000 runs are held), and the durable transcript is `ai_chat_messages.events_json`. Dropping a run's
// events when the lifecycle evicts its record gives both the same lifetime (memory cause 2, 2026-10-21).
const eventLog = createInMemoryEventLog({});
// Assistant runs → AI trace when a trace provider or analytics AI capability is configured.
const tracing = traceRunLifecycle({ lifecycle: createRunLifecycle({ eventLog }, { dropEventsOnEviction: true }), sink: routeDeps.aiTraceSink });
  return tracing;
}

async function unwindScope({ error, disposeAiTracing, assistantInventory, daemonStore }: {
  error: unknown; disposeAiTracing: () => void; assistantInventory: Pick<ReturnType<typeof createAssistantAgentInventory>, 'dispose'>;
  daemonStore: AgentDaemonResource | undefined;
}, _optional = {}): Promise<never> {
  disposeAiTracing();
  await assistantInventory.dispose({}).catch((cleanupError: unknown) => {
    console.error("[agent-daemon] Could not dispose the agent inventory after startup failed:",
      describeErrorForLog({ err: cleanupError }));
  });
  await daemonStore?.close().catch((cleanupError: unknown) => {
    console.error("[agent-daemon] Could not close the daemon store after startup failed:",
      describeErrorForLog({ err: cleanupError }));
  });
  throw error;
}
