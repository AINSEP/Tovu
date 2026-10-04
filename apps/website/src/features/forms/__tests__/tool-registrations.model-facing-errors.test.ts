/**
 * @file RED regression suite for the Forms half of the 2026-09-16 "always say the real reason"
 * sweep. Drives the REAL delegated-tool-call transport end to end, the same seam
 * `features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts`
 * established, so the assertion is on the payload a spawned agent CLI actually receives.
 *
 * Forms was the PARTIAL case in this sweep, which is what makes these cases worth pinning
 * separately: `withSchemaOnRejection`/`isFormsShapeRejection` already routed
 * `FormFieldValidationError` to the model correctly, and the last test below proves that path is
 * untouched by this change. Everything AROUND it was still redacted — authorization refusals, slug
 * conflicts, and the two not-found arms that threw a bare `Error` no predicate could ever match.
 *
 * RED before the fix, for every case except the last: `{ ok: false, error: { code:
 * "INTERNAL_ERROR", message: "an internal error occurred" } }`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";

import { executeCommand, InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "../repo.memory.js";
import { buildFormsRegistrations, type FormsToolDeps } from "../tool-registrations.js";

const WORKSPACE_ID = "ws-forms-errors";
const PRINCIPAL_ID = "principal-1";
const NOW = "2026-09-16T00:00:00.000Z";

function makeRouteDeps(options: { allow?: boolean; grants?: readonly string[] } = {}): FormsToolDeps {
  const allow = options.allow ?? true;
  let counter = 0;
  return {
    executeCommand,
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse(NOW) },
    idGen: { newId: () => `id-${++counter}` },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: {
      enqueue: async () => undefined,
      claimPending: async () => [],
      markDelivered: async () => undefined,
      markFailed: async () => undefined,
    },
    formDefinitionRepo: new InMemoryFormDefinitionRepo(),
    formSubmissionRepo: new InMemoryFormSubmissionRepo(),
    authorize: async ({ permission }) => ((options.grants ? options.grants.includes(permission) : allow) ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  };
}

async function buildHarness(routeDeps: FormsToolDeps) {
  const registry = createToolRegistry({});
  for (const registration of buildFormsRegistrations(routeDeps)) registry.register(registration);
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  return { run, lifecycle, toolExecutor, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) };
}

type Harness = Awaited<ReturnType<typeof buildHarness>>;

async function call(harness: Harness, toolId: string, input: unknown) {
  return delegatedToolExecuteRoute.handle({
    input: { runId: harness.run.id, toolUseId: `tu-${toolId}`, toolId, input },
    deps: harness,
  });
}

test("forms_list_submissions for an unknown definition is BAD_REQUEST with the real not-found reason, not a redacted 500", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "forms_list_submissions", { formId: "nope" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "FORMS_DEFINITION_NOT_FOUND: form definition 'nope' was not found",
  });
});

test("forms_get_submission for an unknown submission says so rather than 'an internal error occurred'", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "forms_get_submission", { formId: "f-1", submissionId: "s-nope" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "FORMS_SUBMISSION_NOT_FOUND: submission 's-nope' was not found",
  });
});

test("forms_update_definition for an unknown definition surfaces the not-found class, not a 500", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "forms_update_definition", { formId: "nope", name: "Renamed" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "BAD_REQUEST");
  assert.match(result.error.message, /^FORMS_DEFINITION_NOT_FOUND: /, result.error.message);
});

test("forms_create_definition at a taken slug says SLUG CONFLICT, not a 500 — a conflict is not a shape rejection and never was decorated", async () => {
  const routeDeps = makeRouteDeps();
  const harness = await buildHarness(routeDeps);

  const FIELDS = [{ id: "email", label: "Email", type: "email", required: true }];

  const first = await call(harness, "forms_create_definition", { name: "Contact", slug: "contact", fields: FIELDS });
  assert.equal(first.ok, true, `setup: first create failed: ${JSON.stringify(first)}`);

  const result = await call(harness, "forms_create_definition", { name: "Contact again", slug: "contact", fields: FIELDS });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "BAD_REQUEST");
  assert.match(result.error.message, /^FORMS_SLUG_CONFLICT: /, result.error.message);
});

test("every Forms tool surfaces a denial with the permission named — the sibling-arm check", async () => {
  for (const [toolId, input] of [
    ["forms_list_definitions", {}],
    ["forms_create_definition", { name: "n", slug: "s", fields: [{ id: "a", label: "A", type: "text", required: false }] }],
    ["forms_update_definition", { formId: "f-1", name: "n" }],
    ["forms_set_definition_status", { formId: "f-1", status: "active" }],
    ["forms_list_submissions", { formId: "f-1" }],
    ["forms_get_submission", { formId: "f-1", submissionId: "s-1" }],
  ] as const) {
    const harness = await buildHarness(makeRouteDeps({ allow: false }));

    const result = await call(harness, toolId, input);

    assert.equal(result.ok, false, `${toolId}: expected a refusal`);
    if (result.ok) continue;
    assert.equal(result.error.code, "BAD_REQUEST", `${toolId}: still redacted — ${JSON.stringify(result.error)}`);
    assert.match(result.error.message, /^FORMS_FORBIDDEN: principal 'principal-1' is not authorized for 'admin\.forms\./, `${toolId}: ${result.error.message}`);
  }
});

test("the pre-existing withSchemaOnRejection path is UNCHANGED — a shape rejection still arrives schema-decorated and un-prefixed", async () => {
  const harness = await buildHarness(makeRouteDeps());

  // An empty patch is a `FormFieldValidationError`, which `isFormsShapeRejection` already matched
  // before this sweep. It must still reach the model as the decorated `ToolInputError` it always
  // was — NOT double-wrapped with a second code prefix by the new reclassification layer.
  const result = await call(harness, "forms_update_definition", { formId: "f-1" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "BAD_REQUEST");
  assert.match(result.error.message, /^at least one of 'name', 'fields', or 'notify' is required/, result.error.message);
  assert.match(result.error.message, /Schema for 'forms_update_definition'/, result.error.message);
  assert.doesNotMatch(result.error.message, /^FORMS_/, "a decorated shape rejection must not be re-prefixed");
});


async function seedSubmissionReads(deps: FormsToolDeps) {
  for (const id of ["form-a", "form-b"]) {
    await deps.formDefinitionRepo.create({ id, workspaceId: WORKSPACE_ID, name: id, slug: id, fields: [{ id: "message", label: "Message", type: "text", required: true }], notify: { enabled: false, recipients: [] }, status: "active", createdAt: NOW, updatedAt: NOW, version: 1 });
  }
  for (const [id, formDefinitionId, submittedAt, message] of [
    ["sub-a-old", "form-a", "2026-09-16T00:00:00.000Z", "older A"],
    ["sub-a-new", "form-a", "2026-09-16T00:01:00.000Z", "newer A"],
    ["sub-b", "form-b", "2026-09-16T00:02:00.000Z", "private B"],
  ]) {
    await deps.formSubmissionRepo.create({ id, formDefinitionId, workspaceId: WORKSPACE_ID, submittedAt, sourceIp: "192.0.2.1", data: { message } });
  }
}

test("submission read tools require submissions.read independently of manage", async () => {
  for (const grants of [["admin.forms.manage"], ["admin.forms.submissions.read"]]) {
    const deps = makeRouteDeps({ grants });
    await seedSubmissionReads(deps);
    const harness = await buildHarness(deps);
    for (const [toolId, input] of [["forms_list_submissions", { formId: "form-a" }], ["forms_get_submission", { formId: "form-a", submissionId: "sub-a-new" }]] as const) {
      const result = await call(harness, toolId, input);
      if (grants.includes("admin.forms.submissions.read")) {
        assert.ok(result.ok, JSON.stringify(result));
        assert.equal(result.value.result.status, "completed");
        const output = result.value.result.output as { submission?: { id: string }; submissions?: Array<{ id: string }> };
        if (toolId === "forms_get_submission") assert.equal(output.submission?.id, "sub-a-new");
        else assert.deepEqual(output.submissions?.map((row) => row.id), ["sub-a-new", "sub-a-old"]);
      } else {
        assert.equal(result.ok, false);
        assert.ok(!result.ok);
        assert.deepEqual(result.error, { code: "BAD_REQUEST", message: "FORMS_FORBIDDEN: principal 'principal-1' is not authorized for 'admin.forms.submissions.read' (insufficient_permission)" });
      }
    }
  }
});

test("submission get refuses a mismatched form, while correct get and paginated list preserve content", async () => {
  const deps = makeRouteDeps();
  await seedSubmissionReads(deps);
  const harness = await buildHarness(deps);
  const get = await call(harness, "forms_get_submission", { formId: "form-b", submissionId: "sub-b" });
  assert.ok(get.ok, JSON.stringify(get));
  assert.deepEqual(get.value.result.output, { submission: { id: "sub-b", formDefinitionId: "form-b", data: { message: "private B" }, sourceIp: "192.0.2.1", submittedAt: "2026-09-16T00:02:00.000Z" } });
  const wrong = await call(harness, "forms_get_submission", { formId: "form-a", submissionId: "sub-b" });
  assert.equal(wrong.ok, false);
  assert.ok(!wrong.ok);
  assert.deepEqual(wrong.error, { code: "BAD_REQUEST", message: "FORMS_SUBMISSION_NOT_FOUND: submission 'sub-b' was not found" });
  const first = await call(harness, "forms_list_submissions", { formId: "form-a", limit: 1 });
  assert.ok(first.ok, JSON.stringify(first));
  assert.deepEqual(first.value.result.output, { submissions: [{ id: "sub-a-new", formDefinitionId: "form-a", data: { message: "newer A" }, sourceIp: "192.0.2.1", submittedAt: "2026-09-16T00:01:00.000Z" }], nextCursor: "sub-a-new" });
  const second = await call(harness, "forms_list_submissions", { formId: "form-a", limit: 1, cursor: "sub-a-new" });
  assert.ok(second.ok, JSON.stringify(second));
  assert.deepEqual(second.value.result.output, { submissions: [{ id: "sub-a-old", formDefinitionId: "form-a", data: { message: "older A" }, sourceIp: "192.0.2.1", submittedAt: NOW }], nextCursor: null });
});
