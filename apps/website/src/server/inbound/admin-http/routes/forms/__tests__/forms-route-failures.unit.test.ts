import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { registerAdminFormsAuthoringRoute } from '../authoring.js';
import { registerAdminFormsCreateRoute } from '../create.js';
import { registerAdminFormsDeleteSubmissionRoute } from '../delete-submission.js';
import { registerAdminFormsGetRoute } from '../get-by-id.js';
import { registerAdminFormsGetSubmissionRoute } from '../get-submission.js';
import { registerAdminFormsListSubmissionsRoute } from '../list-submissions.js';
import { registerAdminFormsListRoute } from '../list.js';
import { registerAdminFormsUpdateRoute } from '../update.js';
import { DuplicateCommandError } from '@jini-ai/cms/core';
import { WS, BASE, INTERNAL_CODE, fixture, invokeRouteDirectly, testRouteFailureMatrix, type RouteFailureCase } from '#src/server/__tests__/helpers/admin-route-failures';

const routes: RouteFailureCase[] = [
  { name: 'forms authoring', register: registerAdminFormsAuthoringRoute, method: 'PUT', path: `${BASE}/forms/form/authoring`, coded: true },
  { name: 'forms get', register: registerAdminFormsGetRoute, method: 'GET', path: `${BASE}/forms/form`, coded: true },
  { name: 'forms submissions delete', register: registerAdminFormsDeleteSubmissionRoute, method: 'DELETE', path: `${BASE}/forms/form/submissions/sub`, coded: true },
  { name: 'forms submissions get', register: registerAdminFormsGetSubmissionRoute, method: 'GET', path: `${BASE}/forms/form/submissions/sub`, coded: true },
  { name: 'forms submissions list', register: registerAdminFormsListSubmissionsRoute, method: 'GET', path: `${BASE}/forms/form/submissions`, coded: true },
  { name: 'forms list', register: registerAdminFormsListRoute, method: 'GET', path: `${BASE}/forms`, coded: true },
  { name: 'forms update', register: registerAdminFormsUpdateRoute, method: 'PUT', path: `${BASE}/forms/form`, coded: true },
];

testRouteFailureMatrix(routes);

for (const method of ['GET', 'DELETE']) {
  test(`form submission ${method}: unknown form stops before reading or removing submissions`, async () => {
    let reads = 0;
    const register = method === 'GET' ? registerAdminFormsGetSubmissionRoute : registerAdminFormsDeleteSubmissionRoute;
    const { app } = fixture(register, {
      formDefinitionRepo: { findBySlug: async () => null, findById: async () => null },
      formSubmissionRepo: { findById: async () => { reads++; return null; } },
    });
    assert.deepEqual(await dispatchJsonRequest(app, method, `${BASE}/forms/form/submissions/sub`), {
      status: 404, body: { error: "form definition 'form' was not found", code: 'FORMS_DEFINITION_NOT_FOUND' },
    });
    assert.equal(reads, 0);
  });
}

for (const [submission, reason] of [[null, 'absent'], [{ id: 'sub', formDefinitionId: 'other' }, 'different form']] as const) {
  for (const method of ['GET', 'DELETE']) {
    test(`form submission ${method}: ${reason} is not disclosed or removed`, async () => {
      let removals = 0;
      const { app } = fixture(method === 'GET' ? registerAdminFormsGetSubmissionRoute : registerAdminFormsDeleteSubmissionRoute, {
        formDefinitionRepo: { findBySlug: async () => ({ id: 'form', name: 'Contact' }) },
        formSubmissionRepo: { findById: async () => submission },
        removeFormSubmission: async () => { removals++; return { ok: true }; },
      });
      assert.deepEqual(await dispatchJsonRequest(app, method, `${BASE}/forms/form/submissions/sub`), {
        status: 404, body: { error: "submission 'sub' was not found", code: 'FORMS_SUBMISSION_NOT_FOUND' },
      });
      assert.equal(removals, 0);
    });
  }
}

