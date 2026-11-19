import { resolveSessionBinding as bindRunSession, subscribeRunSession, type RunSessionBinding } from './agent-daemon-run-session.js';
import { createRunToolChoice } from './agent-daemon-run-tool-access.js';
import { createRunLaunch } from './agent-daemon-run-launch.js';
import type { AgentDaemonCoreDeps } from '../../runtime/composition/agent-daemon-core-deps.js';
import { createAttachmentRunFieldsResolver, type AttachmentRunFields } from "./agent-daemon-scope-attachments.js";
import { readAssistantRunToolPolicy } from './assistant-run-tool-policy.js';
import { requestAssistantToolConsent } from './assistant-tool-consent.js';
import { type ChatSettingsSnapshot } from '@jini-ai/daemon/chat-settings';
import { admittedToolSources, type ToolAccessRun } from '@jini-ai/daemon';
import { createDaemonSiteTools } from "./agent-daemon-site-tools.js";
import { createAgentDaemonIdlePark } from "./agent-daemon-idle-park.js";
import { ensureJsonAgentInstall } from "./ensure-json-agent-install.js";
import { readLoginShellEnvironment } from "@jini-ai/platform/child-environment";
import { resolveHostSignals } from "#src/server/runtime/composition/host-signals";
import { type AssistantCliPermissions } from "@tovu/contracts/assistant-subagents-policy";
import { createToolGapCollector } from "@jini-ai/daemon/tool-audit";
import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { type Principal } from "@jini-ai/core";
import { traceRunLifecycle } from "./run-lifecycle-tracing.js";
import { createAgentExecutor } from "@jini-ai/daemon";
import { createAgentSelectionResolver, createNativeAgentRuntime } from "@jini-ai/agent-runtime";
import { createFrontendControl } from "@jini-ai/daemon/http";
import type { AttachmentStore, RunStartHandler } from "@jini-ai/daemon/http";
import { assemblePromptWithPluginPrefix } from "./plugin-prompt-assembly.js";
import { buildCapabilityManifestPrefix, resolveCapabilityManifestArm } from "./capability-manifest-prefix.js";
import { resolveAssistantDisallowedTools, resolveAssistantRunSettings } from "./assistant-system-overlay.js";
import { createAssistantChromeProbe, type AssistantRuntimeGuidanceInput } from "./assistant-runtime-guidance.js";
import { getCustomFsRoot } from "../../../features/fs-files/custom-root-store.js";
import { createAssistantAgentInventory } from "#src/assistant/agents";
import { agentCarriesOwnMemory, extractSessionRefFromEndEvent, shouldClearSessionOnFailedResume, wouldForcedColdStartLoseConversationContext, CONCURRENT_RUN_REFUSAL_MESSAGE, createLiveRunTracker, failRunBeforeStart, STOPPING_RUN_WAIT_MS, waitForStoppingRuns, createConversationStartLock } from "#src/assistant/agent-session-preset";
import { createCustomInstructionsCache } from "#src/assistant/custom-instructions";
import { createRunOwnerRegistry, createRunScopedCredentials } from "#src/assistant/daemon-access";
import { resolveMcpJsonInjection } from "#src/assistant/mcp-injection";
import { parseRunStartContextRef } from "#src/assistant/run-start-context";
import { buildPageContextPromptBlock, type RunPageContext } from "#src/assistant/run-page-context";
import { createRunActiveContextStore } from "#src/assistant/run-active-context";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createEarlySessionCapture } from "./early-run-session.js";
import { durableAttemptOwnsAnswer, selectRunHistoryPrompt } from "./run-start-decisions.js";
import type { ExclusiveRunLease } from "@jini-ai/daemon/exclusive-run-lease";
import { releasingBrowserToo } from "./assistant-browser-lease.js";

/** The `run`/`lifecycle` shape `RunStartHandler` receives — derived rather than imported directly
 *  from `@jini-ai/daemon`/`@jini-ai/protocol` so this file adds no new package-import edge just to
 *  name a type its one existing `RunStartHandler` import already carries structurally. */
