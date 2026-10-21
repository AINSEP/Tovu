/** Host adapter for the shared identity owner. The legacy lifecycle already indexes packageRoot;
 * rereading its manifest keeps new metadata available before compiled lifecycle code is rebuilt. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readPluginIdentity, type PluginIdentity } from '@jini-ai/core/plugin-directory';
import type { InstalledAgentPlugin } from '@jini-ai/agent-plugins/lifecycle';

/** Reads metadata only from a lifecycle-validated package root; never imports executable code.
 * @param optional.readText file reader port (defaults to UTF-8 `fs.readFile`).
 * @throws Invalid or unreadable publisher metadata.
 * @complexity One manifest read plus O(k + p) keyword/capability validation.
 */
export async function readInstalledAgentPluginIdentity(
  { plugin }: { plugin: Pick<InstalledAgentPlugin, 'pluginId' | 'packageRoot'> },
  optional: { readText?: (filePath: string) => Promise<string> } = {},
): Promise<PluginIdentity> {
  const readText = optional.readText ?? ((filePath: string) => readFile(filePath, 'utf8'));
  let manifest: Readonly<Record<string, unknown>>;
  try { manifest = JSON.parse(await readText(path.join(plugin.packageRoot, 'plugin.json'))); }
  catch { throw new Error('The installed plugin identity manifest could not be read.'); }
  return readPluginIdentity({ manifest, name: plugin.pluginId, namespace: 'tovu' });
}
