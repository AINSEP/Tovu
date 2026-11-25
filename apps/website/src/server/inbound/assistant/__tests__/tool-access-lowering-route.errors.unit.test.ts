import assert from 'node:assert/strict';
import test from 'node:test';
import type { Express } from 'express';
import { registerToolAccessLoweringRoute } from '../tool-access-lowering-route.js';
import { assertReporterDiagnostics, recordingComposedReporter } from '#src/server/__tests__/helpers/composed-reporter-probe';

test('unexpected lowering failure returns the same reference recorded in its redacted server incident', async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); });
  const { reporter, records, reports } = recordingComposedReporter();
  let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined;
  const app = { post: (_path: string, next: typeof handler) => { handler = next; } } as unknown as Express;
  registerToolAccessLoweringRoute({ app, lower: async () => { throw new Error('boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET'); }, reporter });
  assert.ok(handler, 'the lowering route is registered');
  let status = 0; let body: unknown;
  const res = { locals: { principal: { id: 'owner' } }, status(code: number) { status = code; return res; }, json(value: unknown) { body = value; return res; } };
  await handler({ body: { serverIds: ['mail'] } }, res);
  assert.equal(status, 500);
  assert.ok(body && typeof body === 'object' && 'error' in body && 'errorId' in body);
  assert.match(String(body.error), /Couldn't stop affected answers after tool access changed/);
  assert.doesNotMatch(JSON.stringify(body), /boom|SECRETSECRETSECRETSECRET/);
  // The composed reporter is the only sink: one host record and one tracker report under the reply's id.
  assertReporterDiagnostics({ records, operation: 'tool-access:lower', diagnostics: [/boom[\s\S]*tool-access-lowering-route\.errors\.unit\.test\.ts/] });
  const detail = (records[0]![1] as { meta: { errorId: string; diagnostic: string } }).meta;
  assert.equal(detail.errorId, body.errorId);
  assert.doesNotMatch(detail.diagnostic, /SECRETSECRETSECRETSECRET/);
  assert.equal(reports.length, 1, 'one tracker report');
  assert.doesNotMatch(JSON.stringify({ records, reports: reports.map(([report, meta]) => [report.error.message, meta]) }), /SECRETSECRETSECRETSECRET/);
  assert.equal(logs.length, 0, 'no legacy console sink line');
});
