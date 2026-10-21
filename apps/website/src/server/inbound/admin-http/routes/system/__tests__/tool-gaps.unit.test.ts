import assert from 'node:assert/strict';
import test from 'node:test';
import type { Express, Request, Response } from 'express';
import { registerAdminToolGapsRoute } from '../tool-gaps.js';
import type { ToolGapsToolDeps } from '#src/assistant/tool-gaps-tool';

/** Execute only the route callback; no HTTP listener, app, daemon or CLI is started. */
async function invoke(principalId: string, workspaceId = 'w', toolGaps?: ToolGapsToolDeps['toolGaps'] | null) {
  let handler!: (req: Request, res: Response) => Promise<void>;
  let reads = 0;
  registerAdminToolGapsRoute({ get: (_path: string, callback: typeof handler) => { handler = callback; } } as unknown as Express, {
    workspaceId: 'w', ownerPrincipalId: Promise.resolve('owner'),
    toolGaps: toolGaps === undefined
      ? { list: async input => { reads++; assert.deepEqual(input, { workspaceId: 'w', principalId: 'owner' }); return []; } }
      : toolGaps ?? undefined,
  });
  let status = 200, body: unknown;
  const res = { locals: { principal: { id: principalId } },
    status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; } };
  await handler({ params: { workspaceId } } as unknown as Request, res as unknown as Response);
  return { status, body, reads };
}

test('Tool gaps reads are owner-only and workspace-scoped before touching audit storage', async () => {
  assert.deepEqual(await invoke('owner'), { status: 200, body: { entries: [] }, reads: 1 });
  const denied = await invoke('another-admin');
  assert.equal(denied.status, 403); assert.equal(denied.reads, 0);
  const wrongSite = await invoke('owner', 'other');
  assert.equal(wrongSite.status, 404); assert.equal(wrongSite.reads, 0);
});

test('Tool gaps answer 503 when the composition root wired no audit store', async () => {
  assert.deepEqual(await invoke('owner', 'w', null), { status: 503, body: { error: 'Tool gap audit storage is unavailable.' }, reads: 0 });
});

test('Tool gaps audit read failures return a generic 500 and log without the storage detail', async (t) => {
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  const failing = { list: async () => { throw new Error('private storage detail'); } } as unknown as ToolGapsToolDeps['toolGaps'];
  assert.deepEqual(await invoke('owner', 'w', failing), { status: 500, body: { error: 'Could not read tool gaps.', code: 'INTERNAL_ERROR' }, reads: 0 });
  assert.deepEqual(logged, [['[tool-gaps] audit read failed']]);
});
