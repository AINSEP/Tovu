import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { BASE, WS, fixture, testRouteFailureMatrix } from '#src/server/__tests__/helpers/admin-route-failures';
import { registerAdminFormsPullSubmissionsRoute } from '../pull-submissions.js';

/** @file POST forms/submissions/pull: authorization, input, the unwired case, and the pass-through. */

const PATH = `${BASE}/forms/submissions/pull`;

testRouteFailureMatrix([{ name: 'forms submissions pull', register: registerAdminFormsPullSubmissionsRoute, method: 'POST', path: PATH, coded: true }]);

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
  const body = result.body as { error: string; code: string };
  assert.deepEqual({ status: result.status, code: body.code }, { status: 500, code: 'INTERNAL_ERROR' });
  assert.ok(!body.error.includes('secret detail'), 'the cause stays in the log');
  const reference = /report reference ([0-9a-f-]{36}) /.exec(body.error)?.[1];
  assert.ok(reference, body.error);
  assert.equal(logged.mock.callCount(), 1);
  assert.match(String(logged.mock.calls[0]!.arguments[0]), new RegExp(`reference ${reference}: Error: secret detail`));
});
