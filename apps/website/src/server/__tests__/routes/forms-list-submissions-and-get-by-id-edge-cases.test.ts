import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminFormsCreateRoute } from "../../inbound/admin-http/routes/forms/create.js";
import { registerAdminFormsGetRoute } from "../../inbound/admin-http/routes/forms/get-by-id.js";
import { registerAdminFormsListSubmissionsRoute } from "../../inbound/admin-http/routes/forms/list-submissions.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Coverage-gap-fill for `forms/list-submissions.ts` and `forms/get-by-id.ts` — the branches
 * `forms-auth.test.ts`/`forms-submissions.test.ts`/`forms-admin-crud.test.ts` don't already reach:
 * workspace-id mismatch, `?limit=`/`?cursor=` validation, and the generic 500/`req.params ?? ""`
 * fallbacks (this repo's documented direct-handler-invocation convention).
 */
function buildTestApp(deps: RouteDeps = createRouteDeps()): { app: express.Express; deps: RouteDeps } {
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminFormsCreateRoute(app, deps);
  registerAdminFormsGetRoute(app, deps);
  registerAdminFormsListSubmissionsRoute(app, deps);
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

// ---------------------------------------------------------------------------
// forms/get-by-id.ts
// ---------------------------------------------------------------------------

test("forms get-by-id: a workspace id that is not this site's is 404 (checked before authorize)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/forms/whatever`, { headers: { cookie } });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "workspace was not found" });
});

test("forms get-by-id: an unknown id/slug returns FORMS_DEFINITION_NOT_FOUND", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/no-such-form`, { headers: { cookie } });
  assert.equal(res.status, 404);
  assert.equal((await res.json() as { code: string }).code, "FORMS_DEFINITION_NOT_FOUND");
});

test("forms get-by-id: 500s (generic, message swallowed) when the repo explodes", async (t) => {
  const deps = createRouteDeps();
  deps.formDefinitionRepo.findBySlug = async () => {
    throw new Error("db exploded");
  };
  const { app } = buildTestApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/whatever`, { headers: { cookie } });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error", code: "INTERNAL_ERROR" });
});

test("forms get-by-id: undefined workspaceId/formId params fall back via direct handler invocation (unreachable through real routing)", async (t) => {
  const { app } = buildTestApp();
  await bootAuthenticated(app, t);
  const handler = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/forms/:formId");

  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: undefined, formId: undefined } } as unknown as Parameters<typeof handler>[0];
  await handler(req, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

// ---------------------------------------------------------------------------
// forms/list-submissions.ts
// ---------------------------------------------------------------------------

test("forms list-submissions: a workspace id that is not this site's is 404 (checked before authorize)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/forms/whatever/submissions`, {
    headers: { cookie },
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "workspace was not found" });
});

test("forms list-submissions: ?limit= out of [1,100] or non-integer is 400 FORMS_FIELD_VALIDATION_ERROR", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const formId = await createDefinition(baseUrl, cookie, "limit-form");

  for (const limit of ["0", "101", "abc", "1.5"]) {
    const res = await fetch(
      `${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}/submissions?limit=${limit}`,
      { headers: { cookie } }
    );
    assert.equal(res.status, 400, `limit=${limit} should be rejected`);
    const body = (await res.json()) as { code: string; details: { fieldErrors: Array<{ field: string; reason: string }> } };
    assert.equal(body.code, "FORMS_FIELD_VALIDATION_ERROR");
    assert.equal(body.details.fieldErrors[0].field, "limit");
  }

  // Boundaries are both accepted.
  for (const limit of ["1", "100"]) {
    const res = await fetch(
      `${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}/submissions?limit=${limit}`,
      { headers: { cookie } }
    );
    assert.equal(res.status, 200, `limit=${limit} should be accepted`);
  }
});

test("forms list-submissions: a non-string ?cursor= (repeated query param, parsed as an array) is 400 FORMS_FIELD_VALIDATION_ERROR", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const formId = await createDefinition(baseUrl, cookie, "cursor-form");

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}/submissions?cursor=a&cursor=b`,
    { headers: { cookie } }
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string; details: { fieldErrors: Array<{ field: string; reason: string }> } };
  assert.equal(body.code, "FORMS_FIELD_VALIDATION_ERROR");
  assert.equal(body.details.fieldErrors[0].field, "cursor");
});

test("forms list-submissions: an explicit valid ?limit=&cursor= pair is threaded through to the repo", async (t) => {
  const deps = createRouteDeps();
  let seen: { limit?: number; cursor?: string } = {};
  const realListByDefinition = deps.formSubmissionRepo.listByDefinition.bind(deps.formSubmissionRepo);
  deps.formSubmissionRepo.listByDefinition = async (params) => {
    seen = { limit: params.limit, cursor: params.cursor };
    return realListByDefinition(params);
  };
  const { app } = buildTestApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const formId = await createDefinition(baseUrl, cookie, "pagination-form");

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}/submissions?limit=5&cursor=some-cursor`,
    { headers: { cookie } }
  );
  assert.equal(res.status, 200);
  assert.equal(seen.limit, 5);
  assert.equal(seen.cursor, "some-cursor");
});

test("forms list-submissions: 500s (generic, message swallowed) when the repo explodes", async (t) => {
  const deps = createRouteDeps();
  const { app } = buildTestApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const formId = await createDefinition(baseUrl, cookie, "explode-form");
  deps.formSubmissionRepo.listByDefinition = async () => {
    throw new Error("db exploded");
  };

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}/submissions`, {
    headers: { cookie },
  });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error", code: "INTERNAL_ERROR" });
});

test("forms list-submissions: undefined workspaceId/formId params fall back via direct handler invocation (unreachable through real routing)", async (t) => {
  const { app } = buildTestApp();
  await bootAuthenticated(app, t);
  const handler = extractRouteHandler(
    app,
    "get",
    "/api/admin/v1/workspaces/:workspaceId/forms/:formId/submissions"
  );

  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: undefined, formId: undefined }, query: {} } as unknown as Parameters<typeof handler>[0];
  await handler(req, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});
