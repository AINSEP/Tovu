/** Per-person assistant runtime preferences (`core.interface`), read fresh for every run launch. */
import type { SettingsRepoPort, getEffective } from "../features/settings/index.js";
import { ADMIN_INTERFACE_NAMESPACE, PREFER_SUBAGENTS_KEY, REPLY_LENGTH_KEY, USE_CLAUDE_IN_CHROME_KEY } from "../features/settings/admin-interface.js";

export interface AssistantRuntimePreferenceDeps {
  settingsRepo: SettingsRepoPort;
  getEffective: typeof getEffective;
  /** Resolves once the `core.interface` definitions are registered (the site-title boot chain). */
  settingsReady: Promise<unknown>;
  workspaceId: string;
}

export interface AssistantRuntimePreferences {
  /** Steer multi-step or output-heavy work to a native subagent when the runtime has one. */
  preferSubagents: boolean;
  /** Let Claude Code runs use Claude in Chrome (the person's real, logged-in Chrome). */
  useClaudeInChrome: boolean;
  /** Reply verbosity; Normal adds no prompt guidance. */
  replyLength: "short" | "normal" | "detailed";
}

/** The registered definition defaults; also what a failed or absent read falls back to. */
export const DEFAULT_ASSISTANT_RUNTIME_PREFERENCES: Readonly<AssistantRuntimePreferences> = Object.freeze({
  preferSubagents: true,
  useClaudeInChrome: true,
  replyLength: "normal",
});

/** One preference for one person; missing definitions or failed reads return undefined so the
 * caller uses the registered default. A preference read never blocks a launch.
 * @complexity O(1), one effective-setting resolution. */
async function readPreference(
  { deps, principalId, key }: { deps: AssistantRuntimePreferenceDeps; principalId: string; key: string },
  _options = {},
): Promise<unknown> {
  try {
    await deps.settingsReady;
    const effective = await deps.getEffective({ repo: deps.settingsRepo }, {
      namespace: ADMIN_INTERFACE_NAMESPACE, key, scopeContext: { workspaceId: deps.workspaceId, principalId },
    });
    return effective?.value;
  } catch {
    return undefined;
  }
}

/** The launching person's runtime preferences, read fresh so an edit applies to the next run.
 * @complexity O(k) for the k fixed preference keys. */
export async function readAssistantRuntimePreferences(
  { deps, principalId }: { deps: AssistantRuntimePreferenceDeps; principalId: string },
  _options = {},
): Promise<AssistantRuntimePreferences> {
  // A wrong-typed or unreadable value falls back to the registered default; Claude in Chrome stays
  // owner-only and probe-gated either way (resolveAssistantRuntimeLaunch), so a default `true` here grants nothing alone.
  const defaults = DEFAULT_ASSISTANT_RUNTIME_PREFERENCES;
  const preferSubagents = await readPreference({ deps, principalId, key: PREFER_SUBAGENTS_KEY });
  const useClaudeInChrome = await readPreference({ deps, principalId, key: USE_CLAUDE_IN_CHROME_KEY });
  const replyLength = await readPreference({ deps, principalId, key: REPLY_LENGTH_KEY });
  return {
    preferSubagents: typeof preferSubagents === "boolean" ? preferSubagents : defaults.preferSubagents,
    useClaudeInChrome: typeof useClaudeInChrome === "boolean" ? useClaudeInChrome : defaults.useClaudeInChrome,
    replyLength: replyLength === "short" || replyLength === "detailed" ? replyLength : defaults.replyLength,
  };
}
