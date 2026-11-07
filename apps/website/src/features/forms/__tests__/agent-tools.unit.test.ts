import assert from "node:assert/strict";
import test from "node:test";
import { formsAgentToolCatalog } from "../agent-tools.js";

test("forms_create_definition explains rich-text widget insertion and the HTML form marker alternative", () => {
  const tool = formsAgentToolCatalog.find(({ name }) => name === "forms_create_definition");
  assert.ok(tool);
  assert.match(tool.description, /post or other rich-text body.*widgets_create_instance.*contact-form.*config \{ formDefinitionId: <this form's id> \}.*then widgets_insert_embed/);
  assert.match(tool.description, /HTML-format pages and theme templates.*data-embed-config.*\{type:"form"/);
});

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";
import { executeCommand, InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { createFormCollectionRegistry, InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo, type FormAuthoring } from "@jini-ai/cms/forms";
import { buildFormsRegistrations, type FormsToolDeps } from "../tool-registrations.js";

function providerFixture({ allow = true }: { allow?: boolean } = {}) {
  const providers = createFormCollectionRegistry({});
  for (const id of ['example_one', 'example_two', 'fourth_provider']) providers.contribute({ pluginId: id, definition: { id, provider: {
    describe: () => ({ label: id, fields: [{ key: 'public_url', label: 'Public URL', type: 'url' as const }], answers: 'Remote inbox', validation: 'Remote validation', frameOrigins: [] }),
    plan: ({ config }) => ({ kind: 'post' as const, action: config.public_url!, external: true,
      capabilities: { answers: 'Remote inbox', validation: 'Remote validation', spamProtection: 'Remote spam protection' } }),
  } } });
  let id = 0;
  const deps: FormsToolDeps = {
    workspaceId: 'ws', executeCommand, clock: { nowMs: () => 1000 }, idGen: { newId: () => `id-${++id}` },
    authorize: async () => ({ allowed: allow, reason: 'fixture' }), changeSets: new InMemoryChangeSetRepo(),
    formDefinitionRepo: new InMemoryFormDefinitionRepo(), formSubmissionRepo: new InMemoryFormSubmissionRepo(), formCollectionProviders: () => providers,
    outbox: { enqueue: async () => {}, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} },
  };
  return { deps, providers };
}

async function providerHarness(deps: FormsToolDeps) {
  const registry = createToolRegistry({});
  for (const registration of buildFormsRegistrations(deps)) registry.register(registration);
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: 'provider-discovery' });
  let callId = 0;
  return (toolId: string, input: unknown = {}) => delegatedToolExecuteRoute.handle({ input: { runId: run.id, toolUseId: `call-${++callId}`, toolId, input }, deps: { lifecycle, toolExecutor, resolvePrincipal: () => ({ id: 'owner' }) } });
}

test('assistant discovers a fourth provider and saves its public configuration without vendor schema edits', async () => {
  const { deps } = providerFixture();
  const call = await providerHarness(deps);
  const listed = await call('forms_list_providers');
  assert.equal(listed.ok, true);
  assert.match(JSON.stringify(listed), /fourth_provider/);
  assert.match(JSON.stringify(listed), /public_url/);
  const selected = { id: 'fourth_provider', config: { public_url: 'https://example.test/public' } };
  const created = await call('forms_create_definition', { name: 'Contact', slug: 'contact', fields: [{ id: 'name', label: 'Name', type: 'text', required: false }], provider: selected });
  assert.equal(created.ok, true, JSON.stringify(created));
  const definition = (await deps.formDefinitionRepo.list({ workspaceId: 'ws' }))[0]!;
  assert.deepEqual((definition as typeof definition & FormAuthoring).provider, selected);
  const rejected = await call('forms_update_definition', { formId: definition.id, provider: { id: 'fourth_provider', config: { ...selected.config, apiKey: 'private' } } });
  assert.ok(!rejected.ok, JSON.stringify(rejected));
  assert.match(rejected.error.message, /Form provider configuration contains a secret or a non-text value/);
  const unchanged = (await deps.formDefinitionRepo.list({ workspaceId: 'ws' }))[0]!;
  assert.deepEqual((unchanged as typeof unchanged & FormAuthoring).provider, selected);
});

test('provider discovery enforces forms management permission', async () => {
  const { deps } = providerFixture({ allow: false });
  const call = await providerHarness(deps);
  const denied = await call('forms_list_providers');
  assert.equal(denied.ok, false);
  assert.match(JSON.stringify(denied), /FORMS_FORBIDDEN|not authorized|FORBIDDEN/);
});
