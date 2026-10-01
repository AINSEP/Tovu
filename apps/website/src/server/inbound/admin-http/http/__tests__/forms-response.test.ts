import assert from "node:assert/strict";
import test from "node:test";

import { ForbiddenError } from "@jini-ai/cms/core";
import { FormDefinitionNotFoundError, FormFieldValidationError, FormSlugConflictError, FormSubmissionNotFoundError } from "#src/features/forms/index";
import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import {
  mapFormsWriteError, toAdminFormDefinitionResponse, toAdminFormDefinitionListResponse,
  toAdminFormSubmissionResponse, toAdminFormSubmissionListResponse,
} from "../forms.js";

// F4.1/F4.3: independent, non-default data. Mutation: return the original fields/notify/data
// rather than copies; changing the response would then corrupt the read model.
test("form definition responses clone field objects and notification recipients", () => {
  const definition = {
    id: "form-7", workspaceId: "ws-9", name: "Contact", slug: "contact",
    fields: [{ id: "email", label: "Email address", type: "email" as const, required: true, maxLength: 123, className: "wide", attributes: { placeholder: "Your email" } }],
    notify: { enabled: true, recipients: ["ops@example.org", "audit@example.org"] }, status: "active" as const,
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z", version: 4,
  };
  const single = toAdminFormDefinitionResponse(definition);
  assert.deepEqual(single, { data: {
    id: "form-7", workspaceId: "ws-9", name: "Contact", slug: "contact",
    fields: [{ id: "email", label: "Email address", type: "email", required: true, maxLength: 123, className: "wide", attributes: { placeholder: "Your email" } }],
    notify: { enabled: true, recipients: ["ops@example.org", "audit@example.org"] }, status: "active",
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z",
  } });
  const list = toAdminFormDefinitionListResponse([definition]);
  single.data.fields[0].label = "Changed in response";
  single.data.notify.enabled = false;
  single.data.notify.recipients.push("new@example.org");
  list.data[0].fields.push({ id: "extra", label: "Extra", type: "text", required: false });
  list.data[0].notify.recipients[0] = "replaced@example.org";
  assert.deepEqual(definition.fields, [{ id: "email", label: "Email address", type: "email", required: true, maxLength: 123, className: "wide", attributes: { placeholder: "Your email" } }]);
  assert.deepEqual(definition.notify, { enabled: true, recipients: ["ops@example.org", "audit@example.org"] });
  assert.deepEqual(toAdminFormDefinitionListResponse([]), { data: [] });
});

test("submission envelopes preserve boolean data and pagination while copying the data bag", () => {
  const submission = {
    id: "submission-3", formDefinitionId: "form-7", workspaceId: "ws-9", data: { email: "ada@example.org", consent: false },
    sourceIp: "203.0.113.10", submittedAt: "2026-09-03T00:00:00Z", internal: "private",
  };
  const single = toAdminFormSubmissionResponse(submission);
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

// F4.4: one typed failure at a time. Mutation: drop details or map a not-found error to 500.
const errorCases = [
  { label: "forbidden", error: new ForbiddenError("write denied", "forms.write", "no_grant"), status: 403,
    body: { error: "write denied", code: "FORBIDDEN", details: { permission: "forms.write", reason: "no_grant" } } },
  { label: "field validation", error: new FormFieldValidationError("invalid field", [{ field: "email", reason: "unsupported type" }]), status: 400,
    body: { error: "invalid field", code: "FORMS_FIELD_VALIDATION_ERROR", details: { fieldErrors: [{ field: "email", reason: "unsupported type" }] } } },
  { label: "slug conflict", error: new FormSlugConflictError("slug occupied", "contact"), status: 409,
    body: { error: "slug occupied", code: "FORMS_SLUG_CONFLICT", details: { slug: "contact" } } },
  { label: "definition not found", error: new FormDefinitionNotFoundError("definition absent"), status: 404,
    body: { error: "definition absent", code: "FORMS_DEFINITION_NOT_FOUND" } },
  { label: "submission not found", error: new FormSubmissionNotFoundError("submission absent"), status: 404,
    body: { error: "submission absent", code: "FORMS_SUBMISSION_NOT_FOUND" } },
];
for (const { label, error, status, body } of errorCases) {
  test(`forms error mapper sends exact ${label} status and details`, () => {
    const { res, capture } = createCapturingResponse();
    assert.equal(mapFormsWriteError(error, res), true);
    assert.deepEqual(capture, { statusCode: status, jsonBody: body });
  });
}

test("unknown forms errors leave the response untouched for the caller's generic fallback", () => {
  const { res, capture } = createCapturingResponse();
  assert.equal(mapFormsWriteError(new Error("private db path"), res), false);
  assert.deepEqual(capture, { statusCode: 200, jsonBody: undefined });
});
