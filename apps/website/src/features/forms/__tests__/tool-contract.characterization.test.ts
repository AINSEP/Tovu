/**
 * @file Characterization of the Forms agent-tool contract, built THROUGH THE HOST CONTRIBUTOR
 * (`contributeFormsTools().build(deps)`), so it pins what the assistant's composition root receives
 * regardless of where the catalog and handlers live. It must stay green, unedited, across the seam
 * and the move of the catalog and handlers into `@jini-ai/cms/forms`.
 *
 * Pinned: registration ids and their order, every descriptor against a committed golden (metadata
 * included), the derived-risk map, the per-tool permission refusal, one success view per tool, and
 * the policy the three definition writes carry through the host's wrappers: the reserved-slug
 * wording, the authoring authorization, the notify / idempotency / outbox pass-through, the stale
 * version conflict, the duplicate handler's name derivation and the delivery-status limit.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { DELIVERY_STATUS_MAX_LIMIT, FormFieldValidationError, InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo, type FieldDescriptor, type FormSubmissionRecord } from "@jini-ai/cms/forms";

import { executeCommand, InMemoryChangeSetRepo } from "../../../contracts/core/commands/index.js";
import { createFormDefinition } from "../index.js";
import { contributeFormsDuplicateHandlers, contributeFormsTools, type FormsToolDeps } from "../tool-registrations.js";

const WORKSPACE_ID = "ws-forms-contract";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-11-17T00:00:00.000Z";

const TOOL_IDS = [
  "forms_list_providers",
  "forms_list_definitions",
  "forms_create_definition",
  "forms_update_definition",
  "forms_set_definition_status",
  "forms_list_submissions",
  "forms_get_submission",
  "forms_delivery_status",
  "forms_pull_submissions",
] as const;

const DERIVED_RISK: ReadonlyArray<readonly [string, string]> = [
  ["forms_list_definitions", "none"],
  ["forms_list_providers", "none"],
  ["forms_create_definition", "mutates-durable-state"],
  ["forms_update_definition", "mutates-durable-state"],
  ["forms_set_definition_status", "mutates-durable-state"],
  ["forms_list_submissions", "none"],
  ["forms_get_submission", "none"],
  ["forms_pull_submissions", "mutates-durable-state"],
  ["forms_delivery_status", "none"],
];

const GOLDEN = JSON.parse(readFileSync(new URL("./tool-contract.characterization.golden.json", import.meta.url), "utf8")) as Record<string, unknown>;

interface Fixture {
  deps: FormsToolDeps;
  repo: InMemoryFormDefinitionRepo;
  submissions: InMemoryFormSubmissionRepo;
  allow: { value: boolean };
  commands: unknown[];
  outbox: unknown[];
}

async function makeFixture(): Promise<Fixture> {
  let counter = 0;
  const repo = new InMemoryFormDefinitionRepo();
  const submissions = new InMemoryFormSubmissionRepo();
  const allow = { value: true };
  const commands: unknown[] = [];
  const outbox: unknown[] = [];
  const deps: FormsToolDeps = {
    workspaceId: WORKSPACE_ID,
    executeCommand: ((...args: Parameters<typeof executeCommand>) => { commands.push(args[0]); return executeCommand(...args); }) as typeof executeCommand,
    clock: { nowMs: () => Date.parse(NOW) },
    idGen: { newId: () => `id-${++counter}` },
    authorize: async () => (allow.value ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
    changeSets: new InMemoryChangeSetRepo(),
    formDefinitionRepo: repo,
    formSubmissionRepo: submissions,
    outbox: { enqueue: async (event: unknown) => { outbox.push(event); }, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} } as FormsToolDeps["outbox"],
    formDeliveryStatus: {
      forSubmission: async ({ submissionId }) => [{ bindingId: "b1", adapterId: "a1", formId: "form-1", submissionId, status: "pending", attempts: 0, nextRetryAt: null, errorCode: null } as never],
      recentUnfinished: async () => [],
    },
    formSubmissionsPull: { pull: async () => ({ ran: true, message: "pulled", destinations: [], forms: [], totals: { imported: 0, alreadyImported: 0, unmapped: 0, failed: 0 } }) },
  };
  return { deps, repo, submissions, allow, commands, outbox };
}

function build(deps: FormsToolDeps): ToolRegistration[] {
  return contributeFormsTools().build(deps, undefined);
}

function ctx(input: unknown): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function caller(registrations: ToolRegistration[]) {
  return (id: string, input: unknown): Promise<unknown> => {
    const found = registrations.find((registration) => registration.descriptor.id === id);
    assert.ok(found, `expected '${id}' to be wired`);
    return Promise.resolve(found.handler(ctx(input)));
  };
}

const FIELDS: FieldDescriptor[] = [{ id: "email", type: "email", label: "Email", required: true }];
const NOTIFY = { enabled: true, recipients: ["owner@example.test"] };

test("(a) registration ids, in order, are the nine forms tools", async () => {
  assert.deepEqual(build((await makeFixture()).deps).map((registration) => registration.descriptor.id), [...TOOL_IDS]);
});

test("(b) every descriptor equals the committed golden, metadata included", async () => {
  for (const registration of build((await makeFixture()).deps)) {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(registration.descriptor)), GOLDEN[registration.descriptor.id], registration.descriptor.id);
  }
  assert.deepEqual(Object.keys(GOLDEN), [...TOOL_IDS]);
});

test("(c) the contributor's derived-risk map is the nine authored entries", () => {
  assert.deepEqual([...contributeFormsTools().risk.entries()], DERIVED_RISK.map(([id, risk]) => [id, risk]));
});

const REFUSAL: Record<(typeof TOOL_IDS)[number], { input: unknown; permission: string }> = {
  forms_list_providers: { input: {}, permission: "admin.forms.manage" },
  forms_list_definitions: { input: {}, permission: "admin.forms.manage" },
  forms_create_definition: { input: { name: "N", slug: "n", fields: FIELDS }, permission: "admin.forms.manage" },
  forms_update_definition: { input: { formId: "form-1", expectedVersion: 1, name: "N2" }, permission: "admin.forms.manage" },
  forms_set_definition_status: { input: { formId: "form-1", status: "disabled" }, permission: "admin.forms.manage" },
  forms_list_submissions: { input: { formId: "form-1" }, permission: "admin.forms.submissions.read" },
  forms_get_submission: { input: { formId: "form-1", submissionId: "s-1" }, permission: "admin.forms.submissions.read" },
  forms_delivery_status: { input: {}, permission: "admin.forms.submissions.read" },
  forms_pull_submissions: { input: {}, permission: "admin.forms.manage" },
};

async function seedForm(fixture: Fixture): Promise<void> {
  const call = caller(build(fixture.deps));
  const created = (await call("forms_create_definition", { name: "Contact", slug: "contact", fields: FIELDS, notify: NOTIFY })) as { definition: { id: string } };
  assert.equal(created.definition.id, "id-1");
  fixture.commands.length = 0;
  fixture.outbox.length = 0;
}

for (const toolId of TOOL_IDS) {
  test(`(d)/(g) ${toolId}: a principal without the permission is refused with the same error and nothing changes`, async () => {
    const fixture = await makeFixture();
    await seedForm(fixture);
    const before = JSON.stringify(await fixture.repo.list({ workspaceId: WORKSPACE_ID }));
    fixture.allow.value = false;
    const outcome = await caller(build(fixture.deps))(toolId, REFUSAL[toolId].input).then(() => null, (error: unknown) => error);
    assert.ok(outcome instanceof ToolInputError, `got ${(outcome as Error)?.constructor?.name}: ${(outcome as Error)?.message}`);
    assert.match(outcome.message, /^FORMS_FORBIDDEN: /);
    assert.ok(outcome.message.includes(REFUSAL[toolId].permission), outcome.message);
    assert.equal(JSON.stringify(await fixture.repo.list({ workspaceId: WORKSPACE_ID })), before);
    assert.deepEqual(fixture.outbox, []);
  });
}

test("(e) one success call per tool returns the model-facing view", async () => {
  const fixture = await makeFixture();
  const call = caller(build(fixture.deps));
  const view = (over: Record<string, unknown>) => ({ id: "id-1", name: "Contact", slug: "contact", status: "active", version: 1, fields: FIELDS, notify: NOTIFY, ...over });
  const created = (await call("forms_create_definition", { name: "Contact", slug: "contact", fields: FIELDS, notify: NOTIFY })) as { definition: Record<string, unknown> };
  assert.equal(created.definition.id, "id-1");
  assert.equal(created.definition.slug, "contact");
  assert.equal(created.definition.version, 1);
  assert.deepEqual(await call("forms_list_definitions", {}), { definitions: [created.definition] });
  assert.deepEqual(created.definition, view({ fields: created.definition.fields, notify: created.definition.notify, ...(created.definition.provider ? { provider: created.definition.provider } : {}) }));
  const updated = (await call("forms_update_definition", { formId: "id-1", expectedVersion: 1, name: "Contact us" })) as { definition: Record<string, unknown> };
  assert.deepEqual([updated.definition.name, updated.definition.version, updated.definition.slug], ["Contact us", 2, "contact"]);
  const disabled = (await call("forms_set_definition_status", { formId: "id-1", status: "disabled" })) as { definition: Record<string, unknown> };
  assert.equal(disabled.definition.status, "disabled");
  const submission: FormSubmissionRecord = { id: "s-1", workspaceId: WORKSPACE_ID, formDefinitionId: "id-1", data: { email: "a@example.test" }, sourceIp: "203.0.113.9", submittedAt: NOW } as FormSubmissionRecord;
  await fixture.submissions.create(submission);
  assert.deepEqual(await call("forms_list_submissions", { formId: "id-1" }), { submissions: [{ id: "s-1", formDefinitionId: "id-1", data: { email: "a@example.test" }, sourceIp: "203.0.113.9", submittedAt: NOW }], nextCursor: null });
  assert.deepEqual(await call("forms_get_submission", { formId: "id-1", submissionId: "s-1" }), { submission: { id: "s-1", formDefinitionId: "id-1", data: { email: "a@example.test" }, sourceIp: "203.0.113.9", submittedAt: NOW } });
  assert.deepEqual(await call("forms_delivery_status", { submissionId: "s-1" }), { deliveries: [{ bindingId: "b1", adapterId: "a1", formId: "form-1", submissionId: "s-1", status: "pending", attempts: 0, nextRetryAt: null, errorCode: null }] });
  assert.deepEqual(await call("forms_pull_submissions", {}), { ran: true, message: "pulled", destinations: [], forms: [], totals: { imported: 0, alreadyImported: 0, unmapped: 0, failed: 0 } });
  const providers = (await call("forms_list_providers", {})) as { providers: unknown };
  assert.ok(Array.isArray(providers.providers));
});

const ACTOR = { id: PRINCIPAL_ID, kind: "agent" as const };

/** The write-service deps bag the host wrappers take, over the same fakes the tools run on. */
function writeDeps({ deps }: Fixture) {
  return { executeCommand: deps.executeCommand, repo: deps.formDefinitionRepo, clock: deps.clock, idGen: deps.idGen, changeSets: deps.changeSets, outbox: deps.outbox, authorize: deps.authorize };
}

