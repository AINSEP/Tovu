import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";
import { executeCommand, InMemoryChangeSetRepo } from "../../../contracts/core/commands/index.js";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "@jini-ai/cms/forms";
import { buildFormsRegistrations, type FormsToolDeps } from "../tool-registrations.js";
import { submitForm } from "../index.js";
import { InMemoryEventBus } from "../../../contracts/core/events/index.js";

test("assistant tools create/edit a dropdown with options and persist only declared submissions", async () => {
  let id = 0;
  const deps: FormsToolDeps = {
    workspaceId: "ws", executeCommand, clock: { nowMs: () => 1000 }, idGen: { newId: () => `id-${++id}` },
    authorize: async () => ({ allowed: true, reason: "owner" }), changeSets: new InMemoryChangeSetRepo(),
    formDefinitionRepo: new InMemoryFormDefinitionRepo(), formSubmissionRepo: new InMemoryFormSubmissionRepo(),
    outbox: { enqueue: async () => {}, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} },
  };
  const registry = createToolRegistry({});
  for (const registration of buildFormsRegistrations(deps)) registry.register(registration);
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "formsfields" });
  let callId = 0;
  const call = (toolId: string, input: unknown) => delegatedToolExecuteRoute.handle({ input: { runId: run.id, toolUseId: `call-${++callId}`, toolId, input }, deps: { lifecycle, toolExecutor, resolvePrincipal: () => ({ id: "owner" }) } });
  const field = { id: "topic", label: "Topic", type: "select", required: true, options: [{ value: "sales", label: "Sales" }] };
  const created = await call("forms_create_definition", { name: "Contact", slug: "contact", fields: [field] });
  assert.equal(created.ok, true);
  const definition = (await deps.formDefinitionRepo.list({ workspaceId: "ws" }))[0]!;
  assert.equal(definition.fields[0]!.type, "select");
  const updated = await call("forms_update_definition", { formId: definition.id, fields: [{ ...field, options: [...field.options, { value: "help", label: "Help" }], helpText: "Pick a topic" }] });
  assert.equal(updated.ok, true);
  const submitDeps = { definitionRepo: deps.formDefinitionRepo, submissionRepo: deps.formSubmissionRepo, clock: deps.clock, idGen: deps.idGen, outbox: deps.outbox, bus: new InMemoryEventBus(), rateLimiter: { check: async () => ({ allowed: true as const }) } };
  const input = { workspaceId: "ws", slug: "contact", sourceIp: "127.0.0.1", body: { topic: "help" } };
  await submitForm({ deps: submitDeps, input });
  await assert.rejects(submitForm({ deps: submitDeps, input: { ...input, body: { topic: "unknown" } } }));
  const page = await deps.formSubmissionRepo.listByDefinition({ workspaceId: "ws", formDefinitionId: definition.id, limit: 10 });
  assert.deepEqual(page.items.map((row) => row.data), [{ topic: "help" }]);
});
