/** Personal assistant runtime preferences in `core.interface`; mirrors the website's
 *  `features/settings/admin-interface.ts` keys and defaults. Non-UI: a later toggle only renders. */
import type { ChatDisplayLedgerPort } from './chat-display-preferences';
import { CHAT_DISPLAY_NAMESPACE } from './chat-display-preferences';

export const PREFER_SUBAGENTS_KEY = 'preferSubagents';
export const USE_CLAUDE_IN_CHROME_KEY = 'useClaudeInChrome';

export interface AssistantRuntimePreferences {
  /** Delegate multi-step or output-heavy work to a subagent when the runtime supports one. */
  preferSubagents: boolean;
  /** Let Claude Code use Claude in Chrome (the person's real, logged-in Chrome). Default on (owner-only, probe-gated server-side). */
  useClaudeInChrome: boolean;
}

export const DEFAULT_ASSISTANT_RUNTIME_PREFERENCES: Readonly<AssistantRuntimePreferences> = Object.freeze({
  preferSubagents: true,
  useClaudeInChrome: true,
});

const KEYS: Readonly<Record<keyof AssistantRuntimePreferences, string>> = {
  preferSubagents: PREFER_SUBAGENTS_KEY,
  useClaudeInChrome: USE_CLAUDE_IN_CHROME_KEY,
};

/** Non-boolean or missing stored values use the registered default. @complexity O(k) keys. */
export function readAssistantRuntimePreferences({ values }: { values: Map<string, unknown> }, _options = {}): AssistantRuntimePreferences {
  const read = (field: keyof AssistantRuntimePreferences): boolean => {
    const value = values.get(KEYS[field]);
    return typeof value === 'boolean' ? value : DEFAULT_ASSISTANT_RUNTIME_PREFERENCES[field];
  };
  return { preferSubagents: read('preferSubagents'), useClaudeInChrome: read('useClaudeInChrome') };
}

/** Read the current person's effective preferences; ledger failures propagate. */
export async function loadAssistantRuntimePreferences({ port }: { port: ChatDisplayLedgerPort }, _options = {}): Promise<AssistantRuntimePreferences> {
  return readAssistantRuntimePreferences({ values: await port.load({ namespace: CHAT_DISPLAY_NAMESPACE }, {}) });
}

/** Save the diff at user scope; unchanged keys are sent as unchanged so the ledger skips them. */
export async function saveAssistantRuntimePreferences(
  { port, next, previous }: { port: ChatDisplayLedgerPort; next: AssistantRuntimePreferences; previous: AssistantRuntimePreferences }, _options = {},
): Promise<void> {
  const fields = Object.keys(KEYS) as (keyof AssistantRuntimePreferences)[];
  await port.save({ namespace: CHAT_DISPLAY_NAMESPACE, scope: 'user', candidates: fields.map(field => ({
    key: KEYS[field], valueJson: next[field], changed: next[field] !== previous[field],
  })) }, {});
}

/** The per-runtime capability flags the agents API (`GET /api/agents`, website
 *  `assistant/agents.ts` `AssistantAgentSummary`) adds to each agent entry. */
export interface AgentRuntimePreferenceSupport {
  supportsSubagents?: boolean;
  supportsClaudeInChrome?: boolean;
}

/** Which preference toggles apply to the selected runtime; an unknown or older entry shows none.
 *  @complexity O(1). */
export function visibleAssistantRuntimePreferences({ agent }: { agent: AgentRuntimePreferenceSupport | undefined }, _options = {}): Record<keyof AssistantRuntimePreferences, boolean> {
  return { preferSubagents: agent?.supportsSubagents === true, useClaudeInChrome: agent?.supportsClaudeInChrome === true };
}
