import { deriveDuplicateName } from "#src/features/content-duplication/copy-naming-policy";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { ToolExecutionContext } from "@jini-ai/core";
import { RecordVersionConflictError } from "@jini-ai/core/optimistic-concurrency";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "@jini-ai/cms/forms";
import { executeCommand, InMemoryChangeSetRepo } from "@jini-ai/cms/core/commands";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { toAdminFormDefinitionDto } from "@jini-ai/cms/admin-http/http/forms";
import { registerAdminFormsAuthoringRoute, registerAdminFormsUpdateRoute } from "#src/server/runtime/composition/modules/forms-admin";
import type { FormsRouteDeps } from "#src/server/inbound/admin-http/routes/forms/deps";
import { buildFormsRegistrations } from "../tool-registrations.js";

const record = { id: "form", workspaceId: "ws", name: "Contact", slug: "contact", fields: [],
  notify: { enabled: false, recipients: [] }, status: "active" as const, createdAt: "t0", updatedAt: "t0", version: 1 };

async function fixture() {
  const repo = new InMemoryFormDefinitionRepo();
  await repo.create(record);
  let next = 0;
  const deps = { workspaceId: "ws", formDefinitionRepo: repo, formSubmissionRepo: new InMemoryFormSubmissionRepo(),
    executeCommand, changeSets: new InMemoryChangeSetRepo(), clock: { nowMs: () => 0 }, idGen: { newId: () => `id-${++next}` },
    authorize: async () => ({ allowed: true, reason: "test" }),
    removeFormSubmission: (async () => { throw new Error("unused: this fixture never deletes a submission"); }) as FormsRouteDeps["removeFormSubmission"],
    outbox: { enqueue: async () => {}, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} },
  };
  return { repo, deps };
}

test("form tool requires a version and exposes conflicts and the read version", async () => {
  const { repo, deps } = await fixture();
  const registrations = buildFormsRegistrations(deps, { deriveDuplicateName });
  const read = registrations.find((item) => item.descriptor.id === "forms_list_definitions");
  const write = registrations.find((item) => item.descriptor.id === "forms_update_definition");
  assert.ok(read && write);
  const context = (input: unknown) => ({ executionId: "exec", principal: { id: "editor" }, run: { id: "run" }, input, signal: new AbortController().signal }) as ToolExecutionContext;
  await assert.rejects(write.handler(context({ formId: "form", name: "First" })), /content_read\.form_definition/);
  const result = await read.handler(context({}));
  assert.ok(result && typeof result === "object" && "definitions" in result && Array.isArray(result.definitions));
  assert.equal(result.definitions[0].version, 1);
  repo.update = async () => { throw new RecordVersionConflictError({ recordKind: "form", recordId: "form", expectedVersion: 1, currentVersion: 2 }); };
  await assert.rejects(write.handler(context({ formId: "form", name: "Second", expectedVersion: 1 })), /NOT applied/);
});

test("form authoring maps a stale version to 409 and malformed versions to 400", async () => {
  const { repo, deps } = await fixture();
  repo.update = async () => { throw new RecordVersionConflictError({ recordKind: "form", recordId: "form", expectedVersion: 1, currentVersion: 2 }); };
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "editor" }; next(); });
  registerAdminFormsAuthoringRoute({ errors: createRouteIncidentReporter().errors, app, deps: deps as FormsRouteDeps });
  const path = "/api/admin/v1/workspaces/ws/forms/form/authoring";
  const stale = await dispatchJsonRequest(app, "PUT", path, { name: "Edit", expectedVersion: 1 });
  assert.equal(stale.status, 409);
  assert.ok(stale.body && typeof stale.body === "object" && "code" in stale.body);
  assert.equal(stale.body.code, "VERSION_CONFLICT");
  const malformed = await dispatchJsonRequest(app, "PUT", path, { name: "Edit", expectedVersion: "1" });
  assert.equal(malformed.status, 400);
  assert.equal(toAdminFormDefinitionDto({ definition: record }).version, 1);
});

/** The real ordinary PUT route over the real in-memory repo, with recording change-set and outbox ports. */
async function ordinaryPutFixture() {
  const { repo, deps } = await fixture();
  const counts = { changeSets: 0, outbox: 0 };
  const changeSets = new InMemoryChangeSetRepo();
  const insert = changeSets.insert.bind(changeSets);
  changeSets.insert = (async (...args: Parameters<typeof insert>) => { counts.changeSets += 1; return insert(...args); }) as typeof changeSets.insert;
  const outbox = { ...deps.outbox, enqueue: async () => { counts.outbox += 1; } };
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "editor" }; next(); });
  registerAdminFormsUpdateRoute({ errors: createRouteIncidentReporter().errors, app, deps: { ...deps, changeSets, outbox } as FormsRouteDeps });
  const put = (body: unknown) => dispatchJsonRequest(app, "PUT", "/api/admin/v1/workspaces/ws/forms/form", body);
  const stored = async () => structuredClone(await repo.findById({ workspaceId: "ws", id: "form" }));
  return { put, stored, counts };
}

