import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { classifyBundledPluginFile, type BundledPluginFileDisposition, type ReadBundledPluginFile } from '@jini-ai/agent-plugins/lifecycle';
import { SELECTED_AGENT_PLUGIN_PACKAGES } from '../agent-plugins/bundled-catalog.js';

/** Per-entry export decision, independent of archive claims and execution trust. */
export type BundledExportFilePolicy = (required: { path: string; bytes: Uint8Array }) => Promise<BundledPluginFileDisposition>;

/**
 * Wire Jini's byte comparison to Tovu's selected npm subpaths. Resolve each selected root once per
 * export; read only the corresponding installed file. Custom paths and unavailable copies scan.
 * @returns An export-local policy; no inventory, persistent cache, network or content mutation.
 * @complexity One resolution per encountered plugin, one file read per selected package entry.
 * @example const policy = createBundledExportFilePolicy({}); await policy({ path, bytes });
 */
export function createBundledExportFilePolicy(_required: Record<string, never>, optional: {
  selection?: ReadonlyMap<string, string>; resolve?: (specifier: string) => string;
  readFile?: (filename: string) => Promise<Uint8Array>;
} = {}): BundledExportFilePolicy {
  const selection = optional.selection ?? SELECTED_AGENT_PLUGIN_PACKAGES;
  const resolve = optional.resolve ?? createRequire(import.meta.url).resolve;
  const read = optional.readFile ?? readFile;
  const roots = new Map<string, string | null>();
  const readBundledFile: ReadBundledPluginFile = async ({ pluginId, relativePath }) => {
    const specifier = selection.get(pluginId);
    if (!specifier) return null;
    if (!roots.has(pluginId)) {
      try { roots.set(pluginId, path.dirname(resolve(`${specifier}/plugin.json`))); }
      catch { roots.set(pluginId, null); }
    }
    const root = roots.get(pluginId)!;
    if (root === null) return null;
    return read(path.join(root, relativePath));
  };
  return async ({ path: archivePath, bytes }) => {
    const match = /^agent-plugins\/([^/]+)\/package\/(.+)$/.exec(archivePath);
    if (!match) return 'scan';
    return classifyBundledPluginFile({ pluginId: match[1]!, relativePath: match[2]!, bytes, readFile: readBundledFile });
  };
}
