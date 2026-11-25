import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import { FormSlugConflictError, InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "@jini-ai/cms/forms";
import { executeCommand, InMemoryChangeSetRepo } from "@jini-ai/cms/core/commands";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { registerAdminFormsAuthoringRoute } from "#src/server/runtime/composition/modules/forms-admin";
import type { FormsRouteDeps } from "#src/server/inbound/admin-http/routes/forms/deps";
import {
  toAdminFormDefinitionResponse, toAdminFormDefinitionListResponse,
  toAdminFormSubmissionResponse, toAdminFormSubmissionListResponse,
} from "@jini-ai/cms/admin-http/http/forms";

// F4.1/F4.3: independent, non-default data. Mutation: return the original fields/notify/data
// rather than copies; changing the response would then corrupt the read model.
test("form definition responses clone field objects and notification recipients", () => {
  const definition = {
    id: "form-7", workspaceId: "ws-9", name: "Contact", slug: "contact",
    fields: [{ id: "email", label: "Email address", type: "email" as const, required: true, maxLength: 123, className: "wide", attributes: { placeholder: "Your email" } }],
    notify: { enabled: true, recipients: ["ops@example.org", "audit@example.org"] }, status: "active" as const,
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z", version: 4,
  };
  const single = toAdminFormDefinitionResponse({ definition });
  assert.deepEqual(single, { data: {
    id: "form-7", workspaceId: "ws-9", name: "Contact", slug: "contact",
    fields: [{ id: "email", label: "Email address", type: "email", required: true, maxLength: 123, className: "wide", attributes: { placeholder: "Your email" } }],
    mode: "builder", html: undefined,
    notify: { enabled: true, recipients: ["ops@example.org", "audit@example.org"] }, status: "active",
    // The optimistic-concurrency version rides every definition response (84d9382e): the next save names it.
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z", version: 4,
  } });
  const list = toAdminFormDefinitionListResponse({ definitions: [definition] });
  single.data.fields[0].label = "Changed in response";
  single.data.notify.enabled = false;
  single.data.notify.recipients.push("new@example.org");
  list.data[0].fields.push({ id: "extra", label: "Extra", type: "text", required: false });
  list.data[0].notify.recipients[0] = "replaced@example.org";
  assert.deepEqual(definition.fields, [{ id: "email", label: "Email address", type: "email", required: true, maxLength: 123, className: "wide", attributes: { placeholder: "Your email" } }]);
  assert.deepEqual(definition.notify, { enabled: true, recipients: ["ops@example.org", "audit@example.org"] });
  assert.deepEqual(toAdminFormDefinitionListResponse({ definitions: [] }), { data: [] });
});

// F4.1/F4.3/F4.6: these are wire-contract literals, including the legacy builder default
// above. Mutations rejected: hard-code mode to builder, or omit the authored HTML.
// Author Checklist: pure projections, fresh fixtures, unconditional exact assertions;
// no I/O, clocks, shared state, mocks, or persistence. Source mutations are prohibited by this batch.
for (const mode of ["html", "builder"] as const) {
  test(`form responses preserve explicit ${mode} authoring mode and markup`, () => {
    const definition = {
      id: "authored-8", workspaceId: "ws-9", name: "Feedback", slug: "feedback", mode,
      html: '<input name="message" required>',
      fields: [{ id: "message", label: "Message", type: "text" as const, required: true }],
      notify: { enabled: false, recipients: [] }, status: "active" as const, version: 1,
      createdAt: "2026-10-01T02:03:04Z", updatedAt: "2026-10-02T03:04:05Z",
    };
    const expected = {
      id: "authored-8", workspaceId: "ws-9", name: "Feedback", slug: "feedback", mode,
      html: '<input name="message" required>',
      fields: [{ id: "message", label: "Message", type: "text", required: true }],
      notify: { enabled: false, recipients: [] }, status: "active",
      createdAt: "2026-10-01T02:03:04Z", updatedAt: "2026-10-02T03:04:05Z", version: 1,
    };
    assert.deepEqual(toAdminFormDefinitionResponse({ definition }), { data: expected });
    assert.deepEqual(toAdminFormDefinitionListResponse({ definitions: [definition] }), { data: [expected] });
  });
}

test("submission envelopes preserve boolean data and pagination while copying the data bag", () => {
  const submission = {
    id: "submission-3", formDefinitionId: "form-7", workspaceId: "ws-9", data: { email: "ada@example.org", consent: false },
    sourceIp: "203.0.113.10", submittedAt: "2026-09-03T00:00:00Z", internal: "private",
  };
  const single = toAdminFormSubmissionResponse({ submission });
  const list = toAdminFormSubmissionListResponse({ items: [submission], nextCursor: "cursor-8" });
  assert.deepEqual(single, { data: {
    id: "submission-3", formDefinitionId: "form-7", workspaceId: "ws-9", data: { email: "ada@example.org", consent: false },
    sourceIp: "203.0.113.10", submittedAt: "2026-09-03T00:00:00Z",
  } });
  assert.deepEqual(list, { data: [{
    id: "submission-3", formDefinitionId: "form-7", workspaceId: "ws-9", data: { email: "ada@example.org", consent: false },
    sourceIp: "203.0.113.10", submittedAt: "2026-09-03T00:00:00Z",
  }], nextCursor: "cursor-8" });
  single.data.data.consent = true;
  list.data[0].data.email = "replaced@example.org";
  assert.deepEqual(submission.data, { email: "ada@example.org", consent: false });
  assert.deepEqual(toAdminFormSubmissionListResponse({ items: [], nextCursor: null }), { data: [], nextCursor: null });
});

// F6.2/F4.3: sibling above asserts a retained IP. Removing `?? ""` must fail here.
test("expired submission IPs serialize as an empty display string in detail and list responses", () => {
  const submission = {
    id: "expired-5", formDefinitionId: "form-7", workspaceId: "ws-9",
    data: { message: "Retained content", consent: false }, sourceIp: null,
    submittedAt: "2026-06-01T01:02:03Z",
  };
  const expected = {
    id: "expired-5", formDefinitionId: "form-7", workspaceId: "ws-9",
    data: { message: "Retained content", consent: false }, sourceIp: "",
    submittedAt: "2026-06-01T01:02:03Z",
  };
  assert.deepEqual(toAdminFormSubmissionResponse({ submission }), { data: expected });
  assert.deepEqual(toAdminFormSubmissionListResponse({ items: [submission], nextCursor: "older-6" }), {
    data: [expected], nextCursor: "older-6",
  });
  assert.equal(submission.sourceIp, null);
});

// F4.4: the status/body mapping and its per-error cases live in `@jini-ai/cms`
// (`write-error`); this pins the wire answer a mounted forms route gives for a recognised error
// and for an unknown one, which the Express-only `mapFormsWriteError` writer used to pin.
test("forms routes answer the engine's status and body for a recognised error, and a redacted 500 for an unknown one", async () => {
  const record = { id: "form", workspaceId: "ws", name: "Contact", slug: "contact", fields: [],
    notify: { enabled: false, recipients: [] }, status: "active" as const, createdAt: "t0", updatedAt: "t0", version: 1 };
  const repo = new InMemoryFormDefinitionRepo();
  await repo.create(record);
  let next = 0;
  const deps = { workspaceId: "ws", formDefinitionRepo: repo, formSubmissionRepo: new InMemoryFormSubmissionRepo(),
    executeCommand, changeSets: new InMemoryChangeSetRepo(), clock: { nowMs: () => 0 }, idGen: { newId: () => `id-${++next}` },
    authorize: async () => ({ allowed: true, reason: "test" }),
    removeFormSubmission: (async () => { throw new Error("unused"); }) as FormsRouteDeps["removeFormSubmission"],
    outbox: { enqueue: async () => {}, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} },
  } as unknown as FormsRouteDeps;
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "editor" }; next(); });
  registerAdminFormsAuthoringRoute({ app, deps });
  const path = "/api/admin/v1/workspaces/ws/forms/form/authoring";
  repo.update = async () => { throw new FormSlugConflictError({ message: "slug occupied", slug: "contact" }); };
  const known = await dispatchJsonRequest(app, "PUT", path, { name: "Edit" });
  assert.equal(known.status, 409);
  assert.deepEqual(known.body, { error: "slug occupied", code: "FORMS_SLUG_CONFLICT", details: { slug: "contact" } });
  repo.update = async () => { throw new Error("private db path"); };
  const unknown = await dispatchJsonRequest(app, "PUT", path, { name: "Edit" });
  assert.equal(unknown.status, 500);
  assert.equal(JSON.stringify(unknown.body).includes("private db path"), false);
});