for (const reason of ['not-found', 'version-changed']) {
  test(`submission deletion race reports ${reason} and carries scoped removal metadata`, async () => {
    let removal: unknown;
    const submittedAt = '2026-10-19T00:00:00.000Z';
    const { app, deps } = fixture(registerAdminFormsDeleteSubmissionRoute, {
      formDefinitionRepo: { findBySlug: async () => ({ id: 'real-form', name: 'Contact' }) },
      formSubmissionRepo: { findById: async () => ({ id: 'sub', formDefinitionId: 'real-form', submittedAt }) },
      clock: { nowMs: () => 0, nowIso: () => '1970-01-01T00:00:00.000Z' },
      removeFormSubmission: async (input: unknown) => { removal = input; return { ok: false, reason }; },
    });
    assert.deepEqual(await dispatchJsonRequest(app, 'DELETE', `${BASE}/forms/form/submissions/sub`), {
      status: reason === 'not-found' ? 404 : 409,
      body: reason === 'not-found' ? { error: "submission 'sub' was not found", code: 'FORMS_SUBMISSION_NOT_FOUND' }
        : { error: "submission 'sub' changed while it was being deleted", code: 'TRASH_VERSION_CHANGED' },
    });
    assert.deepEqual(removal, { workspaceId: deps.workspaceId, id: 'sub', display: { title: 'Contact', subtitle: submittedAt },
      at: '1970-01-01T00:00:00.000Z', expectedVersion: null, actor: { principalId: 'owner', pluginId: null } });
  });
}

test('forms list: repository rejection is an internal error', async () => {
  const { app } = fixture(registerAdminFormsListRoute, { formDefinitionRepo: { list: async () => { throw new Error('private'); } } });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/forms`), { status: 500, body: INTERNAL_CODE });
});

test('forms update: ignored fields read the existing definition, missing definition maps to 404', async () => {
  const { app } = fixture(registerAdminFormsUpdateRoute, { formDefinitionRepo: { findById: async () => null } });
  const result = await dispatchJsonRequest(app, 'PUT', `${BASE}/forms/form`, { status: 'unknown', slug: 'ignored' });
  assert.equal(result.status, 404);
  assert.equal((result.body as { code: string }).code, 'FORMS_DEFINITION_NOT_FOUND');
});

test('forms create: absent body validates the required name instead of throwing', async () => {
  const { app, deps } = fixture(registerAdminFormsCreateRoute);
  const response = await dispatchJsonRequest(app, 'POST', `${BASE}/forms`);
  assert.equal(response.status, 400);
  assert.equal((response.body as { code: string }).code, 'FORMS_FIELD_VALIDATION_ERROR');
  assert.deepEqual(await deps.formDefinitionRepo.list({ workspaceId: WS }), []);
});

test('forms create: duplicate command reports the winning change set and does not save a definition', async () => {
  let attempts = 0;
  const { app, deps } = fixture(registerAdminFormsCreateRoute, {
    executeCommand: async () => { attempts++; throw new DuplicateCommandError({ message: 'already applied', changeSetId: 'winner' }); },
  });
  // Builder forms require a field before the command gateway can be reached.
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/forms`, {
    name: 'Contact', slug: 'contact', fields: [{ id: 'message', type: 'text', label: 'Message', required: false }],
  }), {
    status: 409, body: { error: 'already applied', code: 'DUPLICATE_COMMAND', changeSetId: 'winner' },
  });
  assert.equal(attempts, 1);
  assert.deepEqual(await deps.formDefinitionRepo.list({ workspaceId: WS }), []);
});

