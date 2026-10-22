import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { InMemoryPluginActivationRepo } from '@jini-ai/plugins/host';
import { WORD_COUNT_MANIFEST } from '#src/features/plugin-runtime/built-ins/word-count/index';
import { composePluginRuntime, PluginUninstallPathError, type PluginRuntimeSource } from '../plugin-runtime.js';

/** The uninstall/package-read path guards of the plugin runtime: no install dir, unsafe ids and
 * versions, and the live/parked directory pair, all against a real temp install root. */

const clock = { nowMs: () => 0 };
const manifest = { ...WORD_COUNT_MANIFEST, id: 'pin', extensions: { tovu: { id: 'tovu/pin', provides: [] } }, hooks: [], fields: [], capabilities: [] };

async function installRoot(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'plugin-runtime-paths-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return path.join(root, 'plugins');
}

function runtime(options: { installDir?: string; sources?: PluginRuntimeSource[] } = {}) {
  return composePluginRuntime({ workspaceId: 'ws', clock, activationRepo: new InMemoryPluginActivationRepo(), sources: options.sources ?? [],
    ...(options.installDir === undefined ? {} : { installDir: options.installDir }) });
}

test('removing a plugin with no install dir configured is refused, naming the plugin', async () => {
  await assert.rejects(runtime().locatePluginPackageDirs('gallery'),
    { message: "locatePluginPackageDirs: no installDir configured for this composition root — cannot remove 'gallery'" });
});

test('an id that is not a single safe path segment is refused before any filesystem access', async (t) => {
  const installDir = await installRoot(t);
  for (const id of ['../escape', 'a/b', '.', '']) {
    await assert.rejects(runtime({ installDir }).locatePluginPackageDirs(id), (error: unknown) =>
      error instanceof PluginUninstallPathError && error.name === 'PluginUninstallPathError'
      && error.message === `plugin id '${id}' is not a safe filesystem path segment — refusing to remove it`);
  }
});

test('the live dir is listed only when it exists, and the parked dir sits in the sibling -trash root', async (t) => {
  const installDir = await installRoot(t);
  const plugins = runtime({ installDir });
  const expected = { liveParent: path.resolve(installDir), parkedDir: path.resolve(`${installDir}-trash`, 'gallery') };
  assert.deepEqual(await plugins.locatePluginPackageDirs('gallery'), { ...expected, liveNames: [] });
  await mkdir(path.join(installDir, 'gallery'), { recursive: true });
  assert.deepEqual(await plugins.locatePluginPackageDirs('gallery'), { ...expected, liveNames: ['gallery'] });
});

test('a live-dir probe failure other than not-found propagates instead of reading as absent', async (t) => {
  const installDir = await installRoot(t);
  await mkdir(path.dirname(installDir), { recursive: true });
  await writeFile(installDir, 'not a directory');
  await assert.rejects(runtime({ installDir }).locatePluginPackageDirs('gallery'), { code: 'ENOTDIR' });
});

test('package files: a built-in without a source dir or a site plugin without an install dir has none', async () => {
  const source: PluginRuntimeSource = { source: 'built-in', entryPath: '/unused/index.mjs', manifest, importModule: async () => ({}) };
  assert.deepEqual(await runtime({ sources: [source] }).readPluginPackageFiles({ id: 'pin', version: '1.0.0', source: 'built-in' } as never), { files: [], truncated: false });
  assert.deepEqual(await runtime().readPluginPackageFiles({ id: 'gallery', version: '1.0.0', source: 'site' } as never), { files: [], truncated: false });
});

test('package files: an unsafe site plugin id or version is refused as a path error', async (t) => {
  const installDir = await installRoot(t);
  for (const record of [{ id: '../x', version: '1.0.0' }, { id: 'gallery', version: '../1' }]) {
    await assert.rejects(runtime({ installDir }).readPluginPackageFiles({ ...record, source: 'site' } as never),
      { message: `plugin '${record.id}' version '${record.version}' is not a safe path segment` });
  }
});
