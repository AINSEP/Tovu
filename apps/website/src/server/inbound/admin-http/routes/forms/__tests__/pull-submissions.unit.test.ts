import { assertAdminDiagnostics } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { BASE, WS, fixture, invokeRouteDirectly } from '#src/server/__tests__/helpers/admin-route-failures';
import { registerAdminFormsPullSubmissionsRoute } from '../pull-submissions.js';

/** @file POST forms/submissions/pull: authorization, input, the unwired case, and the pass-through. */

const PATH = `${BASE}/forms/submissions/pull`;

test('forms submissions pull: authorization failure stays private with safe copyable evidence', async t => {
  t.mock.method(console, 'error', () => {});
  const { app } = fixture(registerAdminFormsPullSubmissionsRoute, { authorize: async () => { throw new Error('private credential'); } });
  const response = await dispatchJsonRequest(app, 'POST', PATH);
  assert.equal(response.status, 500);
  const body = response.body as any;
  assert.equal(body.code, 'INTERNAL_ERROR');
  assert.equal(body.error, `The form submission pull could not be completed. Check the result before repeating this operation. Copy details and report this problem. (error ${body.errorId})`);
  assert.equal(body.details.failure.message, 'The form submission pull could not be completed.');
  assert.equal(body.details.failure.action, 'Check the result before repeating this operation. Copy details and report this problem.');
  assert.equal(body.details.failure.step, 'form submission pull');
  assert.equal(body.details.failure.cause, 'The error ID identifies the server report.');
  assert.equal(body.details.failure.errorId, body.errorId);
  assert.equal(JSON.stringify(body).includes('private credential'), false);
});

test('forms submissions pull: denied permission stops before pulling', async () => {
  let calls = 0;
  const { app } = fixture(registerAdminFormsPullSubmissionsRoute, { authorize: async () => { calls++; return { allowed: false, reason: 'no_grant' }; },
    formSubmissionsPull: { pull: async () => { throw new Error('must not pull'); } } });
  const response = await dispatchJsonRequest(app, 'POST', PATH);
  assert.equal(response.status, 403);
  assert.equal((response.body as any).code, 'FORBIDDEN');
  assert.equal(calls, 1);
});

test('forms submissions pull: workspace isolation precedes authorization', async () => {
  let calls = 0;
  const { app } = fixture(registerAdminFormsPullSubmissionsRoute, { authorize: async () => { calls++; return { allowed: true }; } });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', PATH.replace(BASE, '/api/admin/v1/workspaces/other')), {
    status: 404, body: { error: 'workspace was not found' },
  });
  assert.equal(calls, 0);
});

test('forms submissions pull: missing workspace parameter is refused before authorization', async () => {
  let calls = 0;
  const { app } = fixture(registerAdminFormsPullSubmissionsRoute, { authorize: async () => { calls++; return { allowed: true }; } });
  assert.deepEqual(await invokeRouteDirectly({ app, method: 'POST', path: PATH, req: { params: {}, query: {} } }), {
    statusCode: 404, jsonBody: { error: 'workspace was not found' },
  });
  assert.equal(calls, 0);
});

function pullSpy() {
  const calls: unknown[][] = [];
  return { calls, port: { pull: async (...args: unknown[]) => { calls.push(args); return { message: 'Imported 3 new form submissions from 1 published site.', destinations: [] }; } } };
}

test('forms submissions pull: returns the pull report, for every destination or one target', async () => {
  const spy = pullSpy();
  const { app } = fixture(registerAdminFormsPullSubmissionsRoute, { formSubmissionsPull: spy.port });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', PATH), { status: 200, body: { message: 'Imported 3 new form submissions from 1 published site.', destinations: [] } });
  await dispatchJsonRequest(app, 'POST', PATH, { targetId: 'host-a' });
  assert.deepEqual(spy.calls, [[{ workspaceId: WS }, {}], [{ workspaceId: WS }, { targetId: 'host-a' }]]);
});

for (const targetId of ['', 7, 'x'.repeat(65)]) {
  test(`forms submissions pull: targetId ${JSON.stringify(targetId).slice(0, 12)} is refused before pulling`, async () => {
    const spy = pullSpy();
    const { app } = fixture(registerAdminFormsPullSubmissionsRoute, { formSubmissionsPull: spy.port });
    const result = await dispatchJsonRequest(app, 'POST', PATH, { targetId });
    assert.equal(result.status, 400);
    assert.equal((result.body as { code: string }).code, 'FORMS_FIELD_VALIDATION_ERROR');
    assert.equal(spy.calls.length, 0);
  });
}

test('forms submissions pull: an unwired server says so with a next step', async () => {
  const { app } = fixture(registerAdminFormsPullSubmissionsRoute, { formSubmissionsPull: undefined });
  const result = await dispatchJsonRequest(app, 'POST', PATH);
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: "pulling form submissions is not available on this site's server; restart the site, then try again", code: 'FORMS_PULL_UNAVAILABLE' });
});

test('forms submissions pull: a thrown pull is a private 500 that names a reference the server log repeats', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const { app } = fixture(registerAdminFormsPullSubmissionsRoute, { formSubmissionsPull: { pull: async () => { throw new Error('secret detail'); } } });
  const result = await dispatchJsonRequest(app, 'POST', PATH);
  const body = result.body as any;
  assert.deepEqual({ status: result.status, code: body.code }, { status: 500, code: 'INTERNAL_ERROR' });
  assert.ok(!body.error.includes('secret detail'), 'the cause stays in the log');
  assert.match(body.errorId, /^[0-9a-f-]{36}$/);
  assert.equal(body.error, `Form submission retrieval stopped before any published host was read. Try pulling submissions again. If it still fails, copy details and report this problem. (error ${body.errorId})`);
  assert.equal(body.details.failure.message, "Form submission retrieval stopped before any published host was read.");
  assert.equal(body.details.failure.errorId, body.errorId);
  assert.equal(body.details.failure.step, "forms.submissions.pull");
  assert.equal(body.details.failure.cause, "The error ID identifies the server report.");
  assertAdminDiagnostics({ calls: logged.mock.calls.map(call => call.arguments), operation: "[forms-pull]", diagnostics: [/Error: secret detail/] });
});
