import type { RunPorts } from './agent-daemon-run-start.js';
import type { RunSessionBinding } from './agent-daemon-run-session.js';
import { createRunToolLiveness } from './agent-daemon-run-tool-access.js';
import { type AttachmentRunFields } from "./agent-daemon-scope-attachments.js";
import { assistantRunToolFacts } from './assistant-run-tool-facts.js';
import { readAssistantRunToolPolicy, assistantRunPlan } from './assistant-run-tool-policy.js';
import { admittedToolSources } from '@jini-ai/daemon';
import { type AssistantCliPermissions } from "@tovu/contracts/assistant-subagents-policy";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { ASSISTANT_SETTING_SOURCES } from "./assistant-system-overlay.js";
import { resolveAssistantRuntimeLaunch, type AssistantRuntimeGuidanceInput } from "./assistant-runtime-guidance.js";
import { getCustomFsRoot } from "../../../features/fs-files/custom-root-store.js";
import { claimBrowserForRun, releaseBrowserForRun } from "./assistant-browser-lease.js";

export function createRunLaunch(ports: RunPorts, _optional = {}) {
  return { launchAgentRun: launchAgentRun.bind(undefined, ports) };
}
type LaunchPorts = RunPorts & {
  sessionBinding: RunSessionBinding; attachmentRunFields: AttachmentRunFields; pluginIds: readonly string[];
  policy: Awaited<ReturnType<typeof readAssistantRunToolPolicy>>['policy'];
  nativeToolAccess: boolean; nativeCapabilities: AssistantCliPermissions['capabilities']; subagentsEnabled: boolean;
  parityEnv: NodeJS.ProcessEnv | undefined; pickedFolder: ReturnType<typeof getCustomFsRoot>;
  runtimeLaunch: Awaited<ReturnType<typeof resolveAssistantRuntimeLaunch>>; runGuidance: AssistantRuntimeGuidanceInput;
};
/** Resolves this run's native-tool grant from one launch snapshot and dispatches the agent CLI.
 * Declared after the continuation that calls it so the session binding above stays textually
 * ahead of `agentExecutor.run` (the wiring tests read this file's source in order). */
