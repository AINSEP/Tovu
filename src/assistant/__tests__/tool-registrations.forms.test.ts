/**
 * Covers, for the 3 Forms tools, the union of what
 * `tool-registrations.contracts.test.ts` and `tool-registrations.authorization.test.ts` cover for
 * content-types: published contracts, risk cross-check, the confirmation-transport guard, the
 * model-facing output projection, and the full ADR-021 authorization half.
 *
 * Uses the REAL `InMemoryFormDefinitionRepo` / `InMemoryChangeSetRepo` (as
 * `forms/__tests__/write-service.test.ts` does) rather than hand-rolled write-log fakes, so
 * "nothing was written" is asserted against actual repo state, not against a spy.
 *
 * See APPLY-5 for the two small edits the pre-existing shared test files need.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryChangeSetRepo, ForbiddenError as CommandForbiddenError } from "../../core/commands";
import { formsAgentToolCatalog, type AgentToolDefinition } from "../../forms/agent-tools";
import { InMemoryFormDefinitionRepo } from "../../forms/repo.memory";
import type { FormDefinitionRecord } from "../../forms/types";
import type { RouteDeps } from "../../server/routes/types";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations";

const WORKSPACE_ID = "ws-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

const VALID_FIELDS = [{ id: "email", label: "Email", type: "email", required: true }];

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const repo = new InMemoryFormDefinitionRepo();
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const order: string[] = [];

  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: { enqueue: async () => { order.push("outbox.enqueue"); } },
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      order.push("authorize");
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    formDefinitionRepo: {
      findById: (r: { workspaceId: string; id: string }) => { order.push("repo.findById"); return repo.findById(r); },
      findBySlug: repo.findBySlug.bind(repo),
      list: repo.list.bind(repo),
      create: async (record: FormDefinitionRecord) => { order.push("repo.create"); return repo.create(record); },
      update: async (record: FormDefinitionRecord) => { order.push("repo.update"); return repo.update(record); },
    },
  };

  return { deps: deps as unknown as RouteDeps, repo, authorizeCalls, order };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = formsAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function formsRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(
    buildAssistantToolRegistrations(deps)
      .filter((r) => r.descriptor.id.startsWith("forms_"))
      .map((r) => [r.descriptor.id, r]),
  );
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = formsRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

/** Seeds a definition through the real create tool, so tests operate on genuine domain output. */
async function seedDefinition(deps: RouteDeps): Promise<{ id: string }> {
  const out = (await wired("forms_create_definition", deps).handler(
    executionContext({ name: "Contact", slug: "contact", fields: VALID_FIELDS }),
  )) as { definition: { id: string } };
  return out.definition;
}

// ---------------------------------------------------------------------------
// 1. The catalog is complete and honest about what Forms can do
// ---------------------------------------------------------------------------

test("exactly the three write-service.ts operations are wired — no invented delete, publish, or archive", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...formsRegistrations(deps).keys()].sort(), [
    "forms_create_definition",
    "forms_set_definition_status",
    "forms_update_definition",
  ]);
});

test("INV-08: no wired tool is named for a delete, and none claims to delete a form definition", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of formsRegistrations(deps)) {
    assert.equal(/delete|destroy|purge|drop|remove/i.test(id), false, `'${id}' must not be named for a delete — FormDefinitionRepoPort exposes no delete method to call`);
    // Carve out negated clauses first ("no tool can delete...", "never permanently deleted"), then
    // match any inflection of the verb — narrowing the verb to dodge a negated false positive (the
    // trailing-`s`-only form this replaced) under-matches "delete"/"deleting"/"delete the X".
    const claim = registration.descriptor.description.replace(/\b(never|no|not|cannot|can't|won't)\b[^.;—]*/gi, "");
    assert.equal(
      /\b(delete|destroy|purge|drop)(s|d|ing)?\b/i.test(claim),
      false,
      `'${id}' must not claim to delete — disabling is the only retire path`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired Forms registration publishes its catalog entry's inputSchema and description", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of formsRegistrations(deps)) {
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's, not a second copy`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired Forms tool — setting it with no ExecutionDelegate would park the execution forever", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of formsRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined, `${id} must not request confirmation until a transport exists`);
  }
});

