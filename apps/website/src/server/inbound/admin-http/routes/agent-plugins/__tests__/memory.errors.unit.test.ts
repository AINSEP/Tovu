import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import type { Express, Request, Response } from 'express';

const lifecycle = await import('#src/features/agent-plugins/lifecycle');
mock.module('#src/features/agent-plugins/lifecycle', { namedExports: { ...lifecycle, listInstalledPlugins: async () => [{ pluginId: 'example' }] } });
let writeFailure: Error = new Error('invalid note');
mock.module('#src/features/agent-plugins/memory', { namedExports: { pluginMemory: () => ({
  writeNote: async () => { throw writeFailure; }, list: async () => [],
}) } });
const { registerAgentPluginMemoryRoutes } = await import('../memory.js');

test('note validation is a refusal while filesystem errors report a redacted incident', async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); });
  let put: ((req: Request, res: Response) => Promise<void>) | undefined;
  const app = { get() {}, put: (_path: string, handler: typeof put) => { put = handler; } } as unknown as Express;
  const deps = { workspaceId: 'ws', authorize: async () => ({ allowed: true }), agentPluginLayout: { forWorkspace: () => ({ root: '/tmp/plugins' }) } };
  registerAgentPluginMemoryRoutes(app, deps as unknown as Parameters<typeof registerAgentPluginMemoryRoutes>[1]);
  assert.ok(put, 'the note route is registered');
  const handler = put;
  const req = { params: { workspaceId: 'ws', pluginId: 'example' }, body: { entryPath: 'note.md', text: 'PRIVATE_NOTE_BODY' } } as unknown as Request;
  async function attempt(error: Error) {
    writeFailure = error;
    let status = 200; let body: unknown;
    const res = { locals: { principal: { id: 'owner' } }, status(code: number) { status = code; return res; }, json(value: unknown) { body = value; return res; } };
    await handler(req, res as unknown as Response);
    return { status, body };
  }
  const refusal = await attempt(new Error('invalid note'));
  assert.equal(refusal.status, 422);
  assert.deepEqual(refusal.body, { error: 'note path, text or size is invalid', code: 'PLUGIN_MEMORY_INVALID' });
  assert.equal(logs.length, 0);
  const failure = await attempt(Object.assign(new Error('boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET'), { code: 'EACCES' }));
  assert.equal(failure.status, 500);
  assert.ok(failure.body && typeof failure.body === 'object' && 'errorId' in failure.body && 'error' in failure.body);
  assert.match(String(failure.body.error), /The note could not be saved/);
  const entry = logs.find(args => args[0] === '[agent-plugins:write-note]');
  assert.ok(entry, 'the server reports the note-write incident');
  const detail = entry[1] as { errorId: string; diagnostic: string };
  assert.equal(detail.errorId, failure.body.errorId);
  assert.match(detail.diagnostic, /boom/);
  assert.match(detail.diagnostic, /memory\.errors\.unit\.test\.ts/);
  assert.doesNotMatch(JSON.stringify({ body: failure.body, logs }), /SECRETSECRETSECRETSECRET|PRIVATE_NOTE_BODY/);
});
