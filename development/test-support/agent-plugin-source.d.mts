/** Resolve the installed payload for a selected plugin, or the product content directory. */
export function agentPluginSourceDir(
  required: { pluginId: string },
  optional?: { selection?: ReadonlyMap<string, string>; repoRoot?: string },
): string;
