import { createRequire } from 'node:module';
import { classifyBundledPluginFile } from '@jini-ai/agent-plugins/lifecycle';
import { createBundledExportFilePolicy as createPolicy, type BundledExportFilePolicy } from '@jini-ai/devops/backup/site/bundled-export-file-policy';
import { SELECTED_AGENT_PLUGIN_PACKAGES } from '../agent-plugins/bundled-catalog.js';

/**
 * Host binding: Tovu's selected npm subpaths, its module resolution and Jini's byte comparison.
 * @returns An export-local policy; no inventory, persistent cache, network or content mutation.
 * @example const policy = createBundledExportFilePolicy({}); await policy({ path, bytes });
 */
export function createBundledExportFilePolicy(_required: Record<string, never>, optional: {
  selection?: ReadonlyMap<string, string>; resolve?: (specifier: string) => string;
  readFile?: (filename: string) => Promise<Uint8Array>;
} = {}): BundledExportFilePolicy {
  return createPolicy({
    selection: optional.selection ?? SELECTED_AGENT_PLUGIN_PACKAGES,
    resolve: optional.resolve ?? createRequire(import.meta.url).resolve,
    classifyBundledPluginFile,
  }, optional.readFile ? { readFile: optional.readFile } : {});
}
