import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryChangeSetRepo } from "../../core/commands";
import { ForbiddenError as CommandForbiddenError } from "@jini-ai/cms/core";
import {
  FormFieldValidationError,
  FormSlugConflictError,
  FormDefinitionNotFoundError,
} from "../errors";
import { InMemoryFormDefinitionRepo } from "../repo.memory";
import {
  createFormDefinition,
  setFormDefinitionStatus,
  updateFormDefinition,
} from "../write-service";

/**
 * @file Unit tests for `write-service.ts` (C-005/C-006/C-007, REQ-01/03/04, AC-01/02/04/05/06,
 * EC-04, behavior.spec.md §1.1/§1.2, INV-08). Slug immutability, field-id-removal restriction,
 * never-delete lifecycle, concurrent-create slug race -> FORMS_SLUG_CONFLICT.
 */

const NOW = "2026-07-13T00:00:00.000Z";
const WORKSPACE_ID = "ws-1";
const ACTOR = { id: "principal-1", kind: "user" as const };

function makeDeps() {
  const repo = new InMemoryFormDefinitionRepo();
  const clock = { nowIso: () => NOW };
  let counter = 0;
  const idGen = { newId: () => `id-${++counter}` };
  const changeSets = new InMemoryChangeSetRepo();
  const authorize = async () => ({ allowed: true, reason: "ok" });
  return { repo, clock, idGen, changeSets, authorize };
}

test("createFormDefinition: creates an active definition with default notify config (AC-01)", async () => {
  const deps = makeDeps();
  const { definition } = await createFormDefinition({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      name: "Contact",
      slug: "contact",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    },
  });
  assert.equal(definition.status, "active");
  assert.deepEqual(definition.notify, { enabled: false, recipients: [] });

  const found = await deps.repo.findById({ workspaceId: WORKSPACE_ID, id: definition.id });
  assert.equal(found?.slug, "contact");
});

test("createFormDefinition: AC-02 — persists notify config when supplied", async () => {
  const deps = makeDeps();
  const { definition } = await createFormDefinition({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      name: "Contact",
      slug: "contact",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
      notify: { enabled: true, recipients: ["ops@example.com"] },
    },
  });
  assert.deepEqual(definition.notify, { enabled: true, recipients: ["ops@example.com"] });
});

test("createFormDefinition: AC-03 — rejects an out-of-vocabulary field type, nothing persisted", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () =>
      createFormDefinition({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          actor: ACTOR,
          name: "Contact",
          slug: "contact",
          fields: [{ id: "when", label: "When", type: "date" as never, required: false }],
        },
      }),
    FormFieldValidationError
  );
  const list = await deps.repo.list({ workspaceId: WORKSPACE_ID });
  assert.equal(list.length, 0);
});

test("createFormDefinition: AC-04/EC-04 — a duplicate slug maps to FormSlugConflictError, existing definition unchanged", async () => {
  const deps = makeDeps();
  await createFormDefinition({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      name: "Contact",
      slug: "contact",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    },
  });

  await assert.rejects(
    () =>
      createFormDefinition({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          actor: ACTOR,
          name: "Contact 2",
          slug: "contact",
          fields: [{ id: "name", label: "Name", type: "text", required: true }],
        },
      }),
    FormSlugConflictError
  );

  const list = await deps.repo.list({ workspaceId: WORKSPACE_ID });
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "Contact");
});

test("createFormDefinition: throws the gateway's ForbiddenError when authorize denies", async () => {
  const deps = makeDeps();
  deps.authorize = async () => ({ allowed: false, reason: "missing_permission" });
  await assert.rejects(
    () =>
      createFormDefinition({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          actor: ACTOR,
          name: "Contact",
          slug: "contact",
          fields: [{ id: "name", label: "Name", type: "text", required: true }],
        },
      }),
    CommandForbiddenError
  );
});

test("updateFormDefinition: behavior.spec.md §1.1 — a patch containing slug never changes the stored slug", async () => {
  const deps = makeDeps();
  const { definition } = await createFormDefinition({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      name: "Contact",
      slug: "contact",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    },
  });

  const { definition: updated } = await updateFormDefinition({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      formId: definition.id,
      patch: { slug: "renamed" } as Record<string, unknown>,
    },
  });
  assert.equal(updated.slug, "contact");
});

test("updateFormDefinition: behavior.spec.md §1.2 — rejects a fields patch that omits an existing field id", async () => {
  const deps = makeDeps();
  const { definition } = await createFormDefinition({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      name: "Contact",
      slug: "contact",
      fields: [
        { id: "name", label: "Name", type: "text", required: true },
        { id: "email", label: "Email", type: "email", required: true },
      ],
    },
  });

  await assert.rejects(
    () =>
      updateFormDefinition({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          actor: ACTOR,
          formId: definition.id,
          patch: { fields: [{ id: "name", label: "Name", type: "text", required: true }] },
        },
      }),
    FormFieldValidationError
  );
});

test("updateFormDefinition: allows adding a new field while keeping existing ids", async () => {
  const deps = makeDeps();
  const { definition } = await createFormDefinition({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      name: "Contact",
      slug: "contact",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    },
  });

  const { definition: updated } = await updateFormDefinition({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      formId: definition.id,
      patch: {
        fields: [
          { id: "name", label: "Full Name", type: "text", required: true },
          { id: "email", label: "Email", type: "email", required: false },
        ],
      },
    },
  });
  assert.equal(updated.fields.length, 2);
  assert.equal(updated.fields[0].label, "Full Name");
});

test("updateFormDefinition: FormDefinitionNotFoundError for an unknown formId", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () =>
      updateFormDefinition({
        deps,
        input: { workspaceId: WORKSPACE_ID, actor: ACTOR, formId: "nope", patch: { name: "X" } },
      }),
    FormDefinitionNotFoundError
  );
});

test("setFormDefinitionStatus: AC-05 — flips status to disabled without deleting the row (INV-08)", async () => {
  const deps = makeDeps();
  const { definition } = await createFormDefinition({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      name: "Contact",
      slug: "contact",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    },
  });

  const { definition: disabled } = await setFormDefinitionStatus({
    deps,
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, formId: definition.id, status: "disabled" },
  });
  assert.equal(disabled.status, "disabled");

  const stillThere = await deps.repo.findById({ workspaceId: WORKSPACE_ID, id: definition.id });
  assert.ok(stillThere);
  assert.equal(stillThere?.status, "disabled");
});

test("setFormDefinitionStatus: FormDefinitionNotFoundError for an unknown formId", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () =>
      setFormDefinitionStatus({
        deps,
        input: { workspaceId: WORKSPACE_ID, actor: ACTOR, formId: "nope", status: "disabled" },
      }),
    FormDefinitionNotFoundError
  );
});

test("AC-06: FormDefinitionRepoPort exposes no delete method — write-service.ts has nothing to call", () => {
  const repo = new InMemoryFormDefinitionRepo();
  assert.equal((repo as unknown as { delete?: unknown }).delete, undefined);
});