test("(f) create with a reserved slug: the tool refuses it, and the wrapper words the slug reason for the admin editor", async () => {
  const fixture = await makeFixture();
  await assert.rejects(caller(build(fixture.deps))("forms_create_definition", { name: "New", slug: "new", fields: FIELDS }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError, `got ${(error as Error)?.constructor?.name}`);
    assert.ok(error.message.startsWith("slug 'new' is reserved."), error.message.slice(0, 120));
    return true;
  });
  await assert.rejects(
    createFormDefinition({ deps: writeDeps(fixture), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, name: "New", slug: "new", fields: FIELDS } }),
    (error: unknown) => {
      assert.ok(error instanceof FormFieldValidationError, `got ${(error as Error)?.constructor?.name}`);
      assert.deepEqual(error.fieldErrors.filter((detail) => detail.field === "slug").map((detail) => detail.reason), ["'new' is reserved for the admin editor's own URL"]);
      return true;
    },
  );
  assert.deepEqual(await fixture.repo.list({ workspaceId: WORKSPACE_ID }), []);
});

test("(h) create passes notify and the idempotency key through one audited command and enqueues the same outbox events", async () => {
  const fixture = await makeFixture();
  await createFormDefinition({ deps: writeDeps(fixture), input: { workspaceId: WORKSPACE_ID, actor: ACTOR, name: "Contact", slug: "contact", fields: FIELDS, notify: NOTIFY, idempotencyKey: "idem-key-1" } });
  assert.equal(fixture.commands.length, 1, "one audited command");
  assert.ok(JSON.stringify(fixture.commands[0]).includes("idem-key-1"), "the idempotency key reaches the command executor");
  assert.deepEqual((await fixture.repo.findById({ workspaceId: WORKSPACE_ID, id: "id-1" }))?.notify, NOTIFY);
  assert.deepEqual(fixture.outbox.map((event) => (event as { type?: string }).type), []);
});