type OnStartedContext = Parameters<RunStartHandler>[0];
export type RunStartState = { agentId: string; prompt: string; attemptedResumeSessionId: string | null; startupStage: string };
export type RunStartRequired = {
  state: {
    principalByRunId: Map<string, Principal>; messageAttachmentRefsByRunId: Map<string, readonly string[]>;
    durableMessageIdsByRunId: Map<string, string>; stagedAttachmentCleanupByRunId: Map<string, () => Promise<void>>;
    chatSettingsByRunId: Map<string, ChatSettingsSnapshot>; toolAccessRuns: Map<string, ToolAccessRun>;
    revokedToolRuns: Set<string>; noToolsNotices: Set<string>; cleanupFailures: Set<string>;
    liveRunTracker: ReturnType<typeof createLiveRunTracker>; runOwners: ReturnType<typeof createRunOwnerRegistry>;
    runCredentials: ReturnType<typeof createRunScopedCredentials>; conversationStartLock: ReturnType<typeof createConversationStartLock>;
    ownerRetentionTimers: Set<ReturnType<typeof setTimeout>>;
  };
  siteId: string; env: NodeJS.ProcessEnv; routeDeps: AgentDaemonCoreDeps;
  siteTools: ReturnType<typeof createDaemonSiteTools>; agentExecutor: Pick<ReturnType<typeof createAgentExecutor>, 'run'>;
  customInstructionsCache: Pick<ReturnType<typeof createCustomInstructionsCache>, 'refresh'>;
  idlePark: Pick<ReturnType<typeof createAgentDaemonIdlePark>, 'hold'>;
  getAgentDef: ReturnType<typeof createNativeAgentRuntime>['getAgentDef'];
  resolveAgentLaunch: ReturnType<typeof createNativeAgentRuntime>['resolveAgentLaunch'];
  resolveAssistantAgentId: ReturnType<typeof createAgentSelectionResolver>;
  assistantInventory: Pick<ReturnType<typeof createAssistantAgentInventory>, 'listAssistantAgents'>;
  visibleRegistry: ReturnType<typeof createDaemonSiteTools>['registry']; surfaceExchanges: ReturnType<typeof createSurfaceExchangeStore>;
  frontendControl: Pick<ReturnType<typeof createFrontendControl>, 'bindOnStarted'>;
  captureEarlySession: ReturnType<typeof createEarlySessionCapture>;
  bridgeInjection: ReturnType<typeof resolveMcpJsonInjection>;
  resolvePermissionMode: () => 'bypass' | 'restricted'; probeAssistantChrome: ReturnType<typeof createAssistantChromeProbe>;
  tracing: Pick<ReturnType<typeof traceRunLifecycle>, 'noteRunInput'>;
  runActiveContexts: ReturnType<typeof createRunActiveContextStore>;
  assistantCliCapabilitiesContext: AsyncLocalStorage<AssistantCliPermissions['capabilities']>;
  assistantNativeToolsContext: AsyncLocalStorage<boolean>;
  assistantRuntimeGuidanceContext: AsyncLocalStorage<AssistantRuntimeGuidanceInput>;
  getAttachmentStore: () => AttachmentStore | undefined; isDisposed: () => boolean;
};
export type RunStartOptional = {
  browserLease?: ExclusiveRunLease; platform?: NodeJS.Platform; console?: Pick<Console, 'error' | 'warn' | 'log'>;
  setTimeout?: typeof setTimeout; ownerRetentionMs?: number; stoppingRunWaitMs?: number; concurrentRunRefusalMessage?: string;
  resolveAttachmentRunFields?: ReturnType<typeof createAttachmentRunFieldsResolver>;
  failRunBeforeStart?: typeof failRunBeforeStart;
  waitForStoppingRuns?: typeof waitForStoppingRuns;
  extractSessionRefFromEndEvent?: typeof extractSessionRefFromEndEvent;
  shouldClearSessionOnFailedResume?: typeof shouldClearSessionOnFailedResume;
  agentCarriesOwnMemory?: typeof agentCarriesOwnMemory;
  createToolGapCollector?: typeof createToolGapCollector;
  resolveHostSignals?: typeof resolveHostSignals;
  readLoginShellEnvironment?: typeof readLoginShellEnvironment;
  requestAssistantToolConsent?: typeof requestAssistantToolConsent;
  ensureJsonAgentInstall?: typeof ensureJsonAgentInstall;
  readAssistantRunToolPolicy?: typeof readAssistantRunToolPolicy;
  randomUUID?: typeof randomUUID;
  homedir?: typeof homedir;
  existsSync?: typeof existsSync;
  getCustomFsRoot?: typeof getCustomFsRoot;
  parseRunStartContextRef?: typeof parseRunStartContextRef;
  buildPageContextPromptBlock?: typeof buildPageContextPromptBlock;
  wouldForcedColdStartLoseConversationContext?: typeof wouldForcedColdStartLoseConversationContext;
  resolveAssistantDisallowedTools?: typeof resolveAssistantDisallowedTools;
  resolveAssistantRunSettings?: typeof resolveAssistantRunSettings;
};
export type RunStartPorts = RunStartRequired & Required<Omit<RunStartOptional, 'browserLease'>> & Pick<RunStartOptional, 'browserLease'>;
export type RunPorts = RunStartPorts & NonNullable<ReturnType<typeof decodeRunStart>> & {
  request: OnStartedContext['request']; run: Pick<OnStartedContext['run'], 'id'>; runLifecycle: OnStartedContext['lifecycle'];
  principal: Principal; pluginAbort: AbortController; unsubscribePluginCancel: () => void; runState: RunStartState;
};

