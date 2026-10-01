import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { buildAssistantToolRegistrations } from "../../tool-registrations.js";
import { installFirstPartyToolContributors } from "../../../server/runtime/composition/tool-catalog-manifest.js";
import type { FieldDescriptor } from "../../../features/forms/types.js";

// Forms moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, Stage 2), then self-registration on import was removed
// entirely (2026-08-27, "invert AI-tool contribution registration") — nothing puts forms tools into
// the registry now unless something explicitly installs them first, mirroring what the real
// composition roots do via `installFirstPartyToolContributors()`.
installFirstPartyToolContributors();

/**
 * @file Canary: proves `forms_create_definition` -> `forms_set_definition_status` actually work
 * through the REAL dispatch path the AI Assistant uses in production — `ToolRegistry.register()` +
 * `@jini-ai/daemon`'s `ToolExecutor.execute()` (`agent-daemon-server.ts:128-130,202`) — not just the
 * domain handler called directly, which is what every other `tool-registrations.*.test.ts` in this
 * repo does. Forms has zero existing wiring-level test coverage of any kind before this file.
 *
 * "Delete" here means `forms_set_definition_status({status: "disabled"})`, forms' actual retirement
 * lever — INV-08 (`forms/agent-tools.ts`) means there is deliberately no hard-delete tool to call.
 */

async function buildRealExecutor() {
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;

  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations(routeDeps)) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  const ownerPrincipal = { id: await routeDeps.ownerPrincipalId };

  return { routeDeps, toolExecutor, ownerPrincipal };
}

test("forms_create_definition -> forms_set_definition_status through the real ToolExecutor", async () => {
  const { routeDeps, toolExecutor, ownerPrincipal } = await buildRealExecutor();
  const run = { id: "run-canary-forms" };

  const createResult = await toolExecutor.execute(ownerPrincipal, run, "forms_create_definition", {
    name: "Canary Contact Form",
    slug: "canary-contact-form",
    fields: [{ id: "email", label: "Email", type: "email", required: true }],
  });

  assert.equal(createResult.status, "completed", `create should succeed, got: ${JSON.stringify(createResult)}`);
  const created = (createResult.output as { definition: { id: string; slug: string; status: string; fields: FieldDescriptor[] } }).definition;
  assert.equal(created.slug, "canary-contact-form");
  assert.equal(created.status, "active");

  // Observe: read back via the repo directly, independent of what the tool claims it did.
  const persistedAfterCreate = await routeDeps.formDefinitionRepo.findById({
    workspaceId: routeDeps.workspaceId,
    id: created.id,
  });
  assert.ok(persistedAfterCreate, "the created form must actually be persisted, not just echoed back");
  assert.equal(persistedAfterCreate?.slug, "canary-contact-form");
  assert.equal(persistedAfterCreate?.fields.length, 1);
  assert.equal(persistedAfterCreate?.fields[0]?.id, "email");
  const expectedField = { id: "email", label: "Email", type: "email", required: true };
  for (const field of [persistedAfterCreate.fields[0], created.fields[0]]) {
    assert.deepEqual({ id: field.id, label: field.label, type: field.type, required: field.required }, expectedField);
  }

  // "Delete": forms' real retirement lever, since no hard-delete tool exists (INV-08).
  const disableResult = await toolExecutor.execute(ownerPrincipal, run, "forms_set_definition_status", {
    formId: created.id,
    status: "disabled",
  });
  assert.equal(disableResult.status, "completed", `disable should succeed, got: ${JSON.stringify(disableResult)}`);

  const persistedAfterDisable = await routeDeps.formDefinitionRepo.findById({
    workspaceId: routeDeps.workspaceId,
    id: created.id,
  });
  assert.equal(persistedAfterDisable?.status, "disabled", "the retirement must actually be persisted");
});

test("forms_create_definition through the real ToolExecutor refuses a principal with no grants", async () => {
  const { routeDeps, toolExecutor } = await buildRealExecutor();
  const run = { id: "run-canary-forms-denied" };

  await routeDeps.principalRepo.save({
    id: "bare-principal-forms-canary",
    workspaceId: routeDeps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: routeDeps.clock.nowIso(),
  });

  const result = await toolExecutor.execute({ id: "bare-principal-forms-canary" }, run, "forms_create_definition", {
    name: "Should Not Be Created",
    slug: "should-not-be-created",
    fields: [{ id: "email", label: "Email", type: "email", required: true }],
  });

  assert.equal(result.status, "failed", `an unauthorized principal must not succeed, got: ${JSON.stringify(result)}`);
  assert.match(result.error ?? "", /principal 'bare-principal-forms-canary' is not authorized for 'admin\.forms\.manage'/);

  const listed = await routeDeps.formDefinitionRepo.findBySlug({
    workspaceId: routeDeps.workspaceId,
    slug: "should-not-be-created",
  });
  assert.equal(listed, null, "a denied call must leave the database untouched");
});

