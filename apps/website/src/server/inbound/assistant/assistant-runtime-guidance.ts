/** Per-run system guidance from the person's runtime preferences and the runtime's declared support.
 * The launch resolves every input once, so the guidance and the argv come from one snapshot; every
 * builder below is pure and the one async resolver takes its reads and def lookup as ports. */
import { agentSupportsChromeIntegration, agentSupportsSubagents, type RuntimeAgentDef } from "@jini-ai/agent-runtime";
import { readAssistantRuntimePreferences, type AssistantRuntimePreferenceDeps } from "../../../assistant/runtime-preferences.js";

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

/** Chrome is used only when the person turned it on, the runtime honors `chromeIntegration`, and
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
  ].filter(text => text !== "").map(text => `${text} `).join("");
}

/** One launch's runtime-preference snapshot: what the guidance says and what the argv carries. */
export interface AssistantRuntimeLaunch {
  guidance: AssistantRuntimeGuidanceInput;
  runOptions: AssistantRuntimeRunOptions;
}

type RuntimeDefLookup = (input: { id: string }) => Pick<RuntimeAgentDef, "supportsSubagents" | "supportsChromeIntegration"> | null;

/** Read the person's preferences fresh and combine them with the runtime's declared support and
 * this run's resolved native capabilities. A failed read falls back to the registered defaults.
 * @complexity O(k) for k fixed preference keys plus one registry lookup. */
export async function resolveAssistantRuntimeLaunch(
  { deps, principalId, agentId, subagentsEnabled, isOwner }: { deps: AssistantRuntimePreferenceDeps; principalId: string; agentId: string; subagentsEnabled: boolean; isOwner: boolean },
  { getDef }: { getDef?: RuntimeDefLookup } = {},
): Promise<AssistantRuntimeLaunch> {
  const preferences = await readAssistantRuntimePreferences({ deps, principalId }, {});
  const lookup = getDef ? { getDef } : {};
  const runtimeSupportsSubagents = agentSupportsSubagents({ agentId }, lookup);
  const runtimeSupportsChrome = agentSupportsChromeIntegration({ agentId }, lookup);
  const claudeInChrome = resolveClaudeInChromeEffective({ useClaudeInChrome: preferences.useClaudeInChrome, runtimeSupportsChrome, isOwner });
  return {
    guidance: { preferSubagents: resolvePreferSubagentsEffective({ preferSubagents: preferences.preferSubagents, runtimeSupportsSubagents, subagentsEnabled }), claudeInChrome },
    runOptions: buildClaudeInChromeRunOptions({ runtimeSupportsChrome, effective: claudeInChrome }),
  };
}