export function createRunStartHandler(required: RunStartRequired, optional: RunStartOptional = {}): RunStartHandler {
  const ports: RunStartPorts = { ...required,
    failRunBeforeStart, waitForStoppingRuns, extractSessionRefFromEndEvent, shouldClearSessionOnFailedResume, agentCarriesOwnMemory, createToolGapCollector, resolveHostSignals, readLoginShellEnvironment, requestAssistantToolConsent, ensureJsonAgentInstall, readAssistantRunToolPolicy, randomUUID, homedir, existsSync, getCustomFsRoot, parseRunStartContextRef, buildPageContextPromptBlock, wouldForcedColdStartLoseConversationContext, resolveAssistantDisallowedTools, resolveAssistantRunSettings,
    resolveAttachmentRunFields: createAttachmentRunFieldsResolver({ getAttachmentStore: required.getAttachmentStore,
      routeDeps: required.routeDeps, stagedAttachmentCleanupByRunId: required.state.stagedAttachmentCleanupByRunId,
      defaultAgentId: 'claude', getAgentDef: required.getAgentDef }),
    console: globalThis.console, setTimeout: globalThis.setTimeout, platform: process.platform,
    ownerRetentionMs: 24 * 60 * 60 * 1000, stoppingRunWaitMs: STOPPING_RUN_WAIT_MS, concurrentRunRefusalMessage: CONCURRENT_RUN_REFUSAL_MESSAGE,
    ...optional,
  };
  return onStarted.bind(undefined, ports);
}

function onStarted(ports: RunStartPorts, { request, run: startedRun, lifecycle: runLifecycle }: OnStartedContext): void {
  const { resolveAssistantAgentId, frontendControl, idlePark, customInstructionsCache, failRunBeforeStart, console } = ports;
  const run = Object.freeze({ ...startedRun });
  holdRun(ports, { run, runLifecycle });
  const decoded = decodeRunStart(ports, { request, run, runLifecycle });
  if (!decoded) return;
  // One agent id for the whole run: the session subscription, attachment preparation and the
  // session binding below must all key by the same agent.
  // Saved selections can outlive an adapter; resolve once before any per-agent state is read.

  // H1 fix: set once `storedSessionId` is resolved below, read by the stream subscription's
  // `shouldClearSessionOnFailedResume` check — `null` (unchanged) means this run never attempted a
  // resume in the first place, so a failed/no-sessionRef end event has nothing stale to clear.
  const runState: RunStartState = { agentId: resolveAssistantAgentId({ agentId: request.agentId }), prompt: decoded.prompt, attemptedResumeSessionId: null, startupStage: "custom instructions" };
  const pluginAbort = new AbortController();
  const unsubscribePluginCancel = runLifecycle.onCancelRequested({ runId: run.id, listener: () => pluginAbort.abort() });
  const runPorts = { ...ports, ...decoded, request, run, runLifecycle, pluginAbort, unsubscribePluginCancel, runState };
  registerLiveRun(runPorts);
  scheduleTerminalCleanup(runPorts);
  subscribeRunSession(runPorts);
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
  runState.startupStage = 'custom instructions';
  void customInstructionsCache
    .refresh()
    .then(() => prepareRun(runPorts))
    // `AgentExecutor.run()` already transitions the run to `'failed'` via `lifecycle.finish()` on
    // every failure path before it rejects — this catch only guards against an unhandled rejection.
    // (The attachment-claim failure branch above finishes the run itself and returns before ever
    // reaching `run()`, so it does not rely on this catch for that.)
    .catch((error: unknown) => {
      console.error(`[agent-daemon] run ${run.id} failed to start`, error);
      // A startup rejection must terminalize its attempt so its slot and credentials release.
      void failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: "The assistant could not start this execution attempt.",
        startup: { stage: runState.startupStage, error } }, {});
    }).finally(releasePreparation);
}

