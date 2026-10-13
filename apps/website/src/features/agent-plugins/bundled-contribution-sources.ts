import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { RETIRED_BUNDLED_AGENT_PLUGINS } from "./bundled-catalog.js";
import type { TrustedPluginPackage } from "./lifecycle.js";

/** Tovu's hermetic bundled contribution sources, in plugin-id order. Requires both the package
 * manifest and category file; stale retired packages and non-packages never contribute. Only pass
 * product-owned source roots, never operator-writable installed directories. Synchronous so CLI
 * help and async category loaders use the same selection policy. @complexity O(p) directories. */
export function bundledContributionSources(required: { readonly sourceRoot: string; readonly filename: string }, _optional: Record<string, never> = {}): readonly TrustedPluginPackage[] {
  return readdirSync(required.sourceRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !RETIRED_BUNDLED_AGENT_PLUGINS.has(entry.name))
    .map(entry => ({ pluginId: entry.name, packageRoot: path.join(required.sourceRoot, entry.name) }))
    .filter(plugin => existsSync(path.join(plugin.packageRoot, "plugin.json")) && existsSync(path.join(plugin.packageRoot, required.filename)))
    .sort((a, b) => a.pluginId.localeCompare(b.pluginId, "en"));
}
