/** Tovu's public-export catalog over the lifecycle's bundled digest and containment gates. */
import { readFile } from "node:fs/promises";
import { parseAgentPluginManifest, readAgentPluginExtension, type AgentPluginExport, type AgentPluginExportMetadata } from "@jini-ai/agent-plugins/manifest";
import type { TrustedPluginPackage, TovuAgentPluginLifecycle } from "../lifecycle.js";

export const PLUGIN_EXPORT_FILES_PREFIX = "/api/agent-plugin-exports/v1";
export interface PluginExportPackage extends AgentPluginExportMetadata {
  readonly plugin: TrustedPluginPackage;
  readonly id: string;
  readonly displayName?: string;
  readonly enabled: boolean;
  readonly exports: Readonly<Record<string, AgentPluginExport>>;
}
export interface PluginExportSource {
  list(required: { workspaceId: string }, options?: Record<string, never>): Promise<readonly PluginExportPackage[]>;
  readFile(required: { plugin: TrustedPluginPackage; filename: string }, options?: Record<string, never>): Promise<string>;
  readAsset(required: { plugin: TrustedPluginPackage; filename: string }, options?: Record<string, never>): Promise<string | Uint8Array>;
}

/** Encode declared ids/paths; URL inputs are never converted into filesystem paths. O(path length). */
export function pluginExportFileUrl(required: { pluginId: string; component: string; filename: string }, _options = {}): string {
  return `${PLUGIN_EXPORT_FILES_PREFIX}/${encodeURIComponent(required.pluginId)}/${encodeURIComponent(required.component)}/${required.filename.split("/").map(encodeURIComponent).join("/")}`;
}

/** One broken bundled package cannot hide the other exports. No raw parse/read errors escape.
 * @complexity O(m) manifest bytes, one contained read.
 */
async function readPackage(required: { lifecycle: TovuAgentPluginLifecycle; plugin: TrustedPluginPackage; enabled: boolean }, _options = {}): Promise<PluginExportPackage | undefined> {
  try {
    const raw = await required.lifecycle.readTrustedPluginFile(required.plugin, "plugin.json");
    const result = parseAgentPluginManifest({ value: JSON.parse(raw) }, { identityNamespace: "tovu" });
    if (!result.ok || !result.manifest.id) return undefined;
    const displayName = readAgentPluginExtension({ manifest: result.manifest, namespace: "tovu", read: ({ value }) => value.displayName });
    return { ...result.manifest, ...(typeof displayName === "string" ? { displayName } : {}),
      plugin: required.plugin, id: result.manifest.id, enabled: required.enabled, exports: result.manifest.exports ?? {} };
  } catch {
    return undefined;
  }
}

/** Discover disabled declarations through the same digest gate so editors can explain fallback.
 * Activation is a separate admitted set: the lifecycle's inactive callback runs before its digest
 * check and therefore must never be used as a trusted catalog.
 * @complexity O(p + m) packages plus manifest bytes; two bounded lifecycle catalog scans.
 */
export function createPluginExportSource(required: { lifecycle: TovuAgentPluginLifecycle }, _options = {}): PluginExportSource {
  const { lifecycle } = required;
  return {
    list: async ({ workspaceId }, _options = {}) => {
      const query = { workspaceId, filename: "plugin.json", contribution: "public page exports", orderByPluginId: true };
      const admitted = await lifecycle.findTrustedPluginPackages({ ...query, requireActive: false });
      const active = await lifecycle.findTrustedPluginPackages({ ...query, requireActive: true });
      const enabled = new Set(active.flatMap(verdict => "trusted" in verdict ? [verdict.trusted.packageRoot] : []));
      const packages: PluginExportPackage[] = [];
      for (const verdict of admitted) {
        if (!("trusted" in verdict)) continue;
        const item = await readPackage({ lifecycle, plugin: verdict.trusted, enabled: enabled.has(verdict.trusted.packageRoot) });
        if (item) packages.push(item);
      }
      return packages;
    },
    readFile: ({ plugin, filename }, _options = {}) => lifecycle.readTrustedPluginFile(plugin, filename),
    readAsset: async ({ plugin, filename }, _options = {}) => {
      if (!filename.endsWith(".png")) return lifecycle.readTrustedPluginFile(plugin, filename);
      // Jini's trusted text reader is UTF-8 only. Preserve PNG bytes using its same path owner;
      // do not duplicate containment or join a request path to a package directory here.
      return readFile(await lifecycle.assertContainedOnDisk(plugin.packageRoot, filename));
    },
  };
}