function holdRun({ idlePark, browserLease, console }: RunStartPorts, { run, runLifecycle }: { run: RunPorts["run"]; runLifecycle: RunPorts["runLifecycle"] }, _optional = {}) {
  // Every CLI run is busy, including headless/Aider runs with no conversationId. Terminal waits
  // release malformed starts too; preparation and cleanup below retain their own work holds.
  const releaseRun = releasingBrowserToo({ release: idlePark.hold({}, {}), lease: browserLease, runId: run.id });
  void runLifecycle.waitForTerminal({ runId: run.id }).catch((error: unknown) => {
    console.error(`[agent-daemon] run ${run.id}: could not wait for completion before releasing activity:`,
      describeErrorForLog({ err: error }));
  }).finally(releaseRun);
}

function noteFullRunInput({ routeDeps, tracing, runId, input }: Pick<RunStartRequired, "routeDeps" | "tracing"> & { runId: string; input: string }, _optional = {}): void {
  if (routeDeps.aiTraceSink?.capture === "full") tracing.noteRunInput({ runId, input });
}

function decodeRunStart(ports: RunStartPorts, { request, run, runLifecycle }: { request: OnStartedContext["request"]; run: Pick<OnStartedContext["run"], "id">; runLifecycle: OnStartedContext["lifecycle"] }) {
  const { routeDeps, tracing, parseRunStartContextRef, failRunBeforeStart, console } = ports;
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
  try {
    // `frontendBindToken` also rides in this envelope but is deliberately not read here —
    // `createFrontendControl`'s own `resolveBindToken` above owns that field, so there is exactly
    // one place that decides which tab a run may drive.
    const decoded = parseRunStartContextRef({ contextRef: request.contextRef });
    coldStartContext = decoded.coldStartContext;
    prompt = decoded.prompt;
    noteFullRunInput({ routeDeps, tracing, runId: run.id, input: prompt });
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
    return null;
  }

  return { prompt, coldStartContext, principal, attachmentIds, pluginRefIds, model, reasoning, conversationId, pageContext, durableMessageId, recoveryMode, recoverySessionId };
}

function registerLiveRun(ports: RunPorts, _optional = {}) {
  const { siteId, run, runLifecycle, principal, pluginRefIds, attachmentIds, durableMessageId, conversationId, pageContext, routeDeps, runActiveContexts } = ports;
  const { principalByRunId, toolAccessRuns, messageAttachmentRefsByRunId, durableMessageIdsByRunId, runOwners, liveRunTracker } = ports.state;
  const { agentId } = ports.runState;
  const identity = Object.freeze({ siteId, runId: run.id, principal });
  principalByRunId.set(identity.runId, identity.principal);
  toolAccessRuns.set(run.id, { runId: run.id, agentId, pluginIds: pluginRefIds });
  messageAttachmentRefsByRunId.set(run.id, attachmentIds);
  if (durableMessageId !== undefined) durableMessageIdsByRunId.set(run.id, durableMessageId);
  runOwners.record({ runId: run.id, principalId: principal.id }, {});
  // Durable admin turns settle in the API, which can observe daemon death and recovery. Only
  // standalone daemon runs report here, so a recovery attempt never becomes another logical run.
  if (durableMessageId === undefined) {
    void routeDeps.tracker.capture({ name: "assistant_run_started", userId: principal.id }, { properties: { chatSurface: "daemon", logicalRunId: run.id, eventId: `assistant-start:${run.id}` } });
    void runLifecycle.stream({ runId: run.id, onEvent: event => {
      if (event.kind === "end") void routeDeps.tracker.capture({ name: "assistant_run_finished", userId: principal.id }, { properties: { chatSurface: "daemon", logicalRunId: run.id, ...(event.payload.status ? { outcome: event.payload.status } : {}), eventId: `assistant-finish:${run.id}` } });
    } });
  }

  // H2 fix (`Jini packages/daemon/src/session-coordination.ts`): registered synchronously, in this same
  // never-`await`-ed-yet prefix, so a second `onStarted` call for the same conversation — however
  // close together the two requests arrive — is guaranteed to observe this run as already live.
  // A no-op when `conversationId` is absent, matching the stream subscription below: there is
  // nothing to key concurrency by for a daemon client other than the admin chat pane.
  if (conversationId !== undefined) liveRunTracker.register({ conversationId: conversationId, runId: run.id }, {});
  if (pageContext !== undefined) runActiveContexts.record({ runId: run.id, pageContext });
}

