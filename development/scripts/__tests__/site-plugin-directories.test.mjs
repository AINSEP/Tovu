/** Item 18: launch environments feed the real layout owners; no server or module mocks. */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { buildDevChildEnv } from '../dev.mjs';
import { buildCliEnv, buildServeEnv } from '../../../apps/desktop/src/tovu-server.ts';
import { localSiteChildEnv } from '../../../apps/website/src/server/runtime/lifecycle/local-site-process.ts';
import { resolveAgentPluginLayout } from '../../../apps/website/src/features/agent-plugins/layout.ts';
import { resolveSkillLayout } from '../../../apps/website/src/features/skills/layout.ts';
import { pluginsInstallDir } from '../../../apps/website/src/server/runtime/composition/deps.ts';

const repoRoot = path.join(os.tmpdir(), 'plugdir-product');
const overrides = Object.freeze({
  TOVU_PLUGINS_DIR: path.join(repoRoot, 'shared-plugins'),
  TOVU_SKILLS_DIR: path.join(repoRoot, 'shared-skills'),
  TOVU_AGENT_PLUGINS_DIR: path.join(repoRoot, 'shared-agent-plugins'),
  TOVU_BUNDLED_AGENT_PLUGINS_DIR: path.join(repoRoot, 'bundle-sources'),
  TOVU_SITE_DIR: path.join(repoRoot, 'wrong-site'),
  TOVU_AGENT_CWD: path.join(repoRoot, 'wrong-site'),
  PATH: '/bin',
});

function roots(siteDir, env) {
  return {
    plugins: pluginsInstallDir({ siteDir }, { env }),
    skills: resolveSkillLayout({ siteDir, env }).forWorkspace('workspace-local').root,
    agentPlugins: resolveAgentPluginLayout({ siteDir, env }).forWorkspace('workspace-local').root,
  };
}

for (const launcher of ['dev', 'desktop', 'local supervisor']) {
  test(`${launcher}: two site launch plans keep all three stores under their own roots despite parent overrides`, () => {
    const warnings = [];
    const warn = message => warnings.push(message);
    const siteDirs = ['alpha', 'beta'].map(name => path.join(repoRoot, 'sites', name));
    const childEnvs = siteDirs.map((siteDir, index) => {
      if (launcher === 'dev') return buildDevChildEnv({ parent: overrides, env: { TOVU_SITE_DIR: siteDir } }, { warn });
      if (launcher === 'desktop') return buildServeEnv({ repoRoot, siteDir, baseEnv: overrides }, { warn });
      return localSiteChildEnv({ parent: overrides, siteDir, name: path.basename(siteDir), port: 3101 + index * 2,
        daemonPort: 3102 + index * 2, repoRoot, buildRoot: path.join(repoRoot, 'admin-build') }, { warn, pathExists: () => false });
    });
    const stores = childEnvs.map((env, index) => {
      assert.equal(env.TOVU_SITE_DIR, siteDirs[index]);
      for (const key of ['TOVU_PLUGINS_DIR', 'TOVU_SKILLS_DIR', 'TOVU_AGENT_PLUGINS_DIR']) assert.equal(env[key], undefined);
      assert.equal(env.PATH, '/bin');
      return roots(siteDirs[index], env);
    });
    assert.deepEqual(stores, siteDirs.map(siteDir => ({ plugins: path.join(siteDir, 'plugins'),
      skills: path.join(siteDir, 'skills/ws/workspace-local'), agentPlugins: path.join(siteDir, 'agent-plugins/ws/workspace-local') })));
    assert.notEqual(stores[0].plugins, stores[1].plugins);
    assert.notEqual(stores[0].skills, stores[1].skills);
    assert.notEqual(stores[0].agentPlugins, stores[1].agentPlugins);
    assert.equal(warnings.length, 2);
    const names = ['TOVU_PLUGINS_DIR', 'TOVU_SKILLS_DIR', 'TOVU_AGENT_PLUGINS_DIR',
      ...(launcher === 'desktop' ? ['TOVU_SITE_DIR', 'TOVU_AGENT_CWD'] : [])];
    const label = launcher === 'local supervisor' ? 'local sites' : launcher;
    assert.deepEqual(warnings, Array(2).fill(`tovu ${label}: dropped inherited ${names.join(', ')}; spawned sites use their own plugin and skill folders. Set overrides only for a direct single-site run.`));
    for (const message of warnings) {
      for (const key of ['TOVU_PLUGINS_DIR', 'TOVU_SKILLS_DIR', 'TOVU_AGENT_PLUGINS_DIR']) assert.ok(message.includes(key));
      for (const value of Object.values(overrides)) assert.ok(!message.includes(value), 'warnings disclose names only');
    }
    assert.equal(overrides.TOVU_AGENT_PLUGINS_DIR, path.join(repoRoot, 'shared-agent-plugins'));
  });
}

