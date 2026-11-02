/** Types for `agent-plugin-source.mjs`; see that file for the behaviour. */
export function agentPluginSourceDir(
  required: { pluginId: string },
  optional?: { selection?: ReadonlyMap<string, string>; repoRoot?: string },
): string;