function scheduleTerminalCleanup(ports: RunPorts, _optional = {}) {
  const { run, runLifecycle, console, idlePark, pluginAbort, unsubscribePluginCancel, siteTools, runActiveContexts, conversationId, setTimeout, ownerRetentionMs: RUN_OWNER_RETENTION_MS, getAttachmentStore } = ports;
  const { principalByRunId, chatSettingsByRunId, toolAccessRuns, revokedToolRuns, messageAttachmentRefsByRunId, durableMessageIdsByRunId, runCredentials, ownerRetentionTimers, runOwners, cleanupFailures, liveRunTracker, stagedAttachmentCleanupByRunId } = ports.state;
  void runLifecycle.waitForTerminal({ runId: run.id }).catch((error: unknown) => {
    console.error(`[agent-daemon] run ${run.id}: could not wait for completion before cleaning up:`,
      describeErrorForLog({ err: error }));
  }).finally(() => {
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
    runActiveContexts.forget({ runId: run.id });
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
    const claimedCleanup = getAttachmentStore()?.cleanupRun({ runId: run.id }).catch((error: unknown) => {
      console.error(`[agent-daemon] run ${run.id}: attachment cleanup failed`, error);
    });
    void Promise.allSettled([stagedCleanup, claimedCleanup]).finally(releaseCleanup);
  });
}

async function prepareRun(ports: RunPorts, _optional = {}) {
  const { run, runLifecycle, attachmentIds, pluginAbort, siteTools, principal, pluginRefIds, visibleRegistry, conversationId, resolveAttachmentRunFields, failRunBeforeStart } = ports;
  const { toolAccessRuns, conversationStartLock } = ports.state;
  let { agentId } = ports.runState;
  const { prepareRunToolAccess } = createRunToolChoice(ports);
  const resolveSessionBinding = bindRunSession.bind(undefined, ports);
  const { launchAgentRun } = createRunLaunch(ports);
  // One generic preparation turns every claimed file into image pixels or a file notice.
  // Runtime wire adapters decide how to carry those pixels; the CMS adapter owns authorization.
  ports.runState.startupStage = 'attachment preparation';
  const attachmentRunFields = await resolveAttachmentRunFields({ run, attachmentIds, runLifecycle, agentId }, {});
  if (!attachmentRunFields) return;
  pluginAbort.signal.throwIfAborted();
  ports.runState.startupStage = 'Agent Plugin preparation';
  await siteTools.start({ runId: run.id, principalId: principal.id });
  const pluginPreparation = await prepareSitePlugins(ports, {}, {});
  if (pluginPreparation.prefix === null) {
  await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: "The assistant could not start: a selected Agent Plugin could not be loaded." }, {});
  return;
}
const pluginPromptPrefix = pluginPreparation.prefix;

// Serialized per conversation (`Jini packages/daemon/src/session-coordination.ts`): `resolveSessionBinding` is a
// read-modify-write over `assistant_agent_sessions` with an `await` in the middle, so two
// near-simultaneous turns on one conversation could otherwise both observe an empty session
// slot and both mint — forking the conversation exactly the way the terminal-event-only write
// did. Deliberately does NOT cover `agentExecutor.run` below: holding the lock across a whole
// agent run would queue a second tab's turn behind it for minutes with no feedback.
ports.runState.startupStage = 'tool access consent';
const admitted = siteTools.withRun({ runId: run.id, fn: () => admittedToolSources({ tools: visibleRegistry.list({}) }) });
toolAccessRuns.set(run.id, { runId: run.id, agentId, ...admitted, pluginIds: [...new Set([...pluginRefIds, ...admitted.pluginIds])] });
const selectedAgent = await prepareRunToolAccess({ selectedAgentId: agentId });
if (selectedAgent === null) return;
agentId = selectedAgent; ports.runState.agentId = agentId;
const toolAccessRun = toolAccessRuns.get(run.id);
if (!toolAccessRun) throw new Error("agent run has no tool access record after preparation");
toolAccessRuns.set(run.id, { ...toolAccessRun, agentId });
ports.runState.startupStage = 'session binding';
const sessionBinding = await conversationStartLock.run({ conversationId: conversationId, critical: resolveSessionBinding }, {});
if (sessionBinding === null) return;
assembleRunPrompt({ ...ports, sessionBinding, attachmentRunFields, pluginPreparation, pluginPromptPrefix });
if (!(await durableAttemptStillOwnsAnswer(ports, {}))) {
  await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: "This execution attempt no longer owns the answer." }, {}); return;
}
ports.runState.startupStage = 'CLI launch';
await launchAgentRun({ sessionBinding, attachmentRunFields, pluginIds: pluginPreparation.pluginIds }, {});
}