test("(i) update with a stale expectedVersion reaches the model as the conflict envelope and enqueues nothing", async () => {
  const fixture = await makeFixture();
  await seedForm(fixture);
  const call = caller(build(fixture.deps));
  await call("forms_update_definition", { formId: "id-1", expectedVersion: 1, name: "First" });
  fixture.outbox.length = 0;
  await assert.rejects(call("forms_update_definition", { formId: "id-1", expectedVersion: 1, name: "Second" }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError, `got ${(error as Error)?.constructor?.name}`);
    assert.match(error.message, /NOT applied/);
    assert.match(error.message, /content_read\.form_definition/);
    return true;
  });
  assert.deepEqual(fixture.outbox, []);
  assert.equal((await fixture.repo.findById({ workspaceId: WORKSPACE_ID, id: "id-1" }))?.name, "First");
});

test("(j) duplicate picks the next free name and slug, copies a disabled source as disabled, and leaves the repo untouched on a refusal", async () => {
  const fixture = await makeFixture();
  await seedForm(fixture);
  const call = caller(build(fixture.deps));
  const [contributor] = contributeFormsDuplicateHandlers();
  assert.ok(contributor);
  const handler = contributor.build(fixture.deps);
  const first = (await handler.duplicate({ principalId: PRINCIPAL_ID, id: "id-1", overrides: {} })) as { definition: { name: string; slug: string } };
  assert.deepEqual([first.definition.name, first.definition.slug], ["Contact 2", "contact-2"]);
  const second = (await handler.duplicate({ principalId: PRINCIPAL_ID, id: "id-1", overrides: {} })) as { definition: { name: string; slug: string } };
  assert.deepEqual([second.definition.name, second.definition.slug], ["Contact 3", "contact-3"]);
  await call("forms_set_definition_status", { formId: "id-1", status: "disabled" });
  const copy = (await handler.duplicate({ principalId: PRINCIPAL_ID, id: "id-1", overrides: { title: "Archive" } })) as { definition: { status: string; slug: string } };
  assert.deepEqual([copy.definition.status, copy.definition.slug], ["disabled", "archive"]);
  const countBefore = (await fixture.repo.list({ workspaceId: WORKSPACE_ID })).length;
  await assert.rejects(handler.duplicate({ principalId: PRINCIPAL_ID, id: "id-1", overrides: { status: "published" } }), /does not support the 'status' override/);
  await assert.rejects(handler.duplicate({ principalId: PRINCIPAL_ID, id: "id-1", overrides: { slug: "contact" } }));
  await assert.rejects(handler.duplicate({ principalId: PRINCIPAL_ID, id: "missing", overrides: {} }), /was not found/);
  assert.equal((await fixture.repo.list({ workspaceId: WORKSPACE_ID })).length, countBefore);
});

test("(k) the delivery-status limit above the cap is refused with the cap in the message; the cap itself is accepted", async () => {
  const call = caller(build((await makeFixture()).deps));
  await assert.rejects(call("forms_delivery_status", { limit: DELIVERY_STATUS_MAX_LIMIT + 1 }), { message: `'limit' must be an integer between 1 and ${DELIVERY_STATUS_MAX_LIMIT}` });
  await assert.rejects(call("forms_delivery_status", { limit: 0 }), /'limit' must be an integer/);
  assert.deepEqual(await call("forms_delivery_status", { limit: DELIVERY_STATUS_MAX_LIMIT }), { deliveries: [] });
});

test("(l) contributeFormsDuplicateHandlers contributes the 'form' resource gated on admin.forms.manage", async () => {
  const contributors = contributeFormsDuplicateHandlers();
  assert.deepEqual(contributors.map((contributor) => contributor.resource), ["form"]);
  assert.equal(contributors[0]!.build((await makeFixture()).deps).permission, "admin.forms.manage");
});
