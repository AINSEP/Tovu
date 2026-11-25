import { createRequire } from 'node:module';
import { classifyBundledPluginFile } from '@jini-ai/agent-plugins/lifecycle';
import { createBundledExportFilePolicy as createPolicy, type BundledExportFilePolicy } from '@jini-ai/devops/backup/site/bundled-export-file-policy';

/**
 * Host binding: Tovu's selected npm subpaths, its module resolution and Jini's byte comparison.
 * The selection (`selection`, plugin id -> package) is injected by the host composition root.
 * @returns An export-local policy; no inventory, persistent cache, network or content mutation.
 * @example const policy = createBundledExportFilePolicy({ selection }); await policy({ path, bytes });
 */
export function createBundledExportFilePolicy({ selection }: { selection: ReadonlyMap<string, string> }, optional: {
  resolve?: (specifier: string) => string; readFile?: (filename: string) => Promise<Uint8Array>;
} = {}): BundledExportFilePolicy {
  return createPolicy({
    selection,
    resolve: optional.resolve ?? createRequire(import.meta.url).resolve,
    classifyBundledPluginFile,
  }, optional.readFile ? { readFile: optional.readFile } : {});
}
