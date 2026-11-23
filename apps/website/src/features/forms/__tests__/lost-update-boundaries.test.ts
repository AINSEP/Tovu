import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { ToolExecutionContext } from "@jini-ai/core";
import { RecordVersionConflictError } from "@jini-ai/core/optimistic-concurrency";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "@jini-ai/cms/forms";
import { executeCommand, InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { toAdminFormDefinitionDto } from "@jini-ai/cms/admin-http/http/forms";
import { registerAdminFormsAuthoringRoute } from "#src/server/inbound/admin-http/routes/forms/authoring";
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
  const registrations = buildFormsRegistrations(deps);
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
  registerAdminFormsAuthoringRoute({ app, deps: deps as FormsRouteDeps });
  const path = "/api/admin/v1/workspaces/ws/forms/form/authoring";
  const stale = await dispatchJsonRequest(app, "PUT", path, { name: "Edit", expectedVersion: 1 });
  assert.equal(stale.status, 409);
  assert.ok(stale.body && typeof stale.body === "object" && "code" in stale.body);
  assert.equal(stale.body.code, "VERSION_CONFLICT");
  const malformed = await dispatchJsonRequest(app, "PUT", path, { name: "Edit", expectedVersion: "1" });
  assert.equal(malformed.status, 400);
  assert.equal(toAdminFormDefinitionDto({ definition: record }).version, 1);
});
