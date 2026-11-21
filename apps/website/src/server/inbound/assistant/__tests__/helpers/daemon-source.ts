import { createRunStartHandler, type RunStartRequired, type RunStartOptional } from '../../agent-daemon-run-start.js';
import { createLiveRunTracker } from '#src/assistant/agent-session-preset';
import { assistantCliPermissions, resolveFullCliAccess, resolveAssistantCliPermissions, fullCliEnvLock, isHostedAssistantRuntime } from "@tovu/contracts/assistant-native-fallbacks";
import { resolveNativeToolPolicy } from "@jini-ai/agent-runtime/native-tool-policy";
import { resolveHostSignals } from "#src/server/runtime/composition/host-signals";
import { createToolGapCollector } from "@jini-ai/daemon/tool-audit";
import { redactSecretShapes } from "#src/contracts/core/secret-redaction";
import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { admittedToolSources, type AgentExecutorRunInput, type RunLifecycle } from "@jini-ai/daemon";
import { createChatSettingsSnapshot } from "@jini-ai/daemon/chat-settings";
import { isTerminalRunState } from "@jini-ai/protocol";
import { type readAssistantRunToolPolicy as ReadAssistantRunToolPolicy, assistantRunPlan, assistantToolSetupMessage } from "../../assistant-run-tool-policy.js";
import { assistantRunToolFacts } from "../../assistant-run-tool-facts.js";

import { createEarlySessionCapture } from "../../early-run-session.js";
import type { AgentSessionStore } from "#src/assistant/persistence/agent-session-store";
import { parseRunStartContextRef } from "#src/assistant/run-start-context";
import { buildPageContextPromptBlock } from "#src/assistant/run-page-context";
import { createRunActiveContextStore, type RunActiveContextStore } from "#src/assistant/run-active-context";
import { assemblePromptWithPluginPrefix } from "../../plugin-prompt-assembly.js";
import { agentCarriesOwnMemory, resolveResumeSessionField, wouldForcedColdStartLoseConversationContext } from "../../../../../assistant/agent-session-preset.js";
import { agentAcceptsHostMintedSessionId, resolveHostMintedSessionId, resolveNewSessionField } from "../../../../../assistant/agent-session-preset.js";
import { createConversationStartLock } from "../../../../../assistant/agent-session-preset.js";
import { formatRunEndLogLine, formatRunErrorLogLine } from "../../run-log-lines.js";
import { durableAttemptOwnsAnswer, resolveStoredSessionId, selectRunHistoryPrompt } from "../../run-start-decisions.js";
import { ASSISTANT_DISALLOWED_TOOLS, ASSISTANT_SETTING_SOURCES, resolveAssistantDisallowedTools, resolveAssistantRunSettings } from "../../assistant-system-overlay.js";
import { resolveAssistantRuntimeLaunch } from "../../assistant-runtime-guidance.js";
import { claimBrowserForRun, releaseBrowserForRun, releasingBrowserToo } from "../../assistant-browser-lease.js";
import { createAgentSelectionResolver, getAgentDef } from "@jini-ai/agent-runtime";
import { createTracker } from "@jini-ai/diagnostics/observability/node";

