import { assertAdminDiagnostics } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { FormsRouteDeps } from '../deps.js';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { BASE, WS, fixture } from '#src/server/__tests__/helpers/admin-route-failures';
import { registerAdminFormsPullSubmissionsRoute } from '../pull-submissions.js';

const PATH = `${BASE}/forms/submissions/pull`;
const REPORT: Awaited<ReturnType<NonNullable<FormsRouteDeps['formSubmissionsPull']>['pull']>> = { ran: true, message: 'No new submissions.', destinations: [], forms: [], totals: { imported: 0, alreadyImported: 0, unmapped: 0, failed: 0 } };

for (const body of [undefined, null, false, 1, 'text', [], {}, { targetId: undefined }, { targetId: 'x' }, { targetId: 'x'.repeat(64) }, { targetId: ' ' }]) {
  test(`pull characterization: forwards optional target from ${JSON.stringify(body)}`, async () => {
    const calls: unknown[] = [];
    const port: NonNullable<FormsRouteDeps['formSubmissionsPull']> = {
      pull: async (required, optional) => { calls.push([required, optional]); return REPORT; },
    };
    const { app } = fixture(registerAdminFormsPullSubmissionsRoute, { formSubmissionsPull: port });
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', PATH, body), { status: 200, body: REPORT });
    const targetId = body !== null && typeof body === 'object' && 'targetId' in body ? body.targetId : undefined;
    assert.deepEqual(calls, [[{ workspaceId: WS }, targetId === undefined ? {} : { targetId }]]);
  });
}

for (const targetId of [null, '', 7, false, {}, [], 'x'.repeat(65)]) {
  test(`pull characterization: invalid target ${JSON.stringify(targetId)} precedes unavailable port`, async () => {
    const { app } = fixture(registerAdminFormsPullSubmissionsRoute, { formSubmissionsPull: undefined });
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', PATH, { targetId }), {
      status: 400,
      body: { error: 'targetId must be a hosting target id of 1-64 characters, or omitted to pull from every published site', code: 'FORMS_FIELD_VALIDATION_ERROR',
        details: { fieldErrors: [{ field: 'targetId', reason: 'must be 1-64 characters' }] } },
    });
  });
}

test('pull characterization: workspace and permission gates precede body validation and pulling', async () => {
  const calls: unknown[] = [];
  const port: NonNullable<FormsRouteDeps['formSubmissionsPull']> = { pull: async () => { calls.push('pull'); return REPORT; } };
  const authorize: FormsRouteDeps['authorize'] = async (input) => { calls.push(input); return { allowed: false, reason: 'no_grant' }; };
  const { app } = fixture(registerAdminFormsPullSubmissionsRoute, { authorize, formSubmissionsPull: port });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', PATH.replace(WS, 'other'), { targetId: '' }), {
    status: 404, body: { error: 'workspace was not found' },
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', PATH, { targetId: '' }), {
    status: 403, body: { error: "principal 'owner' is not authorized for 'admin.forms.manage' (no_grant)", code: 'FORBIDDEN',
      details: { permission: 'admin.forms.manage', reason: 'no_grant' } },
  });
  assert.deepEqual(calls, [{ principalId: 'owner', permission: 'admin.forms.manage', workspaceId: WS, entityType: 'form_submission' }]);
});

const stackError = new Error('private cause');
stackError.stack = 'private stack';
const messageError = new Error('private message');
messageError.stack = undefined;
for (const [cause, detail] of [[stackError, 'private stack'], [messageError, 'private message'], ['private rejection', 'private rejection']] as const) {
  test(`pull characterization: failure logs ${detail} under the response reference`, async (t) => {
    const logged = t.mock.method(console, 'error', () => {});
    const port: NonNullable<FormsRouteDeps['formSubmissionsPull']> = { pull: async () => { throw cause; } };
    const { app } = fixture(registerAdminFormsPullSubmissionsRoute, { formSubmissionsPull: port });
    const result = await dispatchJsonRequest(app, 'POST', PATH);
    assert.equal(result.status, 500);
    const body = result.body as any;
    assert.match(body.errorId, /^[0-9a-f-]{36}$/);
    assert.equal(body.code, 'INTERNAL_ERROR');
    assert.equal(body.error, `Form submission retrieval stopped before any published host was read. Try pulling submissions again. If it still fails, copy details and report this problem. (error ${body.errorId})`);
    assert.equal(body.details.failure.message, "Form submission retrieval stopped before any published host was read.");
    assert.equal(body.details.failure.errorId, body.errorId);
    assert.equal(body.details.failure.cause, "The error ID identifies the server report.");
    assert.equal(body.details.failure.step, "forms.submissions.pull");
    assertAdminDiagnostics({ calls: logged.mock.calls.map(call => call.arguments), operation: "[forms-pull]", diagnostics: [new RegExp(detail)] });
  });
}

test('pull characterization: logger failure cannot prevent the private error response', async (t) => {
  const logged = t.mock.method(console, 'error', () => { throw new Error('private logger failure'); });
  const port: NonNullable<FormsRouteDeps['formSubmissionsPull']> = { pull: async () => { throw new Error('private pull failure'); } };
  const { app } = fixture(registerAdminFormsPullSubmissionsRoute, { formSubmissionsPull: port });
  const result = await dispatchJsonRequest(app, 'POST', PATH);
  const body = result.body as any;
  assert.equal(result.status, 500);
  assert.match(body.errorId, /^[0-9a-f-]{36}$/);
  assert.equal(body.code, 'INTERNAL_ERROR');
  assert.equal(body.error, `Form submission retrieval stopped before any published host was read. Try pulling submissions again. If it still fails, copy details and report this problem. (error ${body.errorId})`);
  assert.equal(body.details.failure.errorId, body.errorId);
  assert.equal(body.details.failure.cause, "The error ID identifies the server report.");
  assert.equal(logged.mock.callCount(), 1);
});

test('pull characterization: missing principal falls back before authorization', async () => {
  let authorizations = 0;
  const { app } = fixture((app, deps) => {
    app.use((_req, res, next) => { delete res.locals.principal; next(); });
    registerAdminFormsPullSubmissionsRoute(app, deps);
  }, { authorize: async () => { authorizations++; return { allowed: true }; } });
  const response = await dispatchJsonRequest(app, 'POST', PATH);
  const body = response.body as any;
  assert.deepEqual(response, { status: 500, body: {
    code: 'INTERNAL_ERROR', errorId: body.errorId,
    error: `The form submission pull could not be completed. Check the result before repeating this operation. Copy details and report this problem. (error ${body.errorId})`,
  } });
  assert.match(body.errorId, /^[0-9a-f-]{36}$/);
  assert.equal(authorizations, 0);
});
