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
import { installAgentPlugin } from '#src/features/agent-plugins/install';
import { resolveAgentPluginLayout } from '#src/features/agent-plugins/layout';
import { forceRemove } from '#src/features/agent-plugins/__tests__/fixtures/force-remove';
import { registerAgentPluginMemoryRoutes } from '../../memory.js';
import { registerAgentPluginFilesRoute } from '../../files.js';

test('admin memory round-trips a user note, refuses learned writes/traversal, and package viewer excludes state', async t => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'plugin-memory-route-'));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = temporary;
  try {
    const archive = Buffer.from('memory-route-example');
    await installAgentPlugin({ layout: resolveAgentPluginLayout(), workspaceId: 'workspace-local', archive,
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
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(temporary);
  }
});