test("a rejected fields payload returns the tool's own schema plus an explicit non-retryable instruction", async () => {
  const { deps } = fakeRouteDeps();
  const error = await wired("forms_create_definition", deps)
    .handler(executionContext({ name: "Contact", slug: "contact", fields: [{ id: "when", label: "When", type: "date", required: false }] }))
    .then(() => null, (e: unknown) => e as Error);

  assert.ok(error, "an out-of-vocabulary field type must reject");
  assert.match(error.message, /will not resolve on retry without an input change/);
  assert.match(error.message, /"additionalProperties":false/, "the published schema must travel with the failure");
  assert.match(error.message, /"textarea"/, "the schema in the message must actually list the accepted field types");
});

test("the immutable slug is not accepted as an update input — the schema forbids it and the domain ignores it", async () => {
  const { deps } = fakeRouteDeps();
  const { id } = await seedDefinition(deps);

  const schema = catalogEntry("forms_update_definition").inputSchema as { properties: Record<string, unknown> };
  assert.equal("slug" in schema.properties, false, "forms_update_definition must not advertise a slug input");

  const out = (await wired("forms_update_definition", deps).handler(executionContext({ formId: id, name: "Renamed", slug: "hijacked" }))) as {
    definition: { slug: string; name: string };
  };
  assert.equal(out.definition.slug, "contact", "slug must be unchanged even when supplied");
  assert.equal(out.definition.name, "Renamed");
});

test("an empty update patch is refused rather than reported as a successful no-op", async () => {
  const { deps } = fakeRouteDeps();
  const { id } = await seedDefinition(deps);

  await assert.rejects(
    () => wired("forms_update_definition", deps).handler(executionContext({ formId: id })),
    /at least one of 'name', 'fields', or 'notify' is required/,
  );
});

test("an out-of-vocabulary status is refused rather than silently ignored", async () => {
  const { deps } = fakeRouteDeps();
  const { id } = await seedDefinition(deps);

  await assert.rejects(
    () => wired("forms_set_definition_status", deps).handler(executionContext({ formId: id, status: "archived" })),
    /'status' must be exactly 'active' or 'disabled'/,
  );
});

// ---------------------------------------------------------------------------
// 3. Output projection
// ---------------------------------------------------------------------------

test("a tool result is an explicit model-facing view: workspaceId and timestamps dropped, id kept for the next call's formId", async () => {
  const { deps } = fakeRouteDeps();
  const created = (await wired("forms_create_definition", deps).handler(
    executionContext({ name: "Contact", slug: "contact", fields: VALID_FIELDS }),
  )) as { definition: Record<string, unknown> };

  assert.deepEqual(Object.keys(created.definition).sort(), ["fields", "id", "name", "notify", "slug", "status"]);
  assert.equal("workspaceId" in created.definition, false, "the agent is already scoped to one workspace it cannot change");
  assert.equal("createdAt" in created.definition, false);
  assert.equal(created.definition.status, "active");
});

test("the returned fields/recipients arrays are copies — a tool caller cannot mutate domain state through them", async () => {
  const { deps, repo } = fakeRouteDeps();
  const created = (await wired("forms_create_definition", deps).handler(
    executionContext({ name: "Contact", slug: "contact", fields: VALID_FIELDS, notify: { enabled: true, recipients: ["ops@example.com"] } }),
  )) as { definition: { id: string; fields: unknown[]; notify: { recipients: string[] } } };

  created.definition.fields.push({ id: "injected", label: "x", type: "text", required: false });
  created.definition.notify.recipients.push("attacker@example.com");

  const stored = await repo.findById({ workspaceId: WORKSPACE_ID, id: created.definition.id });
  assert.equal(stored?.fields.length, 1, "pushing onto the returned view must not reach the stored record");
  assert.deepEqual(stored?.notify.recipients, ["ops@example.com"]);
});