test('invalid import classification is exposed beside answers on detail and list responses', () => {
  const submission = { id: 's', workspaceId: 'w', formDefinitionId: 'f', data: { email: '' }, sourceIp: null, submittedAt: 'now', validation: { status: 'invalid' as const, fieldErrors: [{ field: 'email', reason: 'required' }] } };
  assert.deepEqual(toAdminFormSubmissionResponse({ submission }).data.validation, submission.validation);
  assert.deepEqual(toAdminFormSubmissionListResponse({ items: [submission], nextCursor: null }).data[0]!.validation, submission.validation);
});

test('submission detail exports original evidence while paginated lists carry only its hash',()=>{
  const evidence={version:1 as const,fields:[{id:'accept',label:'Original consent',type:'checkbox' as const,required:true}],consent:[{fieldId:'accept',wording:'Original consent'}],schemaHash:'a'.repeat(64),capturedAt:'now',source:'native' as const};
  const submission={id:'s',workspaceId:'w',formDefinitionId:'f',data:{accept:true},sourceIp:null,submittedAt:'now',evidence};
  assert.deepEqual(toAdminFormSubmissionResponse({ submission }).data.evidence,evidence);
  const listed=toAdminFormSubmissionListResponse({items:[submission],nextCursor:null}).data[0]!;
  assert.equal(listed.schemaHash,evidence.schemaHash); assert.equal(listed.evidence,undefined);
});