test("content_read.form_definition resolves a form by name to its id, closing the loop forms_set_definition_status needs", async () => {
  const { routeDeps, toolExecutor, ownerPrincipal } = await buildRealExecutor();
  const run = { id: "run-canary-forms-list" };

  const createResult = await toolExecutor.execute(ownerPrincipal, run, "forms_create_definition", {
    name: "Lookup Target Form",
    slug: "lookup-target-form",
    fields: [{ id: "email", label: "Email", type: "email", required: true }],
  });
  assert.equal(createResult.status, "completed");
  const created = (createResult.output as { definition: { id: string } }).definition;

  const listResult = await toolExecutor.execute(ownerPrincipal, run, "content_read.form_definition", {});
  assert.equal(listResult.status, "completed", `list should succeed, got: ${JSON.stringify(listResult)}`);
  const definitions = (listResult.output as { definitions: { id: string; name: string; slug: string; status: string }[] }).definitions;
  const found = definitions.find((d) => d.name === "Lookup Target Form");
  assert.ok(found, "the just-created form must appear in the list — this is the lookup path that was missing");
  assert.equal(found?.id, created.id, "the list must resolve to the SAME id the create call returned");
  assert.equal(found?.name, "Lookup Target Form");
  assert.equal(found?.status, "active");

  // Prove the resolved id is actually usable — the whole point of the lookup — by retiring it
  // without ever having been told the id directly, only the name.
  const disableResult = await toolExecutor.execute(ownerPrincipal, run, "forms_set_definition_status", {
    formId: found.id,
    status: "disabled",
  });
  assert.equal(disableResult.status, "completed");
  const disabled = await routeDeps.formDefinitionRepo.findById({ workspaceId: routeDeps.workspaceId, id: found.id });
  assert.equal(disabled?.status, "disabled", "retiring the id resolved by name must persist");
});

test("content_read.form_definition through the real ToolExecutor refuses a principal with no grants", async () => {
  const { routeDeps, toolExecutor } = await buildRealExecutor();
  const run = { id: "run-canary-forms-list-denied" };

  await routeDeps.principalRepo.save({
    id: "bare-principal-forms-list-canary",
    workspaceId: routeDeps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: routeDeps.clock.nowIso(),
  });

  const before = await routeDeps.formDefinitionRepo.list({ workspaceId: routeDeps.workspaceId });
  const result = await toolExecutor.execute({ id: "bare-principal-forms-list-canary" }, run, "content_read.form_definition", {});
  assert.equal(result.status, "failed", `an unauthorized principal must not succeed, got: ${JSON.stringify(result)}`);
  assert.match(result.error ?? "", /principal 'bare-principal-forms-list-canary' is not authorized for 'admin\.forms\.manage'/);
  assert.deepEqual(await routeDeps.formDefinitionRepo.list({ workspaceId: routeDeps.workspaceId }), before);
});

test("a submissions-only grant does not authorize creating or reading form definitions", async () => {
  const { routeDeps, toolExecutor } = await buildRealExecutor();
  const workspaceId = routeDeps.workspaceId;
  const principalId = "forms-submissions-reader";
  const policyId = "forms-submissions-only-policy";
  await routeDeps.principalRepo.save({ id: principalId, workspaceId, kind: "user", displayName: "Submissions reader", status: "active", createdAt: routeDeps.clock.nowIso() });
  await routeDeps.policyRepo.save({ id: policyId, workspaceId, name: "Submissions only", isBuiltin: false, isFrozen: false });
  await routeDeps.policyPermissionRepo.save({ id: "forms-submissions-read-grant", workspaceId, policyId, permission: "admin.forms.submissions.read", resourceType: null, constraintJson: null });
  await routeDeps.principalPolicyRepo.save({ id: "forms-submissions-reader-binding", workspaceId, principalId, policyId });
  assert.equal((await routeDeps.authorize({ workspaceId, principalId, permission: "admin.forms.submissions.read", entityType: "form_submission" })).allowed, true);
  const before = await routeDeps.formDefinitionRepo.list({ workspaceId });
  for (const [toolId, input] of [
    ["forms_create_definition", { name: "Refused", slug: "refused", fields: [{ id: "email", label: "Email", type: "email", required: true }] }],
    ["content_read.form_definition", {}],
  ] as const) {
    const result = await toolExecutor.execute({ id: principalId }, { id: "run-narrow-forms" }, toolId, input);
    assert.equal(result.status, "failed", toolId);
    assert.match(result.error ?? "", /principal 'forms-submissions-reader' is not authorized for 'admin\.forms\.manage'/, toolId);
  }
  assert.deepEqual(await routeDeps.formDefinitionRepo.list({ workspaceId }), before);
});

