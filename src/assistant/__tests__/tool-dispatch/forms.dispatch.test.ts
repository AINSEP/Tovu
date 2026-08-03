import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { createRouteDeps } from "#src/server/app";
import { buildAssistantToolRegistrations } from "../../tool-registrations";

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
  const created = (createResult.output as { definition: { id: string; slug: string; status: string } }).definition;
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
  assert.match(result.error ?? "", /is not authorized for/);

  const listed = await routeDeps.formDefinitionRepo.findBySlug({
    workspaceId: routeDeps.workspaceId,
    slug: "should-not-be-created",
  });
  assert.equal(listed, null, "a denied call must leave the database untouched");
});

test("forms_list_definitions resolves a form by name to its id, closing the loop forms_set_definition_status needs", async () => {
  const { toolExecutor, ownerPrincipal } = await buildRealExecutor();
  const run = { id: "run-canary-forms-list" };

  const createResult = await toolExecutor.execute(ownerPrincipal, run, "forms_create_definition", {
    name: "Lookup Target Form",
    slug: "lookup-target-form",
    fields: [{ id: "email", label: "Email", type: "email", required: true }],
  });
  assert.equal(createResult.status, "completed");
  const created = (createResult.output as { definition: { id: string } }).definition;

  const listResult = await toolExecutor.execute(ownerPrincipal, run, "forms_list_definitions", {});
  assert.equal(listResult.status, "completed", `list should succeed, got: ${JSON.stringify(listResult)}`);
  const definitions = (listResult.output as { definitions: { id: string; name: string; slug: string; status: string }[] }).definitions;
  const found = definitions.find((d) => d.slug === "lookup-target-form");
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
});

test("forms_list_definitions through the real ToolExecutor refuses a principal with no grants", async () => {
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

  const result = await toolExecutor.execute({ id: "bare-principal-forms-list-canary" }, run, "forms_list_definitions", {});
  assert.equal(result.status, "failed", `an unauthorized principal must not succeed, got: ${JSON.stringify(result)}`);
  assert.match(result.error ?? "", /is not authorized for/);
});