const dataOf = (body: unknown) => (body as { data: { name: string; status: string; version: number } }).data;
const errorOf = (body: unknown) => body as { error?: string; code?: string };

test("ordinary PUT with a stale expectedVersion is refused with 409 and changes no row and no outbox", async () => {
  const { put, stored, counts } = await ordinaryPutFixture();
  // Advance the real row from version 1 to 2 through the real legacy path; no stubbed repo.
  const advanced = await put({ name: "Someone else" });
  assert.equal(advanced.status, 200);
  assert.equal(dataOf(advanced.body).version, 2);
  const rowBefore = await stored();
  const before = { ...counts };
  const stale = await put({ name: "Old basis", expectedVersion: 1 });
  assert.equal(stale.status, 409);
  assert.equal(errorOf(stale.body).code, "VERSION_CONFLICT");
  assert.equal(errorOf(stale.body).error, "This form changed since you opened it. Reload it before saving.");
  assert.deepEqual(await stored(), rowBefore);
  assert.equal(rowBefore?.name, "Someone else");
  assert.deepEqual(counts, before);
});

test("fresh expectedVersion saves", async () => {
  const { put, stored } = await ordinaryPutFixture();
  const saved = await put({ name: "Fresh", expectedVersion: 1 });
  assert.equal(saved.status, 200);
  assert.equal(dataOf(saved.body).version, 2);
  assert.equal((await stored())?.version, 2);
  assert.equal((await stored())?.name, "Fresh");
  const again = await put({ name: "Fresh again", expectedVersion: 2 });
  assert.equal(again.status, 200);
  assert.equal(dataOf(again.body).version, 3);
  assert.equal((await stored())?.version, 3);
});

test("versioned PUT with status is refused before either write", async () => {
  const { put, stored, counts } = await ordinaryPutFixture();
  const rowBefore = await stored();
  const mixed = await put({ name: "Both", status: "disabled", expectedVersion: 1 });
  assert.equal(mixed.status, 400);
  assert.equal(errorOf(mixed.body).error, "Save the form and change its status as two separate actions.");
  const statusOnly = await put({ status: "disabled", expectedVersion: 1 });
  assert.equal(statusOnly.status, 400);
  assert.deepEqual(await stored(), rowBefore);
  assert.deepEqual(counts, { changeSets: 0, outbox: 0 });
});

test("malformed version is a 400", async () => {
  const { put, stored, counts } = await ordinaryPutFixture();
  const rowBefore = await stored();
  for (const expectedVersion of ["1", -1, 1.5, null, Number.MAX_SAFE_INTEGER + 2]) {
    const response = await put({ name: "Edit", expectedVersion });
    assert.equal(response.status, 400, JSON.stringify(expectedVersion));
  }
  const noDefinition = await put({ expectedVersion: 1 });
  assert.equal(noDefinition.status, 400);
  assert.equal(errorOf(noDefinition.body).error, "Send at least one form field you want to change.");
  assert.deepEqual(await stored(), rowBefore);
  assert.deepEqual(counts, { changeSets: 0, outbox: 0 });
});

test("legacy unversioned field patch, status-only and mixed requests behave as before", async () => {
  const { put, stored } = await ordinaryPutFixture();
  const patch = await put({ name: "Legacy" });
  assert.equal(patch.status, 200);
  assert.equal(dataOf(patch.body).name, "Legacy");
  assert.equal(dataOf(patch.body).version, 2);
  const statusOnly = await put({ status: "disabled" });
  assert.equal(statusOnly.status, 200);
  assert.equal(dataOf(statusOnly.body).status, "disabled");
  const mixed = await put({ name: "Mixed", status: "active" });
  assert.equal(mixed.status, 200);
  assert.equal(dataOf(mixed.body).name, "Mixed");
  assert.equal(dataOf(mixed.body).status, "active");
  const row = await stored();
  assert.equal(row?.name, "Mixed");
  assert.equal(row?.status, "active");
  const noop = await put({});
  assert.equal(noop.status, 200);
  assert.equal(dataOf(noop.body).version, row?.version);
});
