/**
 * Tovu's composed bundled-agent-plugin root (plugins plan v2 §3.3-3.4): Tovu's own
 * `content/agent-plugins` plus the payload of every package in `SELECTED_AGENT_PLUGIN_PACKAGES`,
 * in one folder. Every reader keeps using the single root `bundledAgentPluginsDir()` names, so no
 * call site learns about packages. Jini still owns installation, activation and digests.
 *
 * Callers:
 * - Production: `build-server.mjs` composes into `dist/content/agent-plugins` (Fly/Docker, the desktop
 *   payload and `--assets-only` all read that path).
 * - Development: `dev-server.mjs` composes into `.generated/bundled-agent-plugins` (gitignored) and
 *   points `TOVU_BUNDLED_AGENT_PLUGINS_DIR` at it. After editing a plugin in Jini's
 *   `packages/agent-plugins/<id>` (shipped as `@jini-ai/agent-plugins/<id>`) or how-tovu-works / tovu-theme, run
 *   `node development/scripts/compose-bundled-agent-plugins.mjs` (`npm run agent-plugins:compose`)
 *   and restart the API. Restarting dev does the same. There is deliberately no watcher.
 *
 * The build fails, rather than the server booting without a plugin, on: a selected package that
 * does not resolve, a payload without `plugin.json`, a plugin id present twice, a selection key that
 * differs from its package's plugin name, and a `tovu-*.json` contribution that names a payload file
 * the folder does not carry. Production boot only warns (`bootstrap.ts`).
 */
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { SELECTED_AGENT_PLUGIN_PACKAGES } from '../../apps/website/src/features/agent-plugins/bundled-catalog.ts';
import { stageSelectedAgentPluginAssets } from './stage-selected-agent-plugin-assets.ts';

/** `cpSync` filter for runtime content: `__tests__` folders hold test fixtures that import repo
 * sources (`apps/website/src/...`) the server never ships, so they stay out of every composed root. */
export const skipTestFolders = source => path.basename(source) !== '__tests__';

/** Where development composes; gitignored (`.generated/`). */
export const DEV_COMPOSED_AGENT_PLUGINS_DIR = '.generated/bundled-agent-plugins';

/**
 * `tovu-*.json` keys whose string values are paths inside the plugin's own folder. Other path-like
 * values are not payload files: `path`/`candidatePaths` name files in the operator's site,
 * `workflowFile` names a generated workflow, and `href` links to documentation.
 */
const PAYLOAD_PATH_KEYS = new Set(['module', 'handlerModule', 'entry', 'files']);

/**
 * Compose Tovu's content plugins and the selected package payloads into `outputRoot`, replacing it.
 * Work happens in a fresh temporary sibling that is always removed, so a repeated run never meets a
 * stale staging folder, and a failed run leaves the previous `outputRoot` untouched.
 * @param required Repository root and the disposable output folder (never site state).
 * @param optional `selection` (plugin id -> package name, default the product selection); `npmCli` and
 *   `listPackageFiles` are the staging helper's npm ports.
 * @returns The output folder and its sorted plugin ids (folders holding a `plugin.json`).
 * @throws On any condition listed in this file's header, or a native filesystem failure.
 * @complexity O(e + b) I/O for e entries and b bytes copied; one npm file listing per selected package.
 * @example composeBundledAgentPluginRoot({ repoRoot, outputRoot: path.join(repoRoot, 'dist/content/agent-plugins') });
 */
