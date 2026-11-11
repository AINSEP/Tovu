/** Host adapter for the shared identity owner. The legacy lifecycle already indexes packageRoot;
 * rereading its manifest keeps new metadata available before compiled lifecycle code is rebuilt. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readPluginIdentity, type PluginIdentity } from '@jini-ai/core/plugin-directory';
import { readAgentPluginPortableExtension, type InstalledAgentPlugin } from '@jini-ai/agent-plugins/lifecycle';
import { HOST_SOON_AGENT_PLUGINS } from './bundled-catalog.js';

/** Tovu's metadata in a plugin manifest: `extensions.jini` (Jini's portable key, which wins), else the
 *  legacy `extensions.tovu`. Jini moved its bundled manifests to `extensions.jini` (2026-11-06); reading
 *  only `tovu` silently lost every maturity flag and provider link. @complexity O(1). */
function readTovuExtension({ manifest }: { manifest: unknown }): { maturity?: unknown; providerPlugin?: unknown } | undefined {
  return readAgentPluginPortableExtension({ value: manifest }, { identityNamespace: 'tovu' });
}

/** Tovu host metadata; absence keeps the plugin's normal presentation and behavior.
 *  "untested" is a warning only; "soon" is locked off (`soon-lock.ts`, owner 2026-11-10). */
export type PluginMaturity = 'untested' | 'soon';

/** Read only Tovu's extension; unknown values warn without rejecting a usable plugin. Tovu's own
 * `HOST_SOON_AGENT_PLUGINS` list marks an unflagged plugin "soon"; a manifest flag still wins.
 * @returns A supported maturity or undefined. @complexity O(1).
 */
export function readPluginMaturity({ manifest, pluginId }: { manifest: unknown; pluginId: string }, options: { warn?: (message: string) => void } = {}): PluginMaturity | undefined {
  // The portable reader yields undefined for null, primitives and arrays, as optional chaining did.
  const maturity = readTovuExtension({ manifest })?.maturity;
  if (maturity === undefined) return HOST_SOON_AGENT_PLUGINS.has(pluginId) ? 'soon' : undefined;
  if (maturity === 'untested' || maturity === 'soon') return maturity;
  (options.warn ?? console.warn)('[agent-plugins] Unknown extensions.tovu.maturity ignored; expected "untested" or "soon".');
  return undefined;
}

/** Provider plugin ids follow the same grammar as a credential card's `saveTarget`. */
const PROVIDER_PLUGIN_ID = /^[a-z0-9][a-z0-9._-]{0,99}$/;

/** `extensions.tovu.providerPlugin`: the provider plugin this agent plugin is the assistant face of
 *  (owner 2026-10-25: one vendor, one plugin). The provider plugin's switch turns both faces on and
 *  off (`provider-plugin-link.ts`), and the agent plugin owns that provider's settings card.
 *  Unknown shapes warn and read as no link, so a typo never links to a wrong plugin.
 * @complexity O(1). */
export function readProviderPluginLink({ manifest }: { manifest: unknown }, options: { warn?: (message: string) => void } = {}): string | undefined {
  const link = readTovuExtension({ manifest })?.providerPlugin;
  if (link === undefined) return undefined;
  if (typeof link === 'string' && PROVIDER_PLUGIN_ID.test(link)) return link;
  (options.warn ?? console.warn)('[agent-plugins] Invalid extensions.tovu.providerPlugin ignored; expected a plugin id.');
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
): Promise<PluginIdentity & { readonly maturity?: PluginMaturity; readonly providerPlugin?: string }> {
  const readText = optional.readText ?? ((filePath: string) => readFile(filePath, 'utf8'));
  let manifest: Readonly<Record<string, unknown>>;
  try { manifest = JSON.parse(await readText(path.join(plugin.packageRoot, 'plugin.json'))); }
  catch { throw new Error('The installed plugin identity manifest could not be read.'); }
  const identity = readPluginIdentity({ manifest, name: plugin.pluginId, namespace: 'tovu' });
  const maturity = readPluginMaturity({ manifest, pluginId: plugin.pluginId });
  const providerPlugin = readProviderPluginLink({ manifest });
  return { ...identity, ...(maturity ? { maturity } : {}), ...(providerPlugin ? { providerPlugin } : {}) };
}