test('forms create: unexpected command failure is private and leaves no definition', async () => {
  let attempts = 0;
  const { app, deps } = fixture(registerAdminFormsCreateRoute, { executeCommand: async () => { attempts++; throw new Error('private'); } });
  // Builder forms require a field before the command gateway can be reached.
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/forms`, {
    name: 'Contact', slug: 'contact', fields: [{ id: 'message', type: 'text', label: 'Message', required: false }],
  }), { status: 500, body: INTERNAL_CODE });
  assert.equal(attempts, 1);
  assert.deepEqual(await deps.formDefinitionRepo.list({ workspaceId: WS }), []);
});

test('forms authoring: supplied patch fields persist, absent fields and an absent body preserve them', async () => {
  const { app, deps } = fixture((app, deps) => {
    registerAdminFormsCreateRoute(app, deps);
    registerAdminFormsAuthoringRoute(app, deps);
    registerAdminFormsUpdateRoute(app, deps);
  });
  // Start with a valid field; the authoring patch must change its label and required flag.
  const created = await dispatchJsonRequest(app, 'POST', `${BASE}/forms`, {
    name: 'Contact', slug: 'contact', fields: [{ id: 'message', type: 'text', label: 'Original message', required: true }],
  });
  assert.equal(created.status, 201);
  const id = (created.body as { data: { id: string } }).data.id;
  const fields = [{ id: 'message', type: 'text', label: 'Message', required: false }];
  const notify = { enabled: true, recipients: ['owner@example.com'] };
  const updated = await dispatchJsonRequest(app, 'PUT', `${BASE}/forms/${id}/authoring`, { name: 'Feedback', fields, notify, mode: 'builder', html: '<p>Draft</p>' });
  assert.equal(updated.status, 200);
  const saved = await deps.formDefinitionRepo.findById({ workspaceId: WS, id });
  assert.equal(saved?.name, 'Feedback');
  assert.deepEqual(saved?.fields, fields);
  assert.deepEqual(saved?.notify, notify);
  const unchanged = await dispatchJsonRequest(app, 'PUT', `${BASE}/forms/${id}/authoring`);
  assert.equal(unchanged.status, 200);
  assert.equal((unchanged.body as { data: { name: string } }).data.name, 'Feedback');
  const ignored = await dispatchJsonRequest(app, 'PUT', `${BASE}/forms/${id}`, { status: 3 });
  assert.equal(ignored.status, 200);
  assert.equal((ignored.body as { data: { name: string } }).data.name, 'Feedback');
});

test('forms submissions: non-string cursor is rejected without listing submissions', async () => {
  let reads = 0;
  const { app } = fixture(registerAdminFormsListSubmissionsRoute, {
    formDefinitionRepo: { findBySlug: async () => ({ id: 'form' }) },
    formSubmissionRepo: { listByDefinition: async () => { reads++; return { items: [], nextCursor: null }; } },
  });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/forms/form/submissions?cursor[]=a`), {
    status: 400, body: { error: 'cursor must be a string', code: 'FORMS_FIELD_VALIDATION_ERROR', details: { fieldErrors: [{ field: 'cursor', reason: 'must be a string' }] } },
  });
  assert.equal(reads, 0);
});

/**
 * `String(req.params.X ?? "")` (extractRouteHandler's own doc, `helpers/http-test-server.ts`): Express
 * guarantees a matched `:param` is always populated, so the right side of each `??` below is unreachable
 * through any real HTTP request. Restored 2026-09-03 after being wrongly deleted as "unreachable dead
 * code" -- the repo's established answer is to KEEP the guard and exercise it with a hand-built `req`
 * that deliberately violates that contract. An empty id resolves nothing: the ordinary not-found path.
 */
test('forms create: `req.params.workspaceId ?? ""` fallback, forced via a direct handler call, is the workspace 404 before authorization', async () => {
  let calls = 0;
  const { app } = fixture(registerAdminFormsCreateRoute, { authorize: async () => { calls++; return { allowed: true }; } });
  assert.deepEqual(await invokeRouteDirectly({ app, method: 'POST', path: `${BASE}/forms`, req: { params: {}, query: {}, body: { name: 'Contact', slug: 'contact' } } }), {
    statusCode: 404, jsonBody: { error: 'workspace was not found' },
  });
  assert.equal(calls, 0);
});

for (const { name, register, method, path, body } of [
  { name: 'forms get: `req.params.formId ?? ""`', register: registerAdminFormsGetRoute, method: 'GET', path: `${BASE}/forms/form`, body: undefined },
  { name: 'forms update: `req.params.formId ?? ""`', register: registerAdminFormsUpdateRoute, method: 'PUT', path: `${BASE}/forms/form`, body: { name: 'Renamed' } },
  { name: 'forms submissions list: `req.params.formId ?? ""`', register: registerAdminFormsListSubmissionsRoute, method: 'GET', path: `${BASE}/forms/form/submissions`, body: undefined },
  { name: 'forms submissions get: `req.params.formId ?? ""` / `req.params.submissionId ?? ""`', register: registerAdminFormsGetSubmissionRoute, method: 'GET', path: `${BASE}/forms/form/submissions/sub`, body: undefined },
  { name: 'forms submissions delete: `req.params.formId ?? ""` / `req.params.submissionId ?? ""`', register: registerAdminFormsDeleteSubmissionRoute, method: 'DELETE', path: `${BASE}/forms/form/submissions/sub`, body: undefined },
]) {
  test(`${name} fallback, forced via a direct handler call, looks up the empty id and answers not-found`, async () => {
    const { app } = fixture(register);
    assert.deepEqual(await invokeRouteDirectly({ app, method, path, req: { params: { workspaceId: WS }, query: {}, body } }), {
      statusCode: 404, jsonBody: { error: "form definition '' was not found", code: 'FORMS_DEFINITION_NOT_FOUND' },
    });
  });
}
