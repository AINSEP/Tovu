import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server.js";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminFormsCreateRoute } from "../../inbound/admin-http/routes/forms/create.js";
import { registerAdminFormsDeleteSubmissionRoute } from "../../inbound/admin-http/routes/forms/delete-submission.js";
import { registerAdminFormsGetSubmissionRoute } from "../../inbound/admin-http/routes/forms/get-submission.js";
import { registerAdminFormsListSubmissionsRoute } from "../../inbound/admin-http/routes/forms/list-submissions.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Route-level tests for the admin `forms` submissions surface (SPEC-010 REQ-13/14, AC-19/20,
 * EC-08, behavior.spec.md §2.1). Submissions list is newest-first, get returns full field values,
 * delete permanently removes a submission (404s + disappears from list), empty-list state.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminFormsCreateRoute(app, deps);
  registerAdminFormsListSubmissionsRoute(app, deps);
  registerAdminFormsGetSubmissionRoute(app, deps);
  registerAdminFormsDeleteSubmissionRoute(app, deps);
  return { app, deps };
}

async function createDefinition(baseUrl: string, cookie: string, slug: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Contact", slug, fields: [{ id: "name", label: "Name", type: "text", required: true }] }),
  });
  const { data } = (await res.json()) as { data: { id: string } };
  return data.id;
}

test("admin forms submissions: EC-08 — an empty list is a valid 200, not an error", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const formId = await createDefinition(baseUrl, cookie, "empty-form");

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}/submissions`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: unknown[]; nextCursor: string | null };
  assert.deepEqual(body.data, []);
  assert.equal(body.nextCursor, null);
  void deps;
});

test("admin forms submissions: AC-19/behavior.spec.md §2.1 — list is newest-first", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const formId = await createDefinition(baseUrl, cookie, "ordered-form");

  await deps.formSubmissionRepo.create({
    id: "sub-old",
    workspaceId: deps.workspaceId,
    formDefinitionId: formId,
    data: { name: "Old" },
    sourceIp: "1.1.1.1",
    submittedAt: "2026-07-13T00:00:00.000Z",
  });
  await deps.formSubmissionRepo.create({
    id: "sub-new",
    workspaceId: deps.workspaceId,
    formDefinitionId: formId,
    data: { name: "New" },
    sourceIp: "1.1.1.1",
    submittedAt: "2026-07-13T00:05:00.000Z",
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}/submissions`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: Array<{ id: string }> };
  assert.deepEqual(body.data.map((s) => s.id), ["sub-new", "sub-old"]);
});

test("admin forms submissions: AC-15 — get returns full field values, form definition id, source IP, and timestamp", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const formId = await createDefinition(baseUrl, cookie, "get-form");

  await deps.formSubmissionRepo.create({
    id: "sub-1",
    workspaceId: deps.workspaceId,
    formDefinitionId: formId,
    data: { name: "Ada" },
    sourceIp: "9.9.9.9",
    submittedAt: "2026-07-13T00:00:00.000Z",
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}/submissions/sub-1`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { formDefinitionId: string; data: unknown; sourceIp: string; submittedAt: string } };
  assert.equal(body.data.formDefinitionId, formId);
  assert.deepEqual(body.data.data, { name: "Ada" });
  assert.equal(body.data.sourceIp, "9.9.9.9");
  assert.equal(body.data.submittedAt, "2026-07-13T00:00:00.000Z");
});

test("admin forms submissions: unknown submission id returns FORMS_SUBMISSION_NOT_FOUND", async (t) => {
  const { app, deps: _deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const formId = await createDefinition(baseUrl, cookie, "notfound-form");

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}/submissions/nope`, {
    headers: { cookie },
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORMS_SUBMISSION_NOT_FOUND");
});

test("admin forms submissions: list/get/delete resolve by slug — the Submissions tab URL is /admin/forms/:slug, and FormEditor.tsx passes that same route param straight through as `formId` to all three submissions calls (see use-form-submissions.hooks.ts / use-form-submission-detail.hooks.ts)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const formId = await createDefinition(baseUrl, cookie, "slug-form");

  await deps.formSubmissionRepo.create({
    id: "sub-slug",
    workspaceId: deps.workspaceId,
    formDefinitionId: formId,
    data: { name: "Ada" },
    sourceIp: "1.1.1.1",
    submittedAt: "2026-07-13T00:00:00.000Z",
  });

  const listRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/slug-form/submissions`, {
    headers: { cookie },
  });
  assert.equal(listRes.status, 200);
  const listBody = (await listRes.json()) as { data: Array<{ id: string }> };
  assert.deepEqual(listBody.data.map((s) => s.id), ["sub-slug"]);

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/slug-form/submissions/sub-slug`, {
    headers: { cookie },
  });
  assert.equal(getRes.status, 200);
  const getBody = (await getRes.json()) as { data: { id: string } };
  assert.equal(getBody.data.id, "sub-slug");

  const deleteRes = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/slug-form/submissions/sub-slug`,
    { method: "DELETE", headers: { cookie } }
  );
  assert.equal(deleteRes.status, 204);
});

test("admin forms submissions: unknown formId (neither a real slug nor id) returns FORMS_DEFINITION_NOT_FOUND on list", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/no-such-form/submissions`, {
    headers: { cookie },
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORMS_DEFINITION_NOT_FOUND");
});

test("admin forms submissions: AC-20 — delete permanently removes it (404s + disappears from list)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const formId = await createDefinition(baseUrl, cookie, "delete-form");

  await deps.formSubmissionRepo.create({
    id: "sub-del",
    workspaceId: deps.workspaceId,
    formDefinitionId: formId,
    data: { name: "Ada" },
    sourceIp: "1.1.1.1",
    submittedAt: "2026-07-13T00:00:00.000Z",
  });

  const deleteRes = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}/submissions/sub-del`,
    { method: "DELETE", headers: { cookie } }
  );
  assert.equal(deleteRes.status, 204);

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}/submissions/sub-del`, {
    headers: { cookie },
  });
  assert.equal(getRes.status, 404);

  const listRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}/submissions`, {
    headers: { cookie },
  });
  const listBody = (await listRes.json()) as { data: unknown[] };
  assert.deepEqual(listBody.data, []);
});
