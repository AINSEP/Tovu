import { resolveSiteRoot } from "#src/platform/site-dir/index";
import '../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRouteDeps } from '#src/server/runtime/composition/app';
import { registerAuthRoutes, requireAdminSession } from '#src/server/inbound/admin-http/dev-auth';
import { bootAuthenticated } from '#src/server/__tests__/helpers/http-test-server';
import { installAgentPlugin } from '../../../../../../../features/agent-plugins/lifecycle.js';
import { resolveAgentPluginLayout } from '#src/features/agent-plugins/layout';
import { forceRemove } from '#src/features/agent-plugins/__tests__/fixtures/force-remove';
import { registerAgentPluginMemoryRoutes } from '../../memory.js';
import { registerAgentPluginFilesRoute } from '../../files.js';
import { DEFAULT_PLUGIN_MEMORY_LIMITS } from '@jini-ai/agent-plugins/persistent-state';
import type { TestContext } from 'node:test';

test('admin memory round-trips a user note, refuses learned writes/traversal, and package viewer excludes state', async t => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'plugin-memory-route-'));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = temporary;
  try {
    const archive = Buffer.from('memory-route-example');
    await installAgentPlugin({ layout: resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }), workspaceId: 'workspace-local', archive,
      expectedSha256: createHash('sha256').update(archive).digest('hex'),
      archiveReader: { async *entries() {
        for (const [entryPath, text] of [['plugin.json', '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"example"}'], ['skills/example/SKILL.md', '# Example']])
          yield { kind: 'file', entryPath: entryPath!, async *openReadStream() { yield Buffer.from(text!); } };
      } },
    });
    const deps = createRouteDeps(); const app = express(); app.use(express.json());
    registerAuthRoutes(app, deps); app.use('/api/admin', requireAdminSession(deps));
    registerAgentPluginMemoryRoutes(app, deps); registerAgentPluginFilesRoute(app, deps);
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const prefix = `${baseUrl}/api/admin/v1/workspaces/workspace-local/agent-plugins/example`;
    assert.equal((await fetch(`${prefix}/memory`)).status, 401);
    const put = (body: unknown) => fetch(`${prefix}/memory`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const saved = await put({ entryPath: 'project.md', text: 'Use our brand voice.' });
    assert.equal(saved.status, 200);
    const body = await saved.json() as { notes: unknown[]; learned: unknown[] };
    assert.deepEqual(body.notes, [{ relativePath: 'project.md', text: 'Use our brand voice.' }]);
    assert.deepEqual(body.learned, []);
    assert.equal((await put({ entryPath: '../learned/injected.md', text: 'escape' })).status, 422);
    assert.equal((await put({ entryPath: 'project.md', text: 'replace', kind: 'learned' })).status, 400);
    assert.equal((await fetch(prefix.replace('/example', '/missing') + '/memory', { headers: { cookie } })).status, 404);
    const files = await fetch(`${prefix}/files`, { headers: { cookie } });
    assert.equal(files.status, 200);
    const packageBody = await files.json() as { files: Array<{ relativePath: string }> };
    assert.deepEqual(packageBody.files.map(file => file.relativePath).sort(), ['plugin.json', 'skills/example/SKILL.md']);
    const fresh = await fetch(`${prefix}/memory`, { headers: { cookie } });
    assert.deepEqual((await fresh.json() as { notes: unknown[] }).notes, body.notes);
    // Malformed notes must not replace the note that was already persisted.
    for (const invalid of [[], {}, { text: 'missing path' }, { entryPath: 7, text: 'wrong path type' }, { entryPath: 'project.md' }, { entryPath: 'project.md', text: false }]) {
      const refused = await put(invalid);
      assert.equal(refused.status, 400);
      assert.deepEqual(await refused.json(), { error: 'entryPath and text are required', code: 'VALIDATION_ERROR' });
    }
    assert.deepEqual((await (await fetch(`${prefix}/memory`, { headers: { cookie } })).json()).notes, body.notes);
    for (const method of ['GET', 'PUT']) {
      const wrongWorkspace = await fetch(`${prefix.replace('/workspace-local/', '/other/')}/memory`, { method, headers: { cookie } });
      assert.equal(wrongWorkspace.status, 404);
      assert.deepEqual(await wrongWorkspace.json(), { error: 'workspace was not found' });
    }
    const authorize = deps.authorize;
    deps.authorize = async () => ({ allowed: false, reason: 'no_grant' });
    for (const method of ['GET', 'PUT']) {
      const denied = await fetch(`${prefix}/memory`, { method, headers: { cookie } });
      assert.equal(denied.status, 403);
      const deniedBody = await denied.json();
      assert.equal(deniedBody.code, 'FORBIDDEN');
      assert.equal(deniedBody.details.permission, method === 'GET' ? 'admin.plugins.read' : 'admin.plugins.enable');
    }
    deps.authorize = authorize;
    const fault = t.mock.method(deps.agentPluginLayout, 'forWorkspace', () => { throw new Error('private /secret/plugins'); });
    const failed = await fetch(`${prefix}/memory`, { headers: { cookie } });
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: 'internal error', code: 'INTERNAL_ERROR' });
    assert.equal(fault.mock.callCount(), 1);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(temporary);
  }
});

