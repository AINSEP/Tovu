import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Express, Request, RequestHandler, Response } from 'express';
import { createFormDefinition } from '#src/features/forms/index';
import { fixture, WS } from '#src/server/__tests__/helpers/admin-route-failures';
import type { FormsRouteDeps, FormsRouteRegistrar } from '../deps.js';
import { registerAdminFormsAuthoringRoute } from '../authoring.js';
import { registerAdminFormsDeleteSubmissionRoute } from '../delete-submission.js';

// Capture the real route callback; the response fake also observes bodyless 204 responses.
async function invoke({ register, deps, params, body, key }: {
  register: FormsRouteRegistrar; deps: FormsRouteDeps; params: Record<string, string | undefined>;
  body?: unknown; key?: string;
}, _options = {}) {
  let handler: RequestHandler | undefined;
  const capture = (_path: string, callback: RequestHandler) => { handler = callback; };
  register({ put: capture, delete: capture } as unknown as Express, deps);
  assert.ok(handler);
  let status = 200;
  let responseBody: unknown;
  let ended = false;
  const res = {
    locals: { principal: { id: 'owner' } },
    status(value: number) { status = value; return res; },
    json(value: unknown) { responseBody = value; return res; },
    end() { ended = true; return res; },
  };
  const req = { params, body, get: (name: string) => name === 'Idempotency-Key' ? key : undefined };
  await handler(req as unknown as Request, res as unknown as Response, () => assert.fail('unexpected next'));
  return { status, body: responseBody, ended };
}

const fields = [{ id: 'message', type: 'text' as const, label: 'Message', required: false }];

for (const body of [undefined, null, {}, { name: 7, fields: {}, ignored: true }]) {
  test(`L244 authoring: absent or ignored patch preserves the definition: ${JSON.stringify(body)}`, async () => {
    const { deps } = fixture(() => {}, { clock: { nowMs: () => 0 } });
    const { definition } = await createFormDefinition({ deps: { ...deps, repo: deps.formDefinitionRepo }, input: {
      workspaceId: WS, actor: { id: 'owner', kind: 'user' }, name: 'Contact', slug: 'contact', fields,
    } });
    const before = await deps.formDefinitionRepo.findById({ workspaceId: WS, id: definition.id });
    const result = await invoke({ register: registerAdminFormsAuthoringRoute, deps,
      params: { workspaceId: WS, formId: definition.id }, body });
    assert.equal(result.status, 200);
    assert.deepEqual(await deps.formDefinitionRepo.findById({ workspaceId: WS, id: definition.id }), before);
  });
}

for (const key of [undefined, '', 'authoring-request']) {
test(`L244 authoring: supplied builder values and key ${JSON.stringify(key)} reach the audited write`, async () => {
  const { deps } = fixture(() => {});
  const { definition } = await createFormDefinition({ deps: { ...deps, repo: deps.formDefinitionRepo }, input: {
    workspaceId: WS, actor: { id: 'owner', kind: 'user' }, name: 'Contact', slug: 'contact', fields,
  } });
  const keys: (string | undefined)[] = [];
  const executeCommand: FormsRouteDeps['executeCommand'] = (required, optional) => {
    keys.push(required.command.idempotencyKey);
    return deps.executeCommand(required, optional);
  };
  const updatedFields = [{ ...fields[0]!, label: 'Feedback' }];
  const notify = { enabled: true, recipients: ['owner@example.com'] };
  const result = await invoke({ register: registerAdminFormsAuthoringRoute, deps: { ...deps, executeCommand },
    params: { workspaceId: WS, formId: definition.id }, key,
    body: { name: 'Feedback', fields: updatedFields, notify, mode: 'builder', html: '<p>Draft</p>' } });
  assert.equal(result.status, 200);
  const saved = await deps.formDefinitionRepo.findById({ workspaceId: WS, id: definition.id });
  assert.equal(saved?.name, 'Feedback');
  assert.deepEqual(saved?.fields, updatedFields);
  assert.deepEqual(saved?.notify, notify);
  assert.deepEqual(keys, [key || undefined]);
});
}

for (const key of [undefined, '']) {
  test(`L244 authoring: missing form is mapped to 404 with an absent or empty key (${JSON.stringify(key)})`, async () => {
    const { deps } = fixture(() => {});
    const result = await invoke({ register: registerAdminFormsAuthoringRoute, deps, params: { workspaceId: WS }, key });
    assert.equal(result.status, 404);
    assert.equal((result.body as { code: string }).code, 'FORMS_DEFINITION_NOT_FOUND');
  });
}