test('a direct single-site run still resolves its explicit overrides after another site was launched', () => {
  const singleSite = path.join(repoRoot, 'sites', 'explicit');
  buildDevChildEnv({ parent: overrides, env: { TOVU_SITE_DIR: path.join(repoRoot, 'sites', 'other') } }, { warn() {} });
  assert.deepEqual(roots(singleSite, overrides), {
    plugins: overrides.TOVU_PLUGINS_DIR,
    skills: path.join(overrides.TOVU_SKILLS_DIR, 'ws/workspace-local'),
    agentPlugins: path.join(overrides.TOVU_AGENT_PLUGINS_DIR, 'ws/workspace-local'),
  });
});

test('desktop init drops storage overrides too, and clean launches produce no warning', () => {
  const warnings = [];
  const siteDir = path.join(repoRoot, 'sites', 'init');
  const env = buildCliEnv({ baseEnv: overrides, siteDir }, { warn: message => warnings.push(message) });
  assert.deepEqual(roots(siteDir, env), { plugins: path.join(siteDir, 'plugins'),
    skills: path.join(siteDir, 'skills/ws/workspace-local'), agentPlugins: path.join(siteDir, 'agent-plugins/ws/workspace-local') });
  assert.equal(warnings.length, 1);
  buildDevChildEnv({ parent: {}, env: {} }, { warn: message => warnings.push(message) });
  buildCliEnv({ baseEnv: {}, siteDir }, { warn: message => warnings.push(message) });
  localSiteChildEnv({ parent: {}, siteDir, name: 'init', port: 3101, daemonPort: 3102, repoRoot, buildRoot: '/tmp/build' },
    { warn: message => warnings.push(message), pathExists: () => false });
  assert.equal(warnings.length, 1);
  assert.equal(env.TOVU_BUNDLED_AGENT_PLUGINS_DIR, overrides.TOVU_BUNDLED_AGENT_PLUGINS_DIR);
});

test('empty and relative inherited overrides are dropped on dev restarts rather than reaching layout validation', () => {
  const parent = { TOVU_AGENT_PLUGINS_DIR: '../shared', TOVU_SKILLS_DIR: '', TOVU_PLUGINS_DIR: './shared' };
  const warnings = [];
  const sites = ['first', 'restarted'].map(name => path.join(repoRoot, 'sites', name));
  for (const siteDir of sites) {
    const env = buildDevChildEnv({ parent, env: { TOVU_SITE_DIR: siteDir } }, { warn: message => warnings.push(message) });
    assert.deepEqual(roots(siteDir, env), { plugins: path.join(siteDir, 'plugins'),
      skills: path.join(siteDir, 'skills/ws/workspace-local'), agentPlugins: path.join(siteDir, 'agent-plugins/ws/workspace-local') });
  }
  assert.equal(warnings.length, 2);
  assert.deepEqual(parent, { TOVU_AGENT_PLUGINS_DIR: '../shared', TOVU_SKILLS_DIR: '', TOVU_PLUGINS_DIR: './shared' });
});