async function launchAgentRun(ports: RunPorts, 
  { sessionBinding, attachmentRunFields, pluginIds }: { sessionBinding: RunSessionBinding; attachmentRunFields: AttachmentRunFields; pluginIds: readonly string[] }, _optional = {},
): Promise<void> {
  const { getAgentDef, probeAssistantChrome, routeDeps, principal, run, env, readLoginShellEnvironment, getCustomFsRoot, resolvePermissionMode } = ports;
  const { runToolAccessIsLive } = createRunToolLiveness(ports);

  ports.runState.startupStage = 'native tool policy';
  const access = await verifyLaunchToolPolicy(ports, { agentId: sessionBinding.agentId });
  if (!access) return;
  const { snapshot, plan } = access;
  const { isOwner, def, policy, nativeCapabilities } = snapshot;
  warnRunFilesystemLimit(ports, { agentId: sessionBinding.agentId, shell: nativeCapabilities.shell });
  const chatSettings = recordRunToolSnapshot(ports, { snapshot, plan, agentId: sessionBinding.agentId });
  await emitNoToolsNotice(ports, { agentId: sessionBinding.agentId, snapshot, bridged: plan.bridged });
  const nativeToolAccess = Object.values(nativeCapabilities).some(Boolean);
  ports.runState.startupStage = 'tool-gap audit subscription';
  await observeRunToolGaps(ports, { isOwner, agentId: sessionBinding.agentId }, {});
  // One launch snapshot supplies every dimension; edits affect only subsequent runs.
  const subagentsEnabled = nativeCapabilities.subagents;
  // Fresh per-person runtime preferences; a failed read falls back to the registered defaults.
  ports.runState.startupStage = 'runtime preferences';
  const runtimeLaunch = await resolveAssistantRuntimeLaunch({ deps: { settingsRepo: routeDeps.settingsRepo, getEffective: routeDeps.getEffective,
    settingsReady: routeDeps.siteTitleReady, workspaceId: routeDeps.workspaceId }, principalId: principal.id, agentId: sessionBinding.agentId, subagentsEnabled, isOwner }, { getDef: getAgentDef, probeChrome: probeAssistantChrome, claimBrowser: () => claimBrowserForRun({ lease: ports.browserLease, runId: run.id }) });
  ports.runState.startupStage = 'shell environment';
  const parityEnv = nativeCapabilities.loginEnvironment ? await readLoginShellEnvironment({ baseEnv: env,
    excludedPrefixes: ["TOVU_", "JINI_"], excludedKeys: ["DATABASE_URL"], excludedSuffixes: ["_ROOT_KEY"] }, {}) : undefined;
  // Owner 2026-10-27: the folder picked with the composer's folder control is readable, never writable.
  const pickedFolder = getCustomFsRoot({ workspaceId: routeDeps.workspaceId, optional: { siteDir: routeDeps.siteBinding.dir } });
  const runGuidance = { ...runtimeLaunch.guidance, chatSettings, ...(pickedFolder ? { pickedFolder } : {}) };
  ports.runState.startupStage = 'CLI bridge preparation';
  if (!(await prepareCliLaunch(ports, { def, allowed: nativeCapabilities.userMcp }, {}))) return;
  if (!(await runToolAccessIsLive())) return;
  await dispatchRun({ ...ports, sessionBinding, attachmentRunFields, pluginIds, policy, nativeToolAccess, nativeCapabilities, subagentsEnabled, parityEnv, pickedFolder, runtimeLaunch, runGuidance });
}
function executeRun(ports: LaunchPorts, _optional = {}) {
  const { agentExecutor, run, sessionBinding, routeDeps, policy, resolvePermissionMode, nativeToolAccess, nativeCapabilities, pluginIds, parityEnv, subagentsEnabled, resolveAssistantDisallowedTools, env, homedir, existsSync, resolveAssistantRunSettings, model, reasoning, attachmentRunFields, pickedFolder, runtimeLaunch } = ports;
  const { prompt } = ports.runState;
  return agentExecutor.run({
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
    subagentStartContext: { ids: pluginIds, instructions: 'Before you start, call load_agent_plugin for every parent plugin and follow it. Discover Tovu tools with search_tools, describe before executing, honor approvals, and keep file searches inside the site.' },
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
    settings: resolveAssistantRunSettings({ homeDir: (env.HOME ?? env.USERPROFILE ?? homedir()), fileExists: existsSync }),
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
}

async function dispatchRun(ports: LaunchPorts, _optional = {}) {
  const { assistantCliCapabilitiesContext, nativeCapabilities, siteTools, run, isDisposed, runLifecycle, assistantRuntimeGuidanceContext, runGuidance, assistantNativeToolsContext, nativeToolAccess } = ports;
  
  const runWithCapabilities = () => assistantCliCapabilitiesContext.run(nativeCapabilities,
    () => siteTools.withRun({ runId: run.id, fn: () => executeRun(ports).finally(() => releaseBrowserForRun({ lease: ports.browserLease, runId: run.id })) }));
  if (isDisposed()) {
    // Cancellation records intent; no executor exists yet to emit the terminal event and
    // release this run's activity hold after withdrawal during preparation.
    await runLifecycle.finish({ runId: run.id, status: "cancelled", code: null, signal: null, resumable: false });
    return;
  }
  ports.runState.startupStage = 'CLI execution';
  await assistantRuntimeGuidanceContext.run(runGuidance,
    () => assistantNativeToolsContext.run(nativeToolAccess, runWithCapabilities));
}

function warnRunFilesystemLimit(ports: RunPorts, { agentId, shell }: { agentId: string; shell: boolean }): void {
  const { platform, console } = ports;
  if (agentId === 'claude' && platform === 'win32' && shell) console.warn('[agent-daemon] shell is not folder-limited on this platform');
}

async function verifyLaunchToolPolicy(ports: RunPorts, { agentId }: { agentId: string }) {
  const { resolveAgentLaunch, failRunBeforeStart, runLifecycle, run } = ports;
  const { resolveRunNativePolicy, runToolAccessIsLive } = createRunToolLiveness(ports);
  const snapshot = await resolveRunNativePolicy({ agentId });
  if (!(await runToolAccessIsLive())) return null;
  const plan = assistantRunPlan({ snapshot, installed: !!snapshot.def && !!resolveAgentLaunch({ def: snapshot.def }).launchPath });
  if (plan.verdict !== 'RUN') {
    await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: 'Tool access changed before this answer started. Send your message again to review it.' }, {}); return null;
  }
  return { snapshot, plan };
}