export function composeBundledAgentPluginRoot(
  { repoRoot, outputRoot },
  { selection = SELECTED_AGENT_PLUGIN_PACKAGES, npmCli, listPackageFiles } = {},
) {
  mkdirSync(path.dirname(outputRoot), { recursive: true });
  const work = mkdtempSync(path.join(path.dirname(outputRoot), '.compose-agent-plugins-'));
  try {
    const composed = path.join(work, 'root');
    cpSync(path.join(repoRoot, 'content/agent-plugins'), composed, { recursive: true, filter: skipTestFolders });
    // A fresh destination per run: the staging helper rejects any existing output that differs.
    addSelectedPackages({ repoRoot, selection, composed, packagesRoot: path.join(work, 'packages') }, { npmCli, listPackageFiles });
    assertContributionPaths({ root: composed });
    rmSync(outputRoot, { recursive: true, force: true });
    renameSync(composed, outputRoot);
    return { outputRoot, pluginIds: listPluginIds({ root: outputRoot }) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Development entry: compose into `.generated/bundled-agent-plugins` unless the operator already
 * points `TOVU_BUNDLED_AGENT_PLUGINS_DIR` somewhere, which is then used as is.
 * @returns The folder the API should read through `TOVU_BUNDLED_AGENT_PLUGINS_DIR`.
 * @throws Whatever {@link composeBundledAgentPluginRoot} throws. @complexity As composition.
 * @example process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = composeDevBundledAgentPlugins({ repoRoot, env: process.env });
 */
export function composeDevBundledAgentPlugins({ repoRoot, env }, optional = {}) {
  if (env.TOVU_BUNDLED_AGENT_PLUGINS_DIR) return env.TOVU_BUNDLED_AGENT_PLUGINS_DIR;
  return composeBundledAgentPluginRoot({ repoRoot, outputRoot: path.join(repoRoot, DEV_COMPOSED_AGENT_PLUGINS_DIR) }, optional).outputRoot;
}

/** Stage the selected packages and move each payload beside Tovu's own plugins.
 * @throws When staging fails, the staged ids differ from the selection keys, or an id already exists.
 * @complexity O(p) moves for p selected packages, plus the staging helper's cost.
 */
function addSelectedPackages({ repoRoot, selection, composed, packagesRoot }, { npmCli, listPackageFiles }) {
  if (selection.size === 0) return;
  const { pluginIds } = stageSelectedAgentPluginAssets(
    { repoRoot, packageNames: [...selection.values()], outputRoot: packagesRoot },
    { npmCli, listPackageFiles, expectedPluginIds: new Map([...selection].map(([id, packageName]) => [packageName, id])) },
  );
  const selectedIds = [...selection.keys()].sort();
  if (!isDeepStrictEqual(pluginIds, selectedIds)) {
    throw new Error(`Selected agent plugin ids [${selectedIds.join(', ')}] differ from the plugin names their packages declare [${pluginIds.join(', ')}].`);
  }
  for (const pluginId of pluginIds) {
    const target = path.join(composed, pluginId);
    if (existsSync(target)) {
      throw new Error(`Agent plugin '${pluginId}' is both in content/agent-plugins and in a selected package; keep one copy.`);
    }
    renameSync(path.join(packagesRoot, pluginId), target);
  }
}

/** Plugin folders of a composed root: directories that hold a `plugin.json` (skips `__tests__`).
 * @complexity O(d) for d top-level entries. */
function listPluginIds({ root }) {
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(path.join(root, entry.name, 'plugin.json')))
    .map(entry => entry.name)
    .sort();
}

/** Every payload path named by a plugin's top-level `tovu-*.json` files must be a regular file inside it.
 * @throws One error naming every missing or escaping path. @complexity O(j) for j JSON nodes read.
 */
function assertContributionPaths({ root }) {
  const missing = listPluginIds({ root }).flatMap(pluginId => missingPayloadPaths({ pluginDir: path.join(root, pluginId) })
    .map(({ file, ref }) => `${pluginId}/${file}: ${ref}`));
  if (missing.length > 0) throw new Error(`Agent plugin contribution files name payload files that are missing:\n${missing.join('\n')}`);
}

/** @returns `{ file, ref }` for each referenced payload path absent from `pluginDir`. @complexity O(j). */
function missingPayloadPaths({ pluginDir }) {
  const contributionFiles = readdirSync(pluginDir).filter(name => /^tovu-.+\.json$/.test(name)).sort();
  return contributionFiles.flatMap(file => {
    const refs = collectPayloadRefs({ value: JSON.parse(readFileSync(path.join(pluginDir, file), 'utf8')), key: undefined, refs: [] });
    return refs.filter(ref => !isPayloadFile({ pluginDir, ref })).map(ref => ({ file, ref }));
  });
}

/** Collect string values (or string array items) found under {@link PAYLOAD_PATH_KEYS}. @complexity O(j). */
function collectPayloadRefs({ value, key, refs }) {
  if (Array.isArray(value)) {
    for (const item of value) collectPayloadRefs({ value: item, key, refs });
  } else if (value !== null && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) collectPayloadRefs({ value: child, key: childKey, refs });
  } else if (typeof value === 'string' && PAYLOAD_PATH_KEYS.has(key)) {
    refs.push(value);
  }
  return refs;
}

/** True only for a regular file contained in `pluginDir` (no absolute or `..` escape). @complexity O(1) I/O. */
function isPayloadFile({ pluginDir, ref }) {
  const target = path.resolve(pluginDir, ref);
  if (!target.startsWith(path.resolve(pluginDir) + path.sep)) return false;
  return existsSync(target) && lstatSync(target).isFile();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const { outputRoot, pluginIds } = composeBundledAgentPluginRoot({ repoRoot, outputRoot: path.join(repoRoot, DEV_COMPOSED_AGENT_PLUGINS_DIR) });
  console.log(`tovu: composed ${pluginIds.length} bundled agent plugins into ${outputRoot}; restart the API to seed them.`);
}
