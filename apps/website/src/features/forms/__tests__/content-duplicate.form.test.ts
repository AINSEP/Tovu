import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { buildContentDuplicationRegistrations } from "#src/features/content-duplication/tool-registrations";
import { InMemoryFormDefinitionRepo } from "../repo.memory.js";
import { contributeFormsDuplicateHandlers, type FormsToolDeps } from "../tool-registrations.js";
import { SLUG_PATTERN } from "../write-service.js";

/**
 * @file Certifies this domain's `"form"` contribution to the cross-resource `content_duplicate`
 * tool — the SECOND resource, added to prove the generic seam is real rather than a post-shaped hole
 * with a `resource` parameter bolted on.
 *
 * What makes it a real proof and not a second copy of the post tests: `form` gates on
 * `admin.forms.manage` where post/page gate on `content.write` (the per-resource permission
 * assertion below would pass vacuously if both resources agreed), a form definition has no
 * draft/published status to default, and `createFormDefinition` demands an explicit valid slug where
 * `createPost` derives one itself.
 */

const WORKSPACE_ID = "ws-forms-duplicate";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-08T00:00:00.000Z";

function fakeRouteDeps(allowedPermissions: string[] = ["admin.forms.manage"]) {
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  let counter = 0;
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `form-copy-${++counter}` },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: new InMemoryOutbox(),
    formDefinitionRepo,
    authorize: async (required: { permission: string }) =>
      allowedPermissions.includes(required.permission)
        ? { allowed: true, reason: "matched" }
        : { allowed: false, reason: "no matching grant" },
  } as unknown as FormsToolDeps;

  return { deps, formDefinitionRepo };
}

function duplicateTool(deps: FormsToolDeps): ToolRegistration {
  const registrations = buildContentDuplicationRegistrations(deps as unknown as AssistantToolRegistryDeps, {
    listResourceHandlers: contributeFormsDuplicateHandlers,
  });
  const found = registrations.find((r) => r.descriptor.id === "content_duplicate");
  assert.ok(found, "expected 'content_duplicate' to be wired");
  return found;
}

function call(registration: ToolRegistration, input: unknown) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
  return registration.handler(ctx);
}

interface FormView {
  id: string;
  name: string;
  slug: string;
  status: string;
  fields: Array<{ id: string; label: string; type: string; required: boolean }>;
  notify: { enabled: boolean; recipients: string[] };
}

