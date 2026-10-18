import assert from 'node:assert/strict';
import test from 'node:test';
import type { Express, Request, Response } from 'express';
import { registerAdminToolGapsRoute } from '../tool-gaps.js';

/** Execute only the route callback; no HTTP listener, app, daemon or CLI is started. */
async function invoke(principalId: string, workspaceId = 'w') {
  let handler!: (req: Request, res: Response) => Promise<void>;
  let reads = 0;
  registerAdminToolGapsRoute({ get: (_path: string, callback: typeof handler) => { handler = callback; } } as unknown as Express, {
    workspaceId: 'w', ownerPrincipalId: Promise.resolve('owner'),
    toolGaps: { list: async input => { reads++; assert.deepEqual(input, { workspaceId: 'w', principalId: 'owner' }); return []; } },
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
