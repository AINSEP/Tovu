/**
 * Where a Tovu test reads a bundled agent plugin's source (plugins plan v2 §3.3). A plugin selected
 * from a Jini package (`SELECTED_AGENT_PLUGIN_PACKAGES`) is read from that installed package's payload;
 * every other id from Tovu's own `content/agent-plugins/<id>`. Tests need no composition step.
 * Selected plugins ship as `@jini-ai/agent-plugins/<id>`; a linked Jini checkout serves its source folders as is.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SELECTED_AGENT_PLUGIN_PACKAGES } from '../../apps/website/src/features/agent-plugins/bundled-catalog.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Resolve one plugin's source folder: the folder holding its `plugin.json`.
 * @param required `pluginId`, the plugin's folder name and `plugin.json` name.
 * @param optional `selection` and `repoRoot` default to the product selection and this checkout.
 * @returns An absolute folder path; a content folder is returned even when it does not exist.
 * @throws When a selected package (or its `./plugin.json` export) does not resolve.
 * @complexity O(1) plus one module resolution.
 * @example readFileSync(path.join(agentPluginSourceDir({ pluginId: 'jev' }), 'skills/jev/SKILL.md'), 'utf8');
 */
export function agentPluginSourceDir({ pluginId }, { selection = SELECTED_AGENT_PLUGIN_PACKAGES, repoRoot = REPO_ROOT } = {}) {
  const packageName = selection.get(pluginId);
  if (packageName === undefined) return path.join(repoRoot, 'content/agent-plugins', pluginId);
  return path.dirname(createRequire(path.join(repoRoot, 'package.json')).resolve(`${packageName}/plugin.json`));
}