async function seedForm(repo: InMemoryFormDefinitionRepo, overrides: Record<string, unknown> = {}) {
  const record = {
    id: "source-form",
    workspaceId: WORKSPACE_ID,
    name: "Contact Us",
    slug: "contact-us",
    fields: [
      { id: "email", label: "Your email", type: "email" as const, required: true },
      { id: "message", label: "Message", type: "textarea" as const, required: false, maxLength: 500 },
    ],
    notify: { enabled: true, recipients: ["owner@example.com"] },
    status: "active" as const,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
  await repo.create(record as never);
  return record;
}

test("'form' is a supported resource of content_duplicate", async () => {
  assert.deepEqual(contributeFormsDuplicateHandlers().map((c) => c.resource), ["form"]);
});

test("copying a form defaults the name to 'Copy of <source>', derives a free slug, and deep-copies fields and notify", async () => {
  const { deps, formDefinitionRepo } = fakeRouteDeps();
  const source = await seedForm(formDefinitionRepo);

  const { definition } = (await call(duplicateTool(deps), { resource: "form", id: "source-form" })) as {
    definition: FormView;
  };

  assert.notEqual(definition.id, "source-form", "must be a NEW row");
  assert.equal(definition.name, "Copy of Contact Us");
  assert.equal(definition.slug, "copy-of-contact-us");
  assert.match(definition.slug, SLUG_PATTERN);
  assert.deepEqual(definition.fields, source.fields);
  assert.deepEqual(definition.notify, { enabled: true, recipients: ["owner@example.com"] });

  const sourceStillThere = await formDefinitionRepo.findById({ workspaceId: WORKSPACE_ID, id: "source-form" });
  assert.equal(sourceStillThere?.name, "Contact Us", "the source row must be completely untouched");
  assert.equal(sourceStillThere?.slug, "contact-us");
});

test("the copy's fields and notify.recipients are fresh objects — mutating the copy cannot reach the source row", async () => {
  const { deps, formDefinitionRepo } = fakeRouteDeps();
  await seedForm(formDefinitionRepo);

  const { definition } = (await call(duplicateTool(deps), { resource: "form", id: "source-form" })) as {
    definition: FormView;
  };
  const copiedRow = await formDefinitionRepo.findById({ workspaceId: WORKSPACE_ID, id: definition.id });
  const sourceRow = await formDefinitionRepo.findById({ workspaceId: WORKSPACE_ID, id: "source-form" });

  assert.notEqual(copiedRow!.fields[0], sourceRow!.fields[0], "field descriptors must not be the SAME object");
  assert.notEqual(copiedRow!.notify.recipients, sourceRow!.notify.recipients, "recipients must not be the SAME array");

  copiedRow!.fields[0]!.label = "Mutated";
  copiedRow!.notify.recipients.push("intruder@example.com");
  const sourceAfter = await formDefinitionRepo.findById({ workspaceId: WORKSPACE_ID, id: "source-form" });
  assert.equal(sourceAfter!.fields[0]!.label, "Your email");
  assert.deepEqual(sourceAfter!.notify.recipients, ["owner@example.com"]);
});

test("an explicit title and slug are honored", async () => {
  const { deps, formDefinitionRepo } = fakeRouteDeps();
  await seedForm(formDefinitionRepo);

  const { definition } = (await call(duplicateTool(deps), {
    resource: "form",
    id: "source-form",
    overrides: { title: "Sales Enquiries", slug: "sales-enquiries" },
  })) as { definition: FormView };

  assert.equal(definition.name, "Sales Enquiries");
  assert.equal(definition.slug, "sales-enquiries");
});

test("copying the same form twice disambiguates the second slug instead of failing on the unique index", async () => {
  const { deps, formDefinitionRepo } = fakeRouteDeps();
  await seedForm(formDefinitionRepo);
  const duplicate = duplicateTool(deps);

  const first = (await call(duplicate, { resource: "form", id: "source-form" })) as { definition: FormView };
  const second = (await call(duplicate, { resource: "form", id: "source-form" })) as { definition: FormView };

  assert.equal(first.definition.slug, "copy-of-contact-us");
  assert.equal(second.definition.slug, "copy-of-contact-us-2");
  assert.notEqual(first.definition.id, second.definition.id);
});

test("a copy of a DISABLED form comes back disabled — a copy is never more exposed than its source", async () => {
  const { deps, formDefinitionRepo } = fakeRouteDeps();
  await seedForm(formDefinitionRepo, { status: "disabled" });

  const { definition } = (await call(duplicateTool(deps), { resource: "form", id: "source-form" })) as {
    definition: FormView;
  };

  assert.equal(definition.status, "disabled");
  const copiedRow = await formDefinitionRepo.findById({ workspaceId: WORKSPACE_ID, id: definition.id });
  assert.equal(copiedRow?.status, "disabled", "the persisted row, not just the returned view, must be disabled");
});

test("a copy of an ACTIVE form stays active", async () => {
  const { deps, formDefinitionRepo } = fakeRouteDeps();
  await seedForm(formDefinitionRepo, { status: "active" });

  const { definition } = (await call(duplicateTool(deps), { resource: "form", id: "source-form" })) as {
    definition: FormView;
  };
  assert.equal(definition.status, "active");
});

test("the draft/published status override is REJECTED for forms rather than silently dropped, naming what IS honored", async () => {
  const { deps, formDefinitionRepo } = fakeRouteDeps();
  await seedForm(formDefinitionRepo);

  await assert.rejects(
    call(duplicateTool(deps), { resource: "form", id: "source-form", overrides: { status: "published" } }),
    /does not support the 'status' override[\s\S]*Overrides honored for 'form': title[\s\S]*slug/,
  );

  const rows = await formDefinitionRepo.list({ workspaceId: WORKSPACE_ID });
  assert.equal(rows.length, 1, "nothing may be written when the overrides are rejected");
});

test("duplicating a nonexistent form is rejected as not-found, before anything is written", async () => {
  const { deps, formDefinitionRepo } = fakeRouteDeps();

  await assert.rejects(call(duplicateTool(deps), { resource: "form", id: "no-such-form" }), /was not found/);
  assert.equal((await formDefinitionRepo.list({ workspaceId: WORKSPACE_ID })).length, 0);
});

test("a caller holding content.write but NOT admin.forms.manage cannot copy a form — the permission is the RESOURCE's own", async () => {
  const { deps, formDefinitionRepo } = fakeRouteDeps(["content.write"]);
  await seedForm(formDefinitionRepo);

  await assert.rejects(call(duplicateTool(deps), { resource: "form", id: "source-form" }), /admin\.forms\.manage/);
  assert.equal(
    (await formDefinitionRepo.list({ workspaceId: WORKSPACE_ID })).length,
    1,
    "a denied caller must leave no copy behind",
  );
});
