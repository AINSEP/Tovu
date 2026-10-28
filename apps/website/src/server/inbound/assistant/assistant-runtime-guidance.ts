/** Per-run system guidance from the person's runtime preferences and the runtime's declared support.
 * The launch resolves every input once, so the guidance and the argv come from one snapshot; every
 * builder below is pure and the one async resolver takes its reads and def lookup as ports. */
import { agentSupportsChromeIntegration, agentSupportsSubagents, type RuntimeAgentDef, type RuntimeCapabilityMap } from "@jini-ai/agent-runtime";
import { readAssistantRuntimePreferences, type AssistantRuntimePreferenceDeps, type AssistantRuntimePreferences } from "../../../assistant/runtime-preferences.js";

/** Reply guidance; Normal deliberately contributes no text to the existing overlay. */
export const SHORT_REPLY_GUIDANCE = "Lead with the result in 1–3 lines, then only decisions, approvals, failures or unverified items needing the person; retain the Tool gap line and anything flagged as needing the person, and omit step narration, recaps and change lists unless asked.";
export const DETAILED_REPLY_GUIDANCE = "Explain the cause, what changed and where, what was checked and what was not.";

/** The selected reply instruction, or no addition for Normal. Pure, O(1). */
export function buildReplyLengthGuidance({ replyLength }: { replyLength: AssistantRuntimeGuidanceInput["replyLength"] | undefined }, _options = {}): string {
  if (replyLength === "short") return SHORT_REPLY_GUIDANCE;
  if (replyLength === "detailed") return DETAILED_REPLY_GUIDANCE;
  return "";
}

/** Exact delegation guidance (owner decision 2026-10-21). */
export const PREFER_SUBAGENTS_GUIDANCE =
  "Delegate multi-step or output-heavy work (building or porting a theme, screenshot/visual checks, large reads or many-file edits) " +
  "to a subagent and keep only its summary in the main chat. Do small single calls directly; do not spawn a subagent for a one-step task.";

/** Delegation applies only when all three hold: the person wants it, the runtime declares a native
 * subagent tool, and this run's Task/Agent capability is not denied. Pure, O(1). */
export function resolvePreferSubagentsEffective(
  { preferSubagents, runtimeSupportsSubagents, subagentsEnabled }: { preferSubagents: boolean; runtimeSupportsSubagents: boolean; subagentsEnabled: boolean },
  _options = {},
): boolean {
  return preferSubagents && runtimeSupportsSubagents && subagentsEnabled;
}

/** Guidance text when delegation is effective; empty otherwise. Pure, O(1). */
export function buildPreferSubagentsGuidance({ effective }: { effective: boolean }, _options = {}): string {
  return effective ? PREFER_SUBAGENTS_GUIDANCE : "";
}

/** Exact Claude in Chrome guidance (owner decision 2026-10-21). */
export const CLAUDE_IN_CHROME_GUIDANCE =
  "Claude in Chrome is available: prefer it for checking pages the owner is logged into; otherwise use the existing screenshot/Playwright tools.";

/**
 * The whole Claude in Chrome MCP server, in Claude Code's permission-rule forms: a bare server name
 * and the `mcp__<server>__*` glob. The installed 2.1.307 binary's rule validator documents both
 * ("For all tools of a server, use mcp__<server>__*", examples `mcp__puppeteer__*`), and the server
 * is named `claude-in-chrome` (its tools are `mcp__claude-in-chrome__navigate` and so on). No entry
 * of `ASSISTANT_DISALLOWED_TOOLS` names an MCP tool, so nothing denies these.
 */
export const CLAUDE_IN_CHROME_ALLOWED_TOOLS: readonly string[] = Object.freeze(["mcp__claude-in-chrome", "mcp__claude-in-chrome__*"]);

/** Chrome is used only when the person turned it on, the runtime honors `chromeIntegration` (its
 * def declares it AND the probed CLI accepts `--chrome`; see {@link resolveAssistantRuntimeLaunch}), and
 * the launching principal is the site owner: Claude in Chrome drives the owner's own logged-in
 * browser on this machine, which no other admin's chat may borrow. Pure, O(1). */
export function resolveClaudeInChromeEffective(
  { useClaudeInChrome, runtimeSupportsChrome, isOwner }: { useClaudeInChrome: boolean; runtimeSupportsChrome: boolean; isOwner: boolean },
  _options = {},
): boolean {
  return useClaudeInChrome && runtimeSupportsChrome && isOwner;
}

/** Run options for the executor. A runtime without Chrome support gets nothing (byte-identical
 * argv); a supporting runtime is always told explicitly — `--chrome` plus the server's tools on the
 * allow-list when effective, `--no-chrome` otherwise, so a CLI-level default cannot turn it on.
 * Pure, O(1). */
export function buildClaudeInChromeRunOptions(
  { runtimeSupportsChrome, effective }: { runtimeSupportsChrome: boolean; effective: boolean },
  _options = {},
): AssistantRuntimeRunOptions {
  if (!runtimeSupportsChrome) return {};
  return effective ? { chromeIntegration: true, allowedTools: CLAUDE_IN_CHROME_ALLOWED_TOOLS } : { chromeIntegration: false };
}

/** Values the launch computes for its own run; read synchronously by the prompt augmenter. */
export interface AssistantRuntimeGuidanceInput {
  preferSubagents: boolean;
  claudeInChrome: boolean;
  replyLength: AssistantRuntimePreferences["replyLength"];
  /** The folder the person picked with the composer's folder control (the site's custom fs root). */
  pickedFolder?: string;
}

/** Owner 2026-10-27: the picked folder is readable (read-only) so the agent can build from its assets;
 * writes stay inside the site. Pure, O(1). */