const rawSource = ts.createSourceFile(
  "agent-daemon-scope.ts",
  readFileSync(path.join(import.meta.dirname, "../../agent-daemon-scope.ts"), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
);

// Inspect only the actual factory's unconditional body and its failure-cleanup try block.
// Arbitrary nested conditionals or dead helpers must never satisfy the wiring assertions.
const scopeFactory = rawSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "createSiteScope");
assert.ok(scopeFactory && ts.isFunctionDeclaration(scopeFactory) && scopeFactory.body);
const scopeTry = scopeFactory.body.statements.find(ts.isTryStatement);
assert.ok(scopeTry);
export const daemonManifest = new Map<string, Map<string, readonly ts.Statement[]>>([
  ["agent-daemon-scope.ts", new Map([
    ["<file>", [...rawSource.statements]],
    ["createSiteScope", [...scopeFactory.body.statements]],
    ["createSiteScope.try", [...scopeTry.tryBlock.statements]],
  ])],
]);
for (const [file, owners] of [
  ["agent-daemon-scope-http.ts", ["createScopeApp", "resolvePrincipal", "resolveDiscoveryCaller", "mountIntake", "mountGuards", "mountToolAccessLowering", "mountRunRoutes", "mountDelegatedRoutes", "mountSurfaceRoutes", "mountDiscoveryRoutes"]],
  ["agent-daemon-scope-attachments.ts", ["createAttachmentRunFieldsResolver", "resolveAttachmentRunFields", "readStagedAttachment", "createRunUserMessageDelivery", "deliverRunUserMessage", "openScopeAttachments", "mountScopeAttachments"]],
  ["agent-daemon-run-start.ts", ["createRunStartHandler", "onStarted", "holdRun", "noteFullRunInput", "decodeRunStart", "registerLiveRun", "scheduleTerminalCleanup", "prepareRun", "assembleRunPrompt", "prepareSitePlugins", "durableAttemptStillOwnsAnswer"]],
  ["agent-daemon-run-session.ts", ["subscribeRunSession", "logRunSessionEvent", "clearFailedRunResume", "readPriorSessionId", "resolveSessionBinding", "refuseConcurrentMemoryRun", "persistRunSession"]],
  ["agent-daemon-run-tool-access.ts", ["createRunToolLiveness", "createRunToolChoice", "createRunToolConsent", "resolveRunNativePolicy", "runToolAccessIsLive", "runToolAccessLive", "runToolSetupMessage", "qualifyRunAlternative", "prepareRunToolAccess", "prepareAgentToolChoice", "prepareUnavailableToolChoice", "askForRunToolAccess", "withRunToolAccessCard", "qualifiedRunAlternatives"]],
  ["agent-daemon-run-launch.ts", ["createRunLaunch", "launchAgentRun", "executeRun", "dispatchRun", "warnRunFilesystemLimit", "verifyLaunchToolPolicy", "recordRunToolSnapshot", "emitNoToolsNotice", "observeRunToolGaps", "prepareCliLaunch"]],
  ["agent-daemon-scope-runtime.ts", ["createScopeRuntime", "resolvePermissionMode", "createScopePromptAugmenter", "createScopeBridge", "createScopeAgentExecutor", "startBridgeProbe"]],
  ["agent-daemon-scope-tools.ts", ["createScopeToolRegistry", "createScopeToolExecutor"]],
  ["agent-daemon-scope-lifetime.ts", ["createScopeLifetime", "hold", "dispose"]],
] as const) {
  const source = ts.createSourceFile(file, readFileSync(path.join(import.meta.dirname, "../../", file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const bodies = new Map<string, readonly ts.Statement[]>([["<file>", [...source.statements]]]);
  for (const owner of owners) {
    const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === owner);
    assert.ok(fn && ts.isFunctionDeclaration(fn) && fn.body, `Missing manifest function ${file}:${owner}`);
    bodies.set(owner, [...fn.body.statements]);
  }
  daemonManifest.set(file, bodies);
}
for (const owner of ["createScopeRunState", "createScopeTracing", "unwindScope"]) {
  const fn = rawSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === owner);
  assert.ok(fn && ts.isFunctionDeclaration(fn) && fn.body);
  daemonManifest.get("agent-daemon-scope.ts")!.set(owner, [...fn.body.statements]);
}
export const daemonStatements = [
  ...rawSource.statements.filter(statement => statement !== scopeFactory),
  ...scopeFactory.body.statements.flatMap(statement => ts.isTryStatement(statement) ? [...statement.tryBlock.statements] : [statement]),
];
export const daemonSource = ts.factory.updateSourceFile(rawSource, daemonStatements);

export function statementsFor(file: string, owner: string): readonly ts.Statement[] {
  const statements = daemonManifest.get(file)?.get(owner);
  assert.ok(statements, `No manifest body ${file}:${owner}`);
  return statements;
}

export function daemonInitializer(name: string, statements?: readonly ts.Statement[]): ts.Expression {
  const initializers = new Map<string, ts.Expression[]>();
  for (const bodies of (statements ? [new Map([["selected", statements]])] : daemonManifest.values())) {
    for (const statements of bodies.values()) {
      for (const statement of statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (!declaration.initializer) continue;
          const key = declaration.name.getText(declaration.getSourceFile());
          initializers.set(key, [...(initializers.get(key) ?? []), declaration.initializer]);
        }
      }
    }
  }
  const matches = initializers.get(name) ?? [];
  assert.equal(matches.length, 1, `Expected one direct initializer for ${name}; found ${matches.length}`);
  return matches[0]!;
}

