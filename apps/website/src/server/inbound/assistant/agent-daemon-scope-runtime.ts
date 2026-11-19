import { createDaemonSiteTools } from "./agent-daemon-site-tools.js";
import { buildAssistantFilesystemNotices } from "./assistant-filesystem-notices.js";
import { assistantCliPermissions } from "@tovu/contracts/assistant-native-fallbacks";
import { resolveHostSignals } from "#src/server/runtime/composition/host-signals";
import { type AssistantCliPermissions } from "@tovu/contracts/assistant-subagents-policy";
import { AsyncLocalStorage } from "node:async_hooks";
import { ensureToolExecToken } from "#src/assistant/daemon-access";
import { createToolRegistry } from "@jini-ai/core";
import { createAgentExecutor, probeMcpBridge, type RunLifecycle } from "@jini-ai/daemon";
import { formatBridgePreflightLogLine } from "./run-log-lines.js";
import { bridgePreflightEntry } from "./bridge-preflight-entry.js";
// @jini-ai/agent-runtime owns this seam; @jini-ai/daemon accepts it as an option.
import type { PromptAugmenter } from "@jini-ai/core/contracts/agents";
import { createAgentSelectionResolver, createNativeAgentRuntime, ensureAgentCapabilities } from "@jini-ai/agent-runtime";
import { executorDefinitionPolicies } from "./executor-definition-policies.js";
import { buildBaseSystemOverlay, buildAssistantSubagentsOverlay } from "./assistant-system-overlay.js";
import { buildAssistantRuntimeGuidance, createAssistantChromeProbe, type AssistantRuntimeGuidanceInput } from "./assistant-runtime-guidance.js";
import { resolveAgentPermissionMode } from "#src/contracts/core/agent-permission-mode";
import { createAssistantAgentInventory } from "#src/assistant/agents";
import { createCustomInstructionsCache } from "#src/assistant/custom-instructions";
import { resolveMcpJsonInjection } from "#src/assistant/mcp-injection";

export function createScopeRuntime({ env, toolExecTokenHolder }: { env: NodeJS.ProcessEnv; toolExecTokenHolder: NodeJS.ProcessEnv }, _optional = {}) {
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

  return { DEFAULT_AGENT_ID, siteToolToken, assistantRuntime, assistantInventory, getAgentDef, resolveAgentLaunch, resolveAssistantAgentId, probeAssistantChrome,
    resolvePermissionMode: resolvePermissionMode.bind(undefined, { env }) };
}

/**
 * The agent CLI's permission mode for this daemon process. The rule and its full "why" (no TTY to
 * answer a prompt; bypass unless `TOVU_RUNTIME_MODE=production`; explicit
 * local `TOVU_AGENT_PERMISSION_MODE` overrides, hosted always restricted) live in `contracts/core/agent-permission-mode.ts`, shared with
 * the boot-readiness warning so both always agree on the mode this daemon actually runs in.
 */
function resolvePermissionMode({ env }: { env: NodeJS.ProcessEnv }, _optional = {}): "bypass" | "restricted" {
  return resolveAgentPermissionMode({ env: env }, { hostSignals: resolveHostSignals({ env: env }) });
}


export function createScopePromptAugmenter({ getAgentDef, bashProhibitionEnabled, assistantNativeToolsContext, assistantCliCapabilitiesContext,
  assistantRuntimeGuidanceContext, customInstructionsCache }: {
  getAgentDef: ReturnType<typeof createNativeAgentRuntime>['getAgentDef']; bashProhibitionEnabled: boolean;
  assistantNativeToolsContext: AsyncLocalStorage<boolean>; assistantCliCapabilitiesContext: AsyncLocalStorage<AssistantCliPermissions['capabilities']>;
  assistantRuntimeGuidanceContext: AsyncLocalStorage<AssistantRuntimeGuidanceInput>;
  customInstructionsCache: Pick<ReturnType<typeof createCustomInstructionsCache>, 'readOverlay'>;
}, _optional = {}) {
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
    const baseOverlay = buildBaseSystemOverlay({ bashProhibitionEnabled }, {
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

  return assistantPromptAugmenter;
}

export function createScopeBridge({ daemonUrl, env, registry, visibleRegistry, mintRunCredential }: {
  daemonUrl: string; env: NodeJS.ProcessEnv; registry: ReturnType<typeof createToolRegistry>; visibleRegistry: ReturnType<typeof createDaemonSiteTools>['registry'];
  mintRunCredential: (runId: string) => string;
}, _optional = {}) {
// Each run's bridge gets its own credential, resolved back to that run's principal; see
// `Jini packages/daemon/src/run-credentials.ts`. A closure because `runCredentials` is declared further down.
const bridgeInjection = {
  toolApprovalOwner: "host" as const,
  ...resolveMcpJsonInjection({ daemonUrl: daemonUrl, mintRunCredential }, { runtime: {
    execPath: process.execPath, electronVersion: process.versions.electron, env,
  } }),
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
  return bridgeInjection;
}

export function createScopeAgentExecutor({ lifecycle, getAgentDef, resolveAgentLaunch, assistantRuntime, cleanupFailures, bridgeInjection, assistantPromptAugmenter }: {
  lifecycle: RunLifecycle; getAgentDef: ReturnType<typeof createNativeAgentRuntime>['getAgentDef'];
  resolveAgentLaunch: ReturnType<typeof createNativeAgentRuntime>['resolveAgentLaunch']; assistantRuntime: ReturnType<typeof createNativeAgentRuntime>;
  cleanupFailures: Set<string>; bridgeInjection: ReturnType<typeof createScopeBridge>; assistantPromptAugmenter: PromptAugmenter;
}, _optional = {}) {
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
  ...executorDefinitionPolicies({ runtime: assistantRuntime }),
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

  return agentExecutor;
}

export function startBridgeProbe({ bridgeInjection }: { bridgeInjection: ReturnType<typeof createScopeBridge> }, _optional = {}) {
void probeMcpBridge({ entry: bridgePreflightEntry({ injection: bridgeInjection }) }, {}).then((result) => {
  const line = formatBridgePreflightLogLine({ result });
  if (result.ok) console.log(line);
  else console.error(line);
});
}
