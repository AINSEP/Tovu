import assert from 'node:assert/strict';
import test from 'node:test';
import type { Express } from 'express';
import { registerToolAccessLoweringRoute } from '../tool-access-lowering-route.js';

test('unexpected lowering failure returns the same reference recorded in its redacted server incident', async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); });
  let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined;
  const app = { post: (_path: string, next: typeof handler) => { handler = next; } } as unknown as Express;
  registerToolAccessLoweringRoute({ app, lower: async () => { throw new Error('boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET'); } });
  assert.ok(handler, 'the lowering route is registered');
  let status = 0; let body: unknown;
  const res = { locals: { principal: { id: 'owner' } }, status(code: number) { status = code; return res; }, json(value: unknown) { body = value; return res; } };
  await handler({ body: { serverIds: ['mail'] } }, res);
  assert.equal(status, 500);
  assert.ok(body && typeof body === 'object' && 'error' in body && 'errorId' in body);
  assert.match(String(body.error), /Couldn't stop affected answers after tool access changed/);
  assert.doesNotMatch(JSON.stringify(body), /boom|SECRETSECRETSECRETSECRET/);
  const entry = logs.find(args => args[0] === '[tool-access:lower]'); assert.ok(entry, 'the incident is logged');
  const detail = entry[1] as { errorId: string; diagnostic: string };
  assert.equal(detail.errorId, body.errorId);
  assert.match(detail.diagnostic, /boom/);
  assert.match(detail.diagnostic, /tool-access-lowering-route\.errors\.unit\.test\.ts/);
  assert.doesNotMatch(detail.diagnostic, /SECRETSECRETSECRETSECRET/);
});
