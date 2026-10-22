/** Per-run system guidance from the person's runtime preferences and the runtime's declared support.
 * The launch resolves every input once, so the guidance and the argv come from one snapshot; every
 * builder below is pure and the one async resolver takes its reads and def lookup as ports. */
import { agentSupportsSubagents, type RuntimeAgentDef } from "@jini-ai/agent-runtime";
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

/** Values the launch computes for its own run; read synchronously by the prompt augmenter. */
export interface AssistantRuntimeGuidanceInput {
  preferSubagents: boolean;
}

/** The run's runtime guidance block. Each sentence is followed by a space, matching the overlay
 * blocks it is appended after; empty when nothing applies, leaving the overlay byte-identical.
 * Pure, O(1). */
export function buildAssistantRuntimeGuidance({ input }: { input: AssistantRuntimeGuidanceInput | undefined }, _options = {}): string {
  return [buildPreferSubagentsGuidance({ effective: input?.preferSubagents === true })]
    .filter(text => text !== "").map(text => `${text} `).join("");
}

/** One launch's runtime-preference snapshot: what the guidance says. */
export interface AssistantRuntimeLaunch {
  guidance: AssistantRuntimeGuidanceInput;
}

/** Read the person's preferences fresh and combine them with the runtime's declared support and
 * this run's resolved native capabilities. A failed read falls back to the registered defaults.
 * @complexity O(k) for k fixed preference keys plus one registry lookup. */
export async function resolveAssistantRuntimeLaunch(
  { deps, principalId, agentId, subagentsEnabled }: { deps: AssistantRuntimePreferenceDeps; principalId: string; agentId: string; subagentsEnabled: boolean },
  { getDef }: { getDef?: (input: { id: string }) => Pick<RuntimeAgentDef, "supportsSubagents"> | null } = {},
): Promise<AssistantRuntimeLaunch> {
  const preferences = await readAssistantRuntimePreferences({ deps, principalId }, {});
  const runtimeSupportsSubagents = agentSupportsSubagents({ agentId }, getDef ? { getDef } : {});
  return { guidance: { preferSubagents: resolvePreferSubagentsEffective({ preferSubagents: preferences.preferSubagents, runtimeSupportsSubagents, subagentsEnabled }) } };
}
