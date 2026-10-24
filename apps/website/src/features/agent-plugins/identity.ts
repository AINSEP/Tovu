/** Host adapter for the shared identity owner. The legacy lifecycle already indexes packageRoot;
 * rereading its manifest keeps new metadata available before compiled lifecycle code is rebuilt. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readPluginIdentity, type PluginIdentity } from '@jini-ai/core/plugin-directory';
import type { InstalledAgentPlugin } from '@jini-ai/agent-plugins/lifecycle';

/** Tovu host metadata; absence keeps the plugin's normal presentation and behavior. */
export type PluginMaturity = 'untested' | 'soon';

/** Read only Tovu's extension; unknown values warn without rejecting a usable plugin.
 * @returns A supported maturity or undefined. @complexity O(1).
 */
export function readPluginMaturity({ manifest }: { manifest: unknown }, options: { warn?: (message: string) => void } = {}): PluginMaturity | undefined {
  // Optional chaining reads nothing from null and yields undefined for primitives and arrays.
  const maturity = (manifest as { extensions?: { tovu?: { maturity?: unknown } } } | null | undefined)?.extensions?.tovu?.maturity;
  if (maturity === undefined) return undefined;
  if (maturity === 'untested' || maturity === 'soon') return maturity;
  (options.warn ?? console.warn)('[agent-plugins] Unknown extensions.tovu.maturity ignored; expected "untested" or "soon".');
  return undefined;
}

/** Shared instruction for every host guidance surface, so disclosure precedes credentials/actions. */
export const UNTESTED_PLUGIN_GUIDANCE = "Before saving keys or acting with this plugin, tell the user this integration hasn't been tested end to end yet. It may not work.";

/** Reads metadata only from a lifecycle-validated package root; never imports executable code.
 * @param optional.readText file reader port (defaults to UTF-8 `fs.readFile`).
 * @throws Invalid or unreadable publisher metadata.
 * @complexity One manifest read plus O(k + p) keyword/capability validation.
 */
export async function readInstalledAgentPluginIdentity(
  { plugin }: { plugin: Pick<InstalledAgentPlugin, 'pluginId' | 'packageRoot'> },
  optional: { readText?: (filePath: string) => Promise<string> } = {},
): Promise<PluginIdentity & { readonly maturity?: PluginMaturity }> {
  const readText = optional.readText ?? ((filePath: string) => readFile(filePath, 'utf8'));
  let manifest: Readonly<Record<string, unknown>>;
  try { manifest = JSON.parse(await readText(path.join(plugin.packageRoot, 'plugin.json'))); }
  catch { throw new Error('The installed plugin identity manifest could not be read.'); }
  const identity = readPluginIdentity({ manifest, name: plugin.pluginId, namespace: 'tovu' });
  const maturity = readPluginMaturity({ manifest });
  return { ...identity, ...(maturity ? { maturity } : {}) };
}