export function buildPickedFolderGuidance({ path }: { path: string }, _options = {}): string {
  return `The person picked the folder "${path}" for this chat. You can read it (read-only); copy anything you need into the site folder and never write into the picked folder.`;
}

/** Spread verbatim into `AgentExecutor.run()`'s optional arguments. */
export interface AssistantRuntimeRunOptions {
  chromeIntegration?: boolean;
  allowedTools?: readonly string[];
}

/** The run's runtime guidance block. Each sentence is followed by a space, matching the overlay
 * blocks it is appended after; empty when nothing applies, leaving the overlay byte-identical.
 * Pure, O(1). */
export function buildAssistantRuntimeGuidance({ input }: { input: AssistantRuntimeGuidanceInput | undefined }, _options = {}): string {
  return [
    buildPreferSubagentsGuidance({ effective: input?.preferSubagents === true }),
    input?.claudeInChrome === true ? CLAUDE_IN_CHROME_GUIDANCE : "",
    buildReplyLengthGuidance({ replyLength: input?.replyLength }),
    input?.pickedFolder ? buildPickedFolderGuidance({ path: input.pickedFolder }) : "",
  ].filter(text => text !== "").map(text => `${text} `).join("");
}

/** One launch's runtime-preference snapshot: what the guidance says and what the argv carries. */
export interface AssistantRuntimeLaunch {
  guidance: AssistantRuntimeGuidanceInput;
  runOptions: AssistantRuntimeRunOptions;
}

type RuntimeDefLookup = (input: { id: string }) => Pick<RuntimeAgentDef, "supportsSubagents" | "supportsChromeIntegration"> | null;

/** Whether the CLI this run will spawn really accepts `--chrome`. Resolves false when unknown. */
export type AssistantChromeProbe = (input: { agentId: string }) => Promise<boolean>;

/** The runtime's own registry, launch resolver, `--help` capability probe and capability map: the
 * same ones the executor's `buildArgs` gate reads, so the guidance and the argv agree. */
export interface AssistantChromeProbeDeps {
  getDef: (input: { id: string }) => RuntimeAgentDef | null;
  resolveAgentLaunch: (input: { def: RuntimeAgentDef }) => { launchPath: string | null };
  ensureAgentCapabilities: (input: { def: RuntimeAgentDef; launchPath: string; env: NodeJS.ProcessEnv }) => Promise<void>;
  capabilities: Pick<ReadonlyMap<string, RuntimeCapabilityMap>, "get">;
  env: NodeJS.ProcessEnv;
}

/**
 * Probe-backed Chrome support. A def's `supportsChromeIntegration` only says its `buildArgs` knows
 * the flag; Jini still drops `--chrome` when the `--help` probe did not find it (an older CLI exits
 * 1 on an unknown option), so the def alone made the prompt promise Claude in Chrome and allow its
 * tools on CLIs that never received the flag. This fills the runtime's probe before the launch reads
 * it — the executor's own `ensureAgentCapabilities` then finds the entry and keeps it, so both read
 * one result — and reports the probed `chrome` flag. Any failure reads false (fail closed).
 * Limit: the probe sees `--help`, not whether the browser extension is connected.
 * @complexity O(1) after the first call per agent; the first costs one `--help` spawn.
 */
export function createAssistantChromeProbe(deps: AssistantChromeProbeDeps, _options = {}): AssistantChromeProbe {
  return async ({ agentId }) => {
    try {
      const def = deps.getDef({ id: agentId });
      const launchPath = def ? deps.resolveAgentLaunch({ def }).launchPath : null;
      if (!def || !launchPath) return false;
      // The def's declared env is a default the host env overrides, as in the executor's own launch.
      await deps.ensureAgentCapabilities({ def, launchPath, env: { ...def.env, ...deps.env } });
      return deps.capabilities.get(def.id)?.chrome === true;
    } catch {
      return false;
    }
  };
}

/** Read the person's preferences fresh and combine them with the runtime's declared support and
 * this run's resolved native capabilities. A failed read falls back to the registered defaults.
 * Chrome support also needs `probeChrome` to confirm the CLI accepts `--chrome`; without a probe
 * it is treated as unsupported, which emits no flag (byte-identical to Jini's own drop).
 * @complexity O(k) for k fixed preference keys plus one registry lookup and at most one probe. */
export async function resolveAssistantRuntimeLaunch(
  { deps, principalId, agentId, subagentsEnabled, isOwner }: { deps: AssistantRuntimePreferenceDeps; principalId: string; agentId: string; subagentsEnabled: boolean; isOwner: boolean },
  { getDef, probeChrome }: { getDef?: RuntimeDefLookup; probeChrome?: AssistantChromeProbe } = {},
): Promise<AssistantRuntimeLaunch> {
  const preferences = await readAssistantRuntimePreferences({ deps, principalId }, {});
  const lookup = getDef ? { getDef } : {};
  const runtimeSupportsSubagents = agentSupportsSubagents({ agentId }, lookup);
  const runtimeSupportsChrome = agentSupportsChromeIntegration({ agentId }, lookup) && await probeChrome?.({ agentId }) === true;
  const claudeInChrome = resolveClaudeInChromeEffective({ useClaudeInChrome: preferences.useClaudeInChrome, runtimeSupportsChrome, isOwner });
  return {
    guidance: { preferSubagents: resolvePreferSubagentsEffective({ preferSubagents: preferences.preferSubagents, runtimeSupportsSubagents, subagentsEnabled }), claudeInChrome, replyLength: preferences.replyLength },
    runOptions: buildClaudeInChromeRunOptions({ runtimeSupportsChrome, effective: claudeInChrome }),
  };
}