function recordRunToolSnapshot(ports: RunPorts, { snapshot, plan, agentId }: {
  snapshot: Awaited<ReturnType<typeof readAssistantRunToolPolicy>>; plan: Extract<ReturnType<typeof assistantRunPlan>, { verdict: 'RUN' }>; agentId: string;
}) {
  const { siteTools, run, visibleRegistry, pluginRefIds, model, reasoning } = ports;
  const { toolAccessRuns, chatSettingsByRunId } = ports.state;
  const tools = siteTools.withRun({ runId: run.id, fn: () => visibleRegistry.list({}) });
  const sources = admittedToolSources({ tools });
  toolAccessRuns.set(run.id, { runId: run.id, agentId, ...sources, pluginIds: [...new Set([...pluginRefIds, ...sources.pluginIds])] });
  const facts = assistantRunToolFacts({ agentId, snapshot, plan, tools, ...(model ? { model } : {}), ...(reasoning ? { effort: reasoning } : {}) });
  chatSettingsByRunId.set(run.id, facts);
  return facts;
}

async function emitNoToolsNotice(ports: RunPorts, { agentId, snapshot, bridged }: { agentId: string; snapshot: Awaited<ReturnType<typeof readAssistantRunToolPolicy>>; bridged: boolean }): Promise<void> {
  const { conversationId, run, runLifecycle } = ports;
  const { noToolsNotices } = ports.state;
  const key = `${conversationId ?? run.id}:${agentId}`;
  if (bridged || noToolsNotices.has(key)) return;
  noToolsNotices.add(key);
  const name = snapshot.def?.name ?? agentId;
  await runLifecycle.emit({ runId: run.id, input: { event: 'agent', data: { type: 'status', label: 'no_tools', detail: `${name} can't use tools provided here. It works with its own.` } } });
}

/** Attach the owner's tool-gap audit to this run; subscription errors abort startup. O(1). */
async function observeRunToolGaps(ports: RunPorts, { isOwner, agentId }: { isOwner: boolean; agentId: string }, _optional = {}): Promise<void> {
  const { createToolGapCollector, routeDeps, principal, conversationId, run, console, runLifecycle } = ports;
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
async function prepareCliLaunch(ports: RunPorts, { def, allowed }: { def: ReturnType<RunPorts['getAgentDef']>; allowed: boolean }, _optional = {}): Promise<boolean> {
  const { ensureJsonAgentInstall, bridgeInjection, env, homedir, platform, failRunBeforeStart, runLifecycle, run } = ports;
  if (def?.externalMcpInjection === 'env-passthrough') {
    try {
      await ensureJsonAgentInstall({ agentId: def.id, allowed, spec: { command: bridgeInjection.command,
        args: [...(bridgeInjection.args ?? [])], env: { ...bridgeInjection.env } },
        ctx: { home: (env.HOME ?? env.USERPROFILE ?? homedir()), platform, serverName: 'jini' } }, {});
    } catch (error) {
      await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: `${def.name}'s connector could not be installed safely in its personal settings. Choose another available agent for this message.`,
        startup: { stage: ports.runState.startupStage, error } }, {}); return false;
    }
  }
  if (def?.fullCliAccessNote) await runLifecycle.emit({ runId: run.id, input: {
    event: 'agent', data: { type: 'status', label: 'full_cli_access', detail: def.fullCliAccessNote },
  } });
  return true;
}