/** Execute the actual source expression, with its external dependencies supplied by the test.
 * AST boundaries exclude comments and nested lookalikes. This avoids booting the entry script's
 * database, listeners, federation and agent processes, without duplicating its run assembly. */
export function evaluateDaemonExpression<T>(expression: ts.Node, bindings: Record<string, unknown>): T {
  const code = ts.transpileModule(`return (${expression.getText(expression.getSourceFile())});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const scopedBindings = { env: { ...process.env }, authEnv: { ...process.env }, siteId: "test-scope", disposed: false, ownerRetentionTimers: new Set(), ...bindings };
  return new Function(...Object.keys(scopedBindings), code)(...Object.values(scopedBindings)) as T;
}

/** Run the complete onStarted callback through its async continuation to the executor boundary.
 * Only unrelated lifecycle/attachment/plugin I/O is faked; decode, prompt rendering, session
 * decisions and hook-settings generation are real. No daemon/server/CLI is started. */
export async function captureDaemonRun(
  context: Record<string, unknown>,
  options: { runId?: string; executorSettles?: Promise<unknown>; hookPresent?: boolean; runActiveContexts?: RunActiveContextStore; bindings?: Record<string, unknown>; lifecycle?: unknown; terminalFailure?: boolean; request?: Record<string, unknown> } = {},
): Promise<AgentExecutorRunInput> {
  let resolve!: (input: AgentExecutorRunInput) => void;
  let reject!: (error: Error) => void;
  const captured = new Promise<AgentExecutorRunInput>((yes, no) => { resolve = yes; reject = no; });
  const timer = setTimeout(() => reject(new Error("onStarted did not call the executor")), 1000);
  const fixtureDeps = options.bindings?.routeDeps as { agentSessions?: AgentSessionStore } | undefined;
  const runId = options.runId ?? "daemon-test-run";
  const bindings = {
    env: { ...((options.bindings?.process as { env?: NodeJS.ProcessEnv } | undefined)?.env ?? process.env), HOME: "/home/daemon-test" },
    idlePark: { hold: () => () => {} },
    stagedAttachmentCleanupByRunId: new Map(),
    chatSettingsByRunId: new Map(), toolAccessRuns: new Map(), revokedToolRuns: new Set(), noToolsNotices: new Set(), cleanupFailures: new Map(),
    visibleRegistry: { list: () => [] }, createChatSettingsSnapshot, admittedToolSources, isTerminalRunState,
    assistantRunPlan, assistantToolSetupMessage, assistantRunToolFacts, surfaceExchanges: {},
    resolveAgentLaunch: () => ({ launchPath: process.execPath }),
    assistantInventory: { listAssistantAgents: async () => [{ id: options.request?.agentId ?? "claude", available: true, authStatus: "unknown" }] },
    ownerRetentionTimers: new Set(), siteId: "test-scope", tracing: { noteRunInput() {} },
    captureEarlySession: createEarlySessionCapture({ sessions: fixtureDeps?.agentSessions ?? { getSessionId: async () => null, setSessionId: async () => {}, clearSessionId: async () => {} }, readStart: async () => null }, {}),
    parseRunStartContextRef, buildPageContextPromptBlock, assemblePromptWithPluginPrefix,
    agentCarriesOwnMemory, resolveResumeSessionField, wouldForcedColdStartLoseConversationContext,
    agentAcceptsHostMintedSessionId, resolveHostMintedSessionId, resolveNewSessionField,
    ASSISTANT_DISALLOWED_TOOLS, ASSISTANT_SETTING_SOURCES, resolveAssistantDisallowedTools, resolveAssistantRunSettings,
    formatRunEndLogLine, formatRunErrorLogLine,
    durableAttemptOwnsAnswer, resolveStoredSessionId, selectRunHistoryPrompt,
    readAssistantCliPermissions: async (_required?: unknown, _optional?: unknown) => assistantCliPermissions({ enabled: true }),
    assistantCliCapabilitiesContext: new AsyncLocalStorage<ReturnType<typeof assistantCliPermissions>["capabilities"]>(),
    assistantNativeToolsContext: new AsyncLocalStorage<boolean>(),
    // Real preference resolution; fixtures without settings ports read the registered defaults.
    resolveAssistantRuntimeLaunch, claimBrowserForRun, releaseBrowserForRun, releasingBrowserToo, optional: {},
    // These wiring fixtures exercise already-consented run assembly, not live isolation claims.
    // Real registry definitions remain conservative and are covered by the planner/consent contracts.
    getAgentDef: ({ id }: { id: string }) => {
      const def = getAgentDef({ id });
      return def && ["claude", "codex"].includes(id) ? { ...def, mcpIsolation: { perRun: "fixture@2026-11-05" } } : def;
    },
    assistantRuntimeGuidanceContext: new AsyncLocalStorage(),
    // A CLI whose `--help` lists `--chrome`; fixtures override it to model an older CLI.
    probeAssistantChrome: async () => true,
    // No picked folder unless a fixture sets one (the run reads the site's custom fs root).
    getCustomFsRoot: () => undefined,
    verifyJsonAgentInstall: async () => {}, bridgeInjection: { command: "host-bridge" }, readFile: async () => "",
    // Preserve existing preflight spies at the recovery boundary; recovery I/O has its own tests.
    ensureJsonAgentInstall: async (): Promise<void> => { await bindings.verifyJsonAgentInstall(); },
    resolveNativeToolPolicy, resolveFullCliAccess, resolveAssistantCliPermissions, resolveHostSignals, assistantCliPermissions, createToolGapCollector, redactSecretShapes, describeErrorForLog,
    readAssistantRunToolPolicy: async (required: { deps: { ownerPrincipalId?: Promise<string>; settingsUiTabsReady?: Promise<void> }; principalId: string; agentId: string; env: NodeJS.ProcessEnv; getDef: typeof getAgentDef }): Promise<Awaited<ReturnType<typeof ReadAssistantRunToolPolicy>>> => {
      const isOwner = required.principalId === await required.deps.ownerPrincipalId;
      const hostSignals = bindings.resolveHostSignals({ env: required.env });
      const settings = bindings.resolveFullCliAccess({ isOwner, env: required.env }, { hostSignals })
        ? await bindings.readAssistantCliPermissions({ ...required.deps, principalId: required.principalId, settingsReady: required.deps.settingsUiTabsReady }, {}) : assistantCliPermissions({ enabled: false });
      const effective = bindings.resolveAssistantCliPermissions({ isOwner, env: required.env, settings, agentId: required.agentId }, { hostSignals });
      const def = required.getDef({ id: required.agentId });
      const policy = bindings.resolveNativeToolPolicy({ def: def ?? {}, policy: { nativeToolAccess: effective.enabled, nativeCapabilities: effective.capabilities } });
      const lock = !isOwner ? "not_owner" : isHostedAssistantRuntime({ env: required.env }, { hostSignals }) ? "hosted" : fullCliEnvLock({ env: required.env });
      return { isOwner, def, settings, effective, policy, nativeCapabilities: effective.capabilities, lock, settingsSource: "site" as const };
    },
    requestAssistantToolConsent: async () => { reject(new Error("Tool access requires owner consent before launch (ASK).")); return { status: "cancelled" as const }; },
    readLoginShellEnvironment: async () => ({ PATH: "/test/login-shell" }),
    siteTools: { start: async () => {}, preflight: async () => ({ prefix: "", refusalPrefix: "", pluginIds: [] }),
      withRun: ({ fn }: { fn: () => unknown }) => fn(), finish() {} },
    DEFAULT_AGENT_ID: "claude",
    principalByRunId: new Map(),
    messageAttachmentRefsByRunId: new Map(),
    durableMessageIdsByRunId: new Map(),
    runOwners: { record() {}, forget() {} }, runCredentials: { revoke() {} },
    liveRunTracker: createLiveRunTracker({}, {}),
    runActiveContexts: options.runActiveContexts ?? createRunActiveContextStore(),
    frontendControl: { bindOnStarted() {} },
    customInstructionsCache: { refresh: async () => {} },
    resolveAttachmentRunFields: async () => ({}),
    buildCapabilityManifestPrefix: () => "",
    resolveCapabilityManifestArm: () => "off",
    conversationStartLock: createConversationStartLock({}, {}),
    randomUUID: () => "unused-session-id",
    process: { env: {}, cwd: () => "/tmp/daemon-test" },
    resolvePermissionMode: () => "bypass",
    homedir: () => "/home/daemon-test",
    existsSync: (file: string) => options.hookPresent === true && file === "/home/daemon-test/.claude/hooks/no-system-search",
    failRunBeforeStart: async ({ message }: { message: string }) => { reject(new Error(message)); },
    // The bound runtime's startup-failure formatter; the real binding supplies it in production.
    startupMessage: ({ stage }: { stage: string }) => `startup failed at ${stage}`,
    console: { error: (...args: unknown[]) => { if (!options.terminalFailure) reject(new Error(args.map(String).join(" "))); }, log() {}, warn() {} },
    // Automatic Agent plugins preflight is fail-open and owned by its own tests; this capture
    // isolates onStarted's other wiring.
    AbortController,
    // `run()` takes Jini's (required, optional) pair; the executor reassembles one
    // AgentExecutorRunInput from them, so the capture does the same.
    agentExecutor: { run: async (required: AgentExecutorRunInput, optional: Partial<AgentExecutorRunInput> = {}) => { resolve({ ...required, ...optional }); await options.executorSettles; } },
    ...options.bindings,
    // Partial fixture ports still need the site directory used by every CLI launch.
    routeDeps: { workspaceId: "ws-daemon-test", tracker: createTracker({}), siteBinding: { dir: tmpdir() }, chatRunLedger: {}, ...fixtureDeps,
      agentSessions: { getSessionId: async () => null, setSessionId: async () => {}, clearSessionId: async () => {}, ...fixtureDeps?.agentSessions } },
  };
  // Evaluate the production resolver's wiring with this fixture's registry and warning sink.
  Object.assign(bindings, { resolveAssistantAgentId: evaluateDaemonExpression(daemonInitializer("resolveAssistantAgentId"), {
    createAgentSelectionResolver, getAgentDef: bindings.getAgentDef, DEFAULT_AGENT_ID: bindings.DEFAULT_AGENT_ID, console: bindings.console,
  }) });
  try {
    if (!options.bindings?.routeDeps) assert.equal(context.conversationId, undefined, "session I/O requires explicit fixture ports");
    if (options.terminalFailure) {
      assert.ok(options.lifecycle, "terminal failure capture requires a real lifecycle");
      void (options.lifecycle as Pick<RunLifecycle, "waitForTerminal">).waitForTerminal({ runId }).then((status) => {
        if (status.state === "failed") reject(new Error("onStarted failed the run before executor dispatch"));
      });
    }
    const ports = bindings as unknown as RunStartRequired & RunStartRequired["state"] & RunStartOptional & { attachmentStore?: ReturnType<RunStartRequired["getAttachmentStore"]>; disposed?: boolean; optional?: { browserLease?: RunStartOptional["browserLease"] }; RUN_OWNER_RETENTION_MS?: number; STOPPING_RUN_WAIT_MS?: number; CONCURRENT_RUN_REFUSAL_MESSAGE?: string; verifyJsonAgentInstall?: RunStartOptional["ensureJsonAgentInstall"]; process?: { platform?: NodeJS.Platform } };
    const onStarted = createRunStartHandler({
      state: { principalByRunId: ports.principalByRunId, messageAttachmentRefsByRunId: ports.messageAttachmentRefsByRunId, durableMessageIdsByRunId: ports.durableMessageIdsByRunId, stagedAttachmentCleanupByRunId: ports.stagedAttachmentCleanupByRunId, chatSettingsByRunId: ports.chatSettingsByRunId, toolAccessRuns: ports.toolAccessRuns, revokedToolRuns: ports.revokedToolRuns, noToolsNotices: ports.noToolsNotices, cleanupFailures: ports.cleanupFailures, liveRunTracker: ports.liveRunTracker, runOwners: ports.runOwners, runCredentials: ports.runCredentials, conversationStartLock: ports.conversationStartLock, ownerRetentionTimers: ports.ownerRetentionTimers },
      siteId: ports.siteId, env: ports.env, routeDeps: ports.routeDeps, siteTools: ports.siteTools, agentExecutor: ports.agentExecutor, startupMessage: ports.startupMessage, customInstructionsCache: ports.customInstructionsCache, idlePark: ports.idlePark, getAgentDef: ports.getAgentDef, resolveAgentLaunch: ports.resolveAgentLaunch, resolveAssistantAgentId: ports.resolveAssistantAgentId, assistantInventory: ports.assistantInventory, visibleRegistry: ports.visibleRegistry, surfaceExchanges: ports.surfaceExchanges, frontendControl: ports.frontendControl, captureEarlySession: ports.captureEarlySession, bridgeInjection: ports.bridgeInjection, resolvePermissionMode: ports.resolvePermissionMode, probeAssistantChrome: ports.probeAssistantChrome, tracing: ports.tracing, runActiveContexts: ports.runActiveContexts, assistantCliCapabilitiesContext: ports.assistantCliCapabilitiesContext, assistantNativeToolsContext: ports.assistantNativeToolsContext, assistantRuntimeGuidanceContext: ports.assistantRuntimeGuidanceContext,
      getAttachmentStore: () => ports.attachmentStore, isDisposed: () => ports.disposed ?? false,
    }, Object.fromEntries(Object.entries({
      console: ports.console, setTimeout: ports.setTimeout, resolveAttachmentRunFields: ports.resolveAttachmentRunFields, failRunBeforeStart: ports.failRunBeforeStart, waitForStoppingRuns: ports.waitForStoppingRuns, extractSessionRefFromEndEvent: ports.extractSessionRefFromEndEvent, shouldClearSessionOnFailedResume: ports.shouldClearSessionOnFailedResume, agentCarriesOwnMemory: ports.agentCarriesOwnMemory, createToolGapCollector: ports.createToolGapCollector, resolveHostSignals: ports.resolveHostSignals, readLoginShellEnvironment: ports.readLoginShellEnvironment, requestAssistantToolConsent: ports.requestAssistantToolConsent, readAssistantRunToolPolicy: ports.readAssistantRunToolPolicy, randomUUID: ports.randomUUID, homedir: ports.homedir, existsSync: ports.existsSync, getCustomFsRoot: ports.getCustomFsRoot, parseRunStartContextRef: ports.parseRunStartContextRef, buildPageContextPromptBlock: ports.buildPageContextPromptBlock, wouldForcedColdStartLoseConversationContext: ports.wouldForcedColdStartLoseConversationContext, resolveAssistantDisallowedTools: ports.resolveAssistantDisallowedTools, resolveAssistantRunSettings: ports.resolveAssistantRunSettings,
      browserLease: ports.optional?.browserLease, platform: ports.process?.platform ?? process.platform,
      ownerRetentionMs: ports.RUN_OWNER_RETENTION_MS, stoppingRunWaitMs: ports.STOPPING_RUN_WAIT_MS, concurrentRunRefusalMessage: ports.CONCURRENT_RUN_REFUSAL_MESSAGE,
      ensureJsonAgentInstall: ports.verifyJsonAgentInstall ?? ports.ensureJsonAgentInstall,
    }).filter(([, value]) => value !== undefined)) as RunStartOptional);
    onStarted({
      request: { contextRef: JSON.stringify({ principalId: "daemon-test-principal", prompt: "Exercise the run lifecycle", ...context }), ...options.request },
      run: { id: runId, state: "running" },
      lifecycle: withDaemonLifecycle({ lifecycle: options.lifecycle ?? { waitForTerminal: () => new Promise(() => {}) } }) as Parameters<typeof onStarted>[0]["lifecycle"],
    });
    return await captured;
  } finally {
    clearTimeout(timer);
  }
}

/** Complete partial lifecycle fakes for cancel subscriptions, telemetry/tool-gap streams and
 * trusted status emissions (3f93c4618). Real lifecycle methods and explicit test spies stay intact.
 */
export function withDaemonLifecycle({ lifecycle }: { lifecycle: unknown }, _optional = {}): unknown {
  const has = (name: string) => typeof (lifecycle as Record<string, unknown>)[name] === "function";
  if (has("onCancelRequested") && has("stream") && has("emit") && has("get")) return lifecycle;
  return Object.assign(Object.create(lifecycle as object), {
    ...(has("onCancelRequested") ? {} : { onCancelRequested: () => () => {} }),
    ...(has("stream") ? {} : { stream: async () => {} }),
    ...(has("emit") ? {} : { emit: async () => {} }),
    ...(has("get") ? {} : { get: async () => ({ state: "running" }) }),
    ...(has("finish") ? {} : { finish: async () => {} }),
  });
}

/** Select only direct statements: a commented-out or unreachable lookalike cannot satisfy a seam. */
export function daemonFunction(name: string): ts.FunctionDeclaration {
  const functions = new Map<string, ts.FunctionDeclaration[]>();
  for (const bodies of daemonManifest.values()) {
    for (const statements of bodies.values()) {
      for (const statement of statements) {
        if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
        const key = statement.name.text;
        functions.set(key, [...(functions.get(key) ?? []), statement]);
      }
    }
  }
  const matches = functions.get(name) ?? [];
  assert.equal(matches.length, 1, `Expected one direct function ${name}; found ${matches.length}`);
  return matches[0]!;
}

export function daemonVariableStatement(statements: readonly ts.Statement[], name: string): ts.VariableStatement {
  const statement = statements.find((entry) => ts.isVariableStatement(entry) && entry.declarationList.declarations.some((declaration) => declaration.name.getText(declaration.getSourceFile()) === name));
  assert.ok(statement && ts.isVariableStatement(statement), `No direct variable statement ${name}`);
  return statement;
}

export function evaluateDaemonStatements<T>(statements: readonly ts.Statement[], bindings: Record<string, unknown>, result = "undefined"): Promise<T> {
  const code = ts.transpileModule(`return (async () => { ${statements.map((statement) => statement.getText(statement.getSourceFile())).join("\n")} return (${result}); })();`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const scopedBindings = { env: { ...process.env }, authEnv: { ...process.env }, siteId: "test-scope", disposed: false, ownerRetentionTimers: new Set(), ...bindings };
  return new Function(...Object.keys(scopedBindings), code)(...Object.values(scopedBindings)) as Promise<T>;
}