// ---------------------------------------------------------------------------
// 4. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the real Forms catalog and tool-registrations' independent classification agree for all three wired tools", () => {
  const { deps } = fakeRouteDeps();
  for (const id of formsRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a Forms catalog entry cannot downgrade its own risk — declaring sideEffects:'none' fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("forms_create_definition", { ...catalogEntry("forms_create_definition"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("no wired Forms tool carries a confirmation-requiring actor-class rule", () => {
  const { deps } = fakeRouteDeps();
  for (const id of formsRegistrations(deps).keys()) {
    assert.notEqual(catalogEntry(id).actorClassRule, "confirmer-must-equal-own-delegatedBy");
  }
});

// ---------------------------------------------------------------------------
// 5. Authorization (ADR-021 §2) — the pass-through ToolPolicy is safe only because of this
// ---------------------------------------------------------------------------

const TOOL_INPUTS: Record<string, (seededId: string) => Record<string, unknown>> = {
  forms_create_definition: () => ({ name: "Contact", slug: "contact-2", fields: VALID_FIELDS }),
  forms_update_definition: (id) => ({ formId: id, name: "Renamed" }),
  forms_set_definition_status: (id) => ({ formId: id, status: "disabled" }),
};

test("every wired Forms tool has a known input fixture — a newly wired tool must be added here, not silently skipped", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...formsRegistrations(deps).keys()].sort(), Object.keys(TOOL_INPUTS).sort());
});

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with its catalog's declared permission and the run's principal`, async () => {
    const { deps, authorizeCalls } = fakeRouteDeps();
    const { id } = await seedDefinition(deps);
    authorizeCalls.length = 0;

    await wired(toolId, deps).handler(executionContext(TOOL_INPUTS[toolId](id)));

    assert.equal(authorizeCalls.length, 1, "exactly one authorization evaluation — ADR-021 §2 'one evaluator'");
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0].permission, catalogEntry(toolId).authorization.permission);
    assert.equal(authorizeCalls[0].permission, "admin.forms.manage");
    assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
    assert.equal(authorizeCalls[0].entityType, "form_definition");
  });

  test(`${toolId}: a denied principal is rejected and NOTHING is written`, async () => {
    const { deps: seedDeps, repo: seedRepo } = fakeRouteDeps();
    const { id } = await seedDefinition(seedDeps);
    const before = await seedRepo.findById({ workspaceId: WORKSPACE_ID, id });

    const { deps, repo } = fakeRouteDeps({ allow: false });
    await assert.rejects(
      () => wired(toolId, deps).handler(executionContext(TOOL_INPUTS[toolId](id))),
      (error: unknown) => {
        assert.ok(error instanceof CommandForbiddenError, `expected ForbiddenError, got ${String(error)}`);
        assert.match((error as Error).message, new RegExp(PRINCIPAL_ID));
        assert.match((error as Error).message, /admin\.forms\.manage/);
        return true;
      },
    );

    assert.deepEqual(await repo.list({ workspaceId: WORKSPACE_ID }), [], "the permission gate must run ahead of every durable effect");
    assert.ok(before, "sanity: the seed really did create a definition when allowed");
  });

  test(`${toolId}: authorize() runs before the repo is even read`, async () => {
    const { deps, order } = fakeRouteDeps();
    const { id } = await seedDefinition(deps);
    order.length = 0;

    await wired(toolId, deps).handler(executionContext(TOOL_INPUTS[toolId](id)));

    assert.equal(order[0], "authorize", `first observable effect was '${order[0]}', not the authorization check`);
  });
}

test("the ToolPolicy layer is a pass-through 'allow' for every Forms registration — enforcement is the domain layer's, by design", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of formsRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

test("all three wired Forms tools declare admin.forms.manage, and it is a capability Forms actually declares", () => {
  const { deps } = fakeRouteDeps();
  for (const id of formsRegistrations(deps).keys()) {
    assert.equal(catalogEntry(id).authorization.permission, "admin.forms.manage");
  }
});
