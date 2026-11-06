import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createFormCollectionRegistry, InMemoryFormDefinitionRepo, type HtmlFormDefinitionRecord } from '@jini-ai/cms/forms';
import { executeCommand, InMemoryChangeSetRepo } from '#src/contracts/core/commands/index';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { registerAdminFormsCreateRoute } from '../create.js';
import { registerAdminFormsAuthoringRoute } from '../authoring.js';
import { registerAdminFormsUpdateRoute } from '../update.js';
import type { FormsRouteDeps, FormsRouteRegistrar } from '../deps.js';

const WS = 'workspace-local';
const BASE = `/api/admin/v1/workspaces/${WS}`;

function fixture(register: FormsRouteRegistrar, overrides: Partial<FormsRouteDeps>) {
  let serial = 0;
  const deps = {
    workspaceId: WS, executeCommand, authorize: async () => ({ allowed: true, reason: 'fixture' }),
    formDefinitionRepo: new InMemoryFormDefinitionRepo(), changeSets: new InMemoryChangeSetRepo(),
    clock: { nowMs: () => Date.parse('2026-11-05T00:00:00Z') }, idGen: { newId: () => `id-${++serial}` },
    ...overrides,
  } as FormsRouteDeps;
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: 'owner' }; next(); });
  register(app, deps);
  return { app, deps };
}

test('form editor rejects provider settings before creating or replacing a saved definition', async () => {
  const providers = createFormCollectionRegistry({});
  providers.contribute({ pluginId: 'fixture', definition: { id: 'remote', provider: {
    plan: ({ config }) => config.url === 'https://forms.example.test/accepted'
      ? { kind: 'embed', url: config.url, title: 'Remote', capabilities: { answers: 'Remote', validation: 'Remote', spamProtection: 'Remote' } }
      : { kind: 'unavailable', code: 'invalid_configuration', message: 'Enter the public form link supplied by your form provider.' },
  } } });
  const { app, deps } = fixture((app, deps) => {
    registerAdminFormsCreateRoute(app, deps);
    registerAdminFormsAuthoringRoute(app, deps);
    registerAdminFormsUpdateRoute(app, deps);
  }, { formCollectionProviders: () => providers });
  const body = { name: 'Contact', slug: 'contact', fields: [{ id: 'message', type: 'text', label: 'Message', required: false }] };
  const invalid = { id: 'remote', config: { url: 'invalid' } };
  const refused = await dispatchJsonRequest(app, 'POST', `${BASE}/forms`, { ...body, provider: invalid });
  assert.equal(refused.status, 400);
  assert.match((refused.body as { error: string }).error, /Enter the public form link/);
  assert.deepEqual(await deps.formDefinitionRepo.list({ workspaceId: WS }), []);
  const provider = { id: 'remote', config: { url: 'https://forms.example.test/accepted' } };
  const created = await dispatchJsonRequest(app, 'POST', `${BASE}/forms`, { ...body, provider });
  assert.equal(created.status, 201);
  const id = (created.body as { data: { id: string } }).data.id;
  for (const suffix of ['', '/authoring']) {
    const updated = await dispatchJsonRequest(app, 'PUT', `${BASE}/forms/${id}${suffix}`, { provider: invalid });
    assert.equal(updated.status, 400);
    assert.match((updated.body as { error: string }).error, /Enter the public form link/);
    assert.deepEqual((await deps.formDefinitionRepo.findById({ workspaceId: WS, id }) as HtmlFormDefinitionRecord)?.provider, provider);
  }
});
