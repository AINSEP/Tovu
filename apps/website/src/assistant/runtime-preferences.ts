/** Per-person assistant runtime preferences (`core.interface`), read fresh for every run launch. */
import type { SettingsRepoPort, getEffective } from "../features/settings/index.js";
import { ADMIN_INTERFACE_NAMESPACE, PREFER_SUBAGENTS_KEY } from "../features/settings/admin-interface.js";

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
}

/** The registered definition defaults; also what a failed or absent read falls back to. */
export const DEFAULT_ASSISTANT_RUNTIME_PREFERENCES: Readonly<AssistantRuntimePreferences> = Object.freeze({
  preferSubagents: true,
});

/** One boolean preference for one person. A non-boolean value, a missing definition or any read
 * failure yields `fallback`: a preference only shapes guidance, so it never blocks a launch.
 * @complexity O(1), one effective-setting resolution. */
async function readBooleanPreference(
  { deps, principalId, key, fallback }: { deps: AssistantRuntimePreferenceDeps; principalId: string; key: string; fallback: boolean },
  _options = {},
): Promise<boolean> {
  try {
    await deps.settingsReady;
    const effective = await deps.getEffective({ repo: deps.settingsRepo }, {
      namespace: ADMIN_INTERFACE_NAMESPACE, key, scopeContext: { workspaceId: deps.workspaceId, principalId },
    });
    return typeof effective?.value === "boolean" ? effective.value : fallback;
  } catch {
    return fallback;
  }
}

/** The launching person's runtime preferences, read fresh so an edit applies to the next run.
 * @complexity O(k) for the k fixed preference keys. */
export async function readAssistantRuntimePreferences(
  { deps, principalId }: { deps: AssistantRuntimePreferenceDeps; principalId: string },
  _options = {},
): Promise<AssistantRuntimePreferences> {
  const defaults = DEFAULT_ASSISTANT_RUNTIME_PREFERENCES;
  return {
    preferSubagents: await readBooleanPreference({ deps, principalId, key: PREFER_SUBAGENTS_KEY, fallback: defaults.preferSubagents }),
  };
}