function assembleRunPrompt(ports: RunPorts & { sessionBinding: RunSessionBinding; attachmentRunFields: AttachmentRunFields; pluginPreparation: { refusalPrefix: string }; pluginPromptPrefix: string }, _optional = {}) {
  const { sessionBinding, attachmentRunFields, pluginPreparation, pluginPromptPrefix, coldStartContext, pageContext, env, agentCarriesOwnMemory, buildPageContextPromptBlock } = ports;
  let { prompt } = ports.runState;
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
  prompt = `<<SUBAGENT_DISPATCH>>\n\n${assemblePromptWithPluginPrefix({ basePrompt: prompt, pluginPromptPrefix: buildPageContextPromptBlock({ context: pageContext }) })}`;
  prompt += attachmentRunFields.attachmentNotice ?? "";
  // Experimental delivery-mechanism measurement (see capability-manifest-prefix.ts's own header) —
  // prepended BEFORE the plugin prefix. Off by default; a no-op unless a probe sets
  // `TOVU_CAPABILITY_MANIFEST_ARM` for this process.
  prompt = assemblePromptWithPluginPrefix({ basePrompt: prompt, pluginPromptPrefix: buildCapabilityManifestPrefix(resolveCapabilityManifestArm(env)) });
  // What this boot REFUSED to admit from external MCP servers, in the one channel a model does
  // not have to go looking for. Not a tool, deliberately: a model that does not know it is
  // missing anything never calls the tool that would tell it — see `refusal-notice.ts`. `""`
  // on a clean boot, in which case `assemblePromptWithPluginPrefix` is a no-op.
  prompt = assemblePromptWithPluginPrefix({ basePrompt: prompt, pluginPromptPrefix: pluginPreparation.refusalPrefix });
  prompt = assemblePromptWithPluginPrefix({ basePrompt: prompt, pluginPromptPrefix });
  ports.runState.prompt = prompt;
}

/** The server owns pinned guidance and automatic consent, including later tool-triggered
 * preparation. No controller or plugin lifecycle is constructed in this process. Transport
 * failure remains optional for automatic guidance, but an explicit pinned pick fails closed. */
async function prepareSitePlugins(ports: RunPorts, _required: Record<string, never>, _optional = {}): Promise<{ prefix: string | null; refusalPrefix: string; pluginIds: string[] }> {
  const { siteTools, run, pluginAbort, console, pluginRefIds } = ports;
  try { return await siteTools.preflight({ runId: run.id, signal: pluginAbort.signal }); }
  catch (err) {
    let errorDiagnostic = "[diagnostic unavailable]";
    try { errorDiagnostic = describeErrorForLog({ err }); } catch { /* Keep the original failure path if diagnostics fail. */ }
    console.warn('[agent-plugins] automatic preflight unavailable', errorDiagnostic);
    return { prefix: pluginRefIds.length ? null : "", refusalPrefix: "", pluginIds: [] };
  }
}
/** A durable attempt must still own its answer when the agent is about to launch: a stop or a
 * newer attempt may have taken over while this run was preparing. A non-durable run always does. */
async function durableAttemptStillOwnsAnswer(ports: RunPorts, _optional = {}): Promise<boolean> {
  const { durableMessageId, routeDeps, run } = ports;
  if (!durableMessageId || !routeDeps.chatRunLedger.durable) return true;
  const attempt = await routeDeps.chatRunLedger.durable.find({ runId: run.id }, {});
  return durableAttemptOwnsAnswer({ attempt }, {});
}