for (const register of [registerAdminFormsAuthoringRoute, registerAdminFormsDeleteSubmissionRoute]) {
  for (const workspaceId of [undefined, 'other']) {
    test(`L244 ${register.name}: workspace ${workspaceId} stops before authorization`, async () => {
      const { deps } = fixture(() => {});
      const result = await invoke({ register, deps: { ...deps, authorize: async () => assert.fail('must not authorize') }, params: { workspaceId } });
      assert.deepEqual(result, { status: 404, body: { error: 'workspace was not found' }, ended: false });
    });
  }
  test(`L244 ${register.name}: denial preserves the full forbidden response and prevents reads`, async () => {
    const { deps } = fixture(() => {});
    const permission = register === registerAdminFormsAuthoringRoute ? 'admin.forms.manage' : 'admin.forms.submissions.delete';
    const result = await invoke({ register, deps: { ...deps, authorize: async () => ({ allowed: false, reason: 'no_grant' }),
      formDefinitionRepo: { ...deps.formDefinitionRepo, findById: async () => assert.fail('must not read'), findBySlug: async () => assert.fail('must not read') } },
      params: { workspaceId: WS, formId: 'form', submissionId: 'sub' }, body: {} });
    assert.deepEqual(result, { status: 403, body: {
      error: `principal 'owner' is not authorized for '${permission}' (no_grant)`, code: 'FORBIDDEN', details: { permission, reason: 'no_grant' },
    }, ended: false });
  });
}

for (const outcome of [{ ok: true, version: null }, { ok: false, reason: 'not-found' }, { ok: false, reason: 'version-changed' }] as const) {
  test(`L244 deletion: Trash outcome ${JSON.stringify(outcome)} keeps its HTTP contract`, async () => {
    const { deps } = fixture(() => {});
    const { definition } = await createFormDefinition({ deps: { ...deps, repo: deps.formDefinitionRepo }, input: {
      workspaceId: WS, actor: { id: 'owner', kind: 'user' }, name: 'Contact', slug: 'contact', fields,
    } });
    let removal: unknown;
    const result = await invoke({ register: registerAdminFormsDeleteSubmissionRoute, deps: { ...deps,
      clock: { nowMs: () => 0 },
      formSubmissionRepo: { ...deps.formSubmissionRepo, findById: async () => ({
        id: 'sub', workspaceId: WS, formDefinitionId: definition.id, data: {}, sourceIp: '', submittedAt: '2026-10-20T00:00:00.000Z',
      }) },
      removeFormSubmission: async (input) => { removal = input; return outcome; },
    }, params: { workspaceId: WS, formId: 'contact', submissionId: 'sub' } });
    assert.deepEqual(removal, { workspaceId: WS, id: 'sub', display: { title: 'Contact', subtitle: '2026-10-20T00:00:00.000Z' },
      at: '1970-01-01T00:00:00.000Z', expectedVersion: null, actor: { principalId: 'owner', pluginId: null } });
    if (outcome.ok) assert.deepEqual(result, { status: 204, body: undefined, ended: true });
    else assert.deepEqual(result, { status: outcome.reason === 'not-found' ? 404 : 409, ended: false, body: outcome.reason === 'not-found'
      ? { error: "submission 'sub' was not found", code: 'FORMS_SUBMISSION_NOT_FOUND' }
      : { error: "submission 'sub' changed while it was being deleted", code: 'TRASH_VERSION_CHANGED' } });
  });
}

test('L244 authoring: HTML mode and HTML content persist through the existing authoring owner', async () => {
  const { deps } = fixture(() => {});
  const { definition } = await createFormDefinition({ deps: { ...deps, repo: deps.formDefinitionRepo }, input: {
    workspaceId: WS, actor: { id: 'owner', kind: 'user' }, name: 'Contact', slug: 'contact', fields,
  } });
  const html = '<label>Message<input name="message"></label>';
  const result = await invoke({ register: registerAdminFormsAuthoringRoute, deps,
    params: { workspaceId: WS, formId: definition.id }, body: { mode: 'html', html } });
  assert.equal(result.status, 200);
  const data = (result.body as { data: { mode: string; html: string } }).data;
  assert.equal(data.mode, 'html');
  assert.ok(data.html.includes('name="message"'));
});

for (const register of [registerAdminFormsAuthoringRoute, registerAdminFormsDeleteSubmissionRoute]) {
  test(`L244 ${register.name}: thrown authorization is a private internal error`, async () => {
    const { deps } = fixture(() => {});
    const result = await invoke({ register, deps: { ...deps, authorize: async () => { throw new Error('private'); } },
      params: { workspaceId: WS, formId: 'form', submissionId: 'sub' } });
    assert.deepEqual(result, { status: 500, body: { error: 'internal error', code: 'INTERNAL_ERROR' }, ended: false });
  });
}