/** Installs plugin `example` under a temp plugins dir and boots the memory routes; cleanup is registered on `t`. */
async function bootMemoryApp(t: TestContext): Promise<{ prefix: string; cookie: string }> {
  const temporary = await mkdtemp(path.join(tmpdir(), 'plugin-memory-route-'));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = temporary;
  t.after(async () => {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(temporary);
  });
  const archive = Buffer.from('memory-route-example');
  await installAgentPlugin({ layout: resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }), workspaceId: 'workspace-local', archive,
    expectedSha256: createHash('sha256').update(archive).digest('hex'),
    archiveReader: { async *entries() {
      yield { kind: 'file', entryPath: 'plugin.json', async *openReadStream() { yield Buffer.from('{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"example"}'); } };
    } },
  });
  const deps = createRouteDeps(); const app = express(); app.use(express.json());
  registerAuthRoutes(app, deps); app.use('/api/admin', requireAdminSession(deps));
  registerAgentPluginMemoryRoutes(app, deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  return { prefix: `${baseUrl}/api/admin/v1/workspaces/workspace-local/agent-plugins`, cookie };
}

const putJson = (url: string, cookie: string, body: string) =>
  fetch(url, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body });

test('admin memory GET answers both lists and the memory limits', async t => {
  const { prefix, cookie } = await bootMemoryApp(t);
  const response = await fetch(`${prefix}/example/memory`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { pluginId: 'example', learned: [], notes: [], limits: DEFAULT_PLUGIN_MEMORY_LIMITS });
});

test('admin memory answers an unknown plugin with the not-found code', async t => {
  const { prefix, cookie } = await bootMemoryApp(t);
  const response = await fetch(`${prefix}/missing/memory`, { headers: { cookie } });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'agent plugin was not found', code: 'AGENT_PLUGIN_NOT_FOUND' });
});

test('admin memory checks the plugin exists before validating a write', async t => {
  const { prefix, cookie } = await bootMemoryApp(t);
  const response = await putJson(`${prefix}/missing/memory`, cookie, '[]');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'agent plugin was not found', code: 'AGENT_PLUGIN_NOT_FOUND' });
});

test('admin memory refuses a write with no body', async t => {
  const { prefix, cookie } = await bootMemoryApp(t);
  const response = await fetch(`${prefix}/example/memory`, { method: 'PUT', headers: { cookie } });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'entryPath and text are required', code: 'VALIDATION_ERROR' });
});

test('admin memory refuses an extra key even when entryPath and text are valid', async t => {
  const { prefix, cookie } = await bootMemoryApp(t);
  const response = await putJson(`${prefix}/example/memory`, cookie, JSON.stringify({ entryPath: 'a.md', text: 'x', extra: 1 }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'entryPath and text are required', code: 'VALIDATION_ERROR' });
});

test('admin memory answers a rejected note path with the invalid-note code', async t => {
  const { prefix, cookie } = await bootMemoryApp(t);
  const response = await putJson(`${prefix}/example/memory`, cookie, JSON.stringify({ entryPath: '../learned/injected.md', text: 'escape' }));
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: 'note path, text or size is invalid', code: 'PLUGIN_MEMORY_INVALID' });
});

test('admin memory PUT answers the saved note in the notes list', async t => {
  const { prefix, cookie } = await bootMemoryApp(t);
  const response = await putJson(`${prefix}/example/memory`, cookie, JSON.stringify({ entryPath: 'brand.md', text: 'Be brief.' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { pluginId: 'example', learned: [], notes: [{ relativePath: 'brand.md', text: 'Be brief.' }], limits: DEFAULT_PLUGIN_MEMORY_LIMITS });
});