test("forms_list_submissions accepts the default and both explicit limit boundaries through ToolExecutor", async () => {
  const { routeDeps, toolExecutor, ownerPrincipal } = await buildRealExecutor();
  const run = { id: "run-submissions-success" };
  const created = await toolExecutor.execute(ownerPrincipal, run, "forms_create_definition", {
    name: "Submissions", slug: "submissions", fields: [{ id: "email", label: "Email", type: "email", required: true }],
  });
  assert.equal(created.status, "completed");
  const formId = (created.output as { definition: { id: string } }).definition.id;
  const records = ["older", "newer"].map((id, index) => ({
    id, workspaceId: routeDeps.workspaceId, formDefinitionId: formId,
    data: { email: `${id}@example.com` }, sourceIp: "127.0.0.1", submittedAt: `2026-09-0${index + 1}T00:00:00.000Z`,
  }));
  for (const record of records) await routeDeps.formSubmissionRepo.create(record);
  for (const limit of [undefined, 1, 100]) {
    const result = await toolExecutor.execute(ownerPrincipal, run, "forms_list_submissions", { formId, ...(limit === undefined ? {} : { limit }) });
    assert.equal(result.status, "completed", JSON.stringify(result));
    const submissions = (result.output as { submissions: unknown[] }).submissions;
    const expected = (limit === 1 ? [records[1]] : [records[1], records[0]]).map(({ workspaceId: _workspaceId, ...record }) => record);
    assert.deepEqual(submissions, expected);
  }
});

test("forms_update_definition persists name, fields and notify while preserving the slug", async () => {
  const { routeDeps, toolExecutor, ownerPrincipal } = await buildRealExecutor();
  const run = { id: "run-forms-update" };
  const created = await toolExecutor.execute(ownerPrincipal, run, "forms_create_definition", {
    name: "Before", slug: "unchanged-slug", fields: [{ id: "email", label: "Email", type: "email", required: true }],
  });
  assert.equal(created.status, "completed");
  const formId = (created.output as { definition: { id: string } }).definition.id;
  const fields = [{ id: "email", label: "Contact email", type: "email", required: false }, { id: "message", label: "Message", type: "textarea", required: true }];
  const notify = { enabled: true, recipients: ["notify@example.com"] };
  const result = await toolExecutor.execute(ownerPrincipal, run, "forms_update_definition", { formId, name: "After", fields, notify });
  assert.equal(result.status, "completed", JSON.stringify(result));
  const persisted = await routeDeps.formDefinitionRepo.findById({ workspaceId: routeDeps.workspaceId, id: formId });
  assert.ok(persisted);
  assert.equal(persisted.name, "After");
  assert.equal(persisted.slug, "unchanged-slug");
  assert.deepEqual(persisted.fields.map(({ id, label, type, required }) => ({ id, label, type, required })), fields);
  assert.deepEqual(persisted.notify, notify);
});

/**
 * A bad input the model can fix must come back as `errorKind: 'validation'`. `ToolExecutor` tags only
 * a `ToolInputError` that way; anything else is `'internal'`, which the HTTP layer redacts to a
 * message-less 500, so the model never learns which field to change. These three ad-hoc validators
 * in `features/forms/tool-registrations.ts` used to throw a bare `Error`. One row per validator, so
 * a regression names the tool that broke.
 */
const INPUT_REJECTIONS: ReadonlyArray<{ toolId: string; input: (formId: string) => Record<string, unknown>; message: RegExp; schemaAttached: boolean }> = [
  { toolId: "forms_list_submissions", input: (formId) => ({ formId, limit: 500 }), message: /'limit' must be an integer between 1 and 100/, schemaAttached: false },
  { toolId: "forms_list_submissions", input: (formId) => ({ formId, limit: 0 }), message: /'limit' must be an integer between 1 and 100/, schemaAttached: false },
  { toolId: "forms_list_submissions", input: (formId) => ({ formId, limit: 1.5 }), message: /'limit' must be an integer between 1 and 100/, schemaAttached: false },
  { toolId: "forms_set_definition_status", input: (formId) => ({ formId, status: "archived" }), message: /'status' must be exactly 'active' or 'disabled'/, schemaAttached: true },
  { toolId: "forms_update_definition", input: (formId) => ({ formId }), message: /at least one of 'name', 'fields', or 'notify' is required/, schemaAttached: true },
];

for (const row of INPUT_REJECTIONS) {
  test(`${row.toolId}: a fixable input rejection reaches the model as errorKind 'validation', not a redacted internal failure`, async () => {
    const { toolExecutor, ownerPrincipal } = await buildRealExecutor();
    const run = { id: `run-canary-${row.toolId}-validation` };

    const created = await toolExecutor.execute(ownerPrincipal, run, "forms_create_definition", {
      name: `Validation Target ${row.toolId}`,
      slug: `validation-target-${row.toolId.replaceAll("_", "-")}`,
      fields: [{ id: "email", label: "Email", type: "email", required: true }],
    });
    assert.equal(created.status, "completed", `seed create must succeed: ${JSON.stringify(created)}`);
    const formId = (created.output as { definition: { id: string } }).definition.id;

    const result = await toolExecutor.execute(ownerPrincipal, run, row.toolId, row.input(formId));

    assert.equal(result.status, "failed");
    assert.equal(result.errorKind, "validation", `got: ${JSON.stringify(result)}`);
    assert.match(result.error ?? "", row.message);
    if (row.schemaAttached) {
      assert.match(result.error ?? "", new RegExp(`Schema for '${row.toolId}'`), "a shape rejection inside withSchemaOnRejection must carry the published schema");
    }
  });
}
