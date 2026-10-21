import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "../helpers/http-test-server.js";

import express from "express";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminFormsCreateRoute } from "../../inbound/admin-http/routes/forms/create.js";
import { registerAdminFormsGetRoute } from "../../inbound/admin-http/routes/forms/get-by-id.js";
import { registerAdminFormsListRoute } from "../../inbound/admin-http/routes/forms/list.js";
import { registerAdminFormsUpdateRoute } from "../../inbound/admin-http/routes/forms/update.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Route-level tests for the admin `forms` definition-CRUD HTTP surface (SPEC-010 REQ-01..04,
 * AC-01/02/03/04/05/06). Mirrors `admin-menus-routes.test.ts`'s real-auth pattern:
 * `createRouteDeps()` for a real `authorize()` + identity repos, real login before hitting routes.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminFormsListRoute(app, deps);
  registerAdminFormsCreateRoute(app, deps);
  registerAdminFormsGetRoute(app, deps);
  registerAdminFormsUpdateRoute(app, deps);
  return { app, deps };
}

test("admin forms PUT refuses a different workspace without changing the definition", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/forms`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Protected form", slug: "protected-form", fields: [
      { id: "name", label: "Name", type: "text", required: true },
    ] }),
  });
  assert.equal(response.status, 201);
  const { data } = await response.json() as { data: { id: string } };
  const target = { workspaceId: deps.workspaceId, id: data.id };
  const before = structuredClone(await deps.formDefinitionRepo.findById(target));
  assert.ok(before);

  const refused = await fetch(`${baseUrl}/api/admin/v1/workspaces/other-workspace/forms/${data.id}`, {
    method: "PUT", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Cross-workspace change" }),
  });

  assert.equal(refused.status, 404);
  assert.deepEqual(await refused.json(), { error: "workspace was not found" });
  assert.deepEqual(await deps.formDefinitionRepo.findById(target), before);
});

test("admin forms PUT treats a nullish body as a no-op and preserves the definition", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/forms`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Unchanged form", slug: "unchanged-form", fields: [
      { id: "name", label: "Name", type: "text", required: true },
    ] }),
  });
  assert.equal(response.status, 201);
  const created = await response.json() as { data: { id: string } };
  const target = { workspaceId: deps.workspaceId, id: created.data.id };
  const before = structuredClone(await deps.formDefinitionRepo.findById(target));
  assert.ok(before);
  const handler = extractRouteHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/forms/:formId");
  // express.json() supplies {} for a bodyless HTTP request; the existing direct-handler
  // helper lets the route's nullish-body contract be exercised without that substitution.
  for (const body of [undefined, null]) {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: await deps.ownerPrincipalId };
    await handler({ params: { workspaceId: deps.workspaceId, formId: target.id }, body }, res);

    assert.equal(capture.statusCode, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(capture.jsonBody)), created);
    assert.deepEqual(await deps.formDefinitionRepo.findById(target), before);
  }
});

test("admin forms PUT with a missing form id param answers the coded not-found 404 rather than crashing", async () => {
  const { app, deps } = buildTestApp();
  await deps.identityReady;
  const handler = extractRouteHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/forms/:formId");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: await deps.ownerPrincipalId };
  // Required Express params are populated over HTTP (the route's old `?? ""` fallback for this
  // was removed as dead code); use the shared direct-call seam for the missing-id error
  // contract, as the neighbouring get-by-id edge-case suite does.
  await handler({ params: { workspaceId: deps.workspaceId }, body: {} }, res);

  assert.equal(capture.statusCode, 404);
  const body = capture.jsonBody as { error: string; code: string };
  assert.equal(body.code, "FORMS_DEFINITION_NOT_FOUND");
  assert.equal(body.error, "form definition 'undefined' was not found");
});

test("admin forms routes: create -> list -> get -> update golden path (AC-01/AC-02)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "Contact",
      slug: "contact",
      fields: [
        { id: "name", label: "Name", type: "text", required: true },
        { id: "email", label: "Email", type: "email", required: false },
      ],
      notify: { enabled: true, recipients: ["ops@example.com"] },
    }),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { data: { id: string; status: string } };
  assert.equal(created.data.status, "active");
  const formId = created.data.id;

  const listRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, { headers: { cookie } });
  assert.equal(listRes.status, 200);
  const listed = (await listRes.json()) as { data: Array<{ id: string }> };
  assert.equal(listed.data.length, 1);
  assert.equal(listed.data[0].id, formId);

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}`, {
    headers: { cookie },
  });
  assert.equal(getRes.status, 200);
  const fetched = (await getRes.json()) as {
    data: { name: string; slug: string; fields: unknown[]; notify: { enabled: boolean; recipients: string[] } };
  };
  assert.equal(fetched.data.name, "Contact");
  assert.equal(fetched.data.slug, "contact");
  assert.deepEqual(fetched.data.notify, { enabled: true, recipients: ["ops@example.com"] });
  assert.deepEqual(fetched.data.fields, [
    { id: "name", label: "Name", type: "text", required: true },
    { id: "email", label: "Email", type: "email", required: false },
  ]);
  const updateRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Contact updated", notify: { enabled: false, recipients: ["new@example.com", "alerts@example.com"] } }),
  });
  assert.equal(updateRes.status, 200);
  const reread = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${formId}`, { headers: { cookie } });
  assert.equal(reread.status, 200);
  const after = (await reread.json()) as { data: { name: string; fields: unknown[]; notify: unknown } };
  assert.equal(after.data.name, "Contact updated");
  assert.deepEqual(after.data.notify, { enabled: false, recipients: ["new@example.com", "alerts@example.com"] });
  assert.deepEqual(after.data.fields, fetched.data.fields);

});

test("admin forms routes: reusing a create Idempotency-Key returns DUPLICATE_COMMAND", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const request = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      "Idempotency-Key": "form-create-idempotency-retry",
    },
    body: JSON.stringify({
      name: "Idempotent Contact",
      slug: "idempotent-contact",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    }),
  };

  const first = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, request);
  assert.equal(first.status, 201);

  const second = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, request);
  assert.equal(second.status, 409);
  const body = (await second.json()) as { code: string; changeSetId: string };
  assert.equal(body.code, "DUPLICATE_COMMAND");
  assert.ok(body.changeSetId);
});

// Jini 20d4e8a2 added date to the field-type registry; AC-03 still covers unsupported types.
test("admin forms routes: AC-03 — type:unsupported-field is rejected, nothing created", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "Contact",
      slug: "contact",
      fields: [{ id: "when", label: "When", type: "unsupported-field", required: false }],
    }),
  });
  assert.equal(createRes.status, 400);
  const body = (await createRes.json()) as { code: string };
  assert.equal(body.code, "FORMS_FIELD_VALIDATION_ERROR");

  const listRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, { headers: { cookie } });
  const listed = (await listRes.json()) as { data: unknown[] };
  assert.equal(listed.data.length, 0);
});

test("admin forms routes: AC-04 — duplicate slug is rejected with FORMS_SLUG_CONFLICT, existing definition unchanged", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const body = JSON.stringify({
    name: "Contact",
    slug: "contact",
    fields: [{ id: "name", label: "Name", type: "text", required: true }],
  });
  const first = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body,
  });
  assert.equal(first.status, 201);

  const second = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "Contact 2",
      slug: "contact",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    }),
  });
  assert.equal(second.status, 409);
  const secondBody = (await second.json()) as { code: string };
  assert.equal(secondBody.code, "FORMS_SLUG_CONFLICT");

  const listRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, { headers: { cookie } });
  const listed = (await listRes.json()) as { data: Array<{ name: string }> };
  assert.equal(listed.data.length, 1);
  assert.equal(listed.data[0].name, "Contact");
});

test("admin forms routes: AC-05 — disabling a definition is reflected on GET (submission-rejection is proven in forms-submit.test.ts)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "Contact",
      slug: "contact",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    }),
  });
  const created = (await createRes.json()) as { data: { id: string } };

  const updateRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${created.data.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ status: "disabled" }),
  });
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()) as { data: { status: string } };
  assert.equal(updated.data.status, "disabled");

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${created.data.id}`, {
    headers: { cookie },
  });
  assert.equal(getRes.status, 200);
  const fetched = (await getRes.json()) as { data: { status: string } };
  assert.equal(fetched.data.status, "disabled");
});

test("admin forms routes: AC-06 — no delete route exists for definitions (only status toggles)", async (t) => {
  const app = createApp(createRouteDeps());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "Contact",
      slug: "contact",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    }),
  });
  const created = (await createRes.json()) as { data: { id: string } };

  const deleteRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${created.data.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(deleteRes.status, 404);
  const reread = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${created.data.id}`, { headers: { cookie } });
  assert.equal(reread.status, 200);
  const remaining = (await reread.json()) as { data: { id: string; name: string } };
  assert.equal(remaining.data.id, created.data.id);
  assert.equal(remaining.data.name, "Contact");
});

test("admin forms routes: behavior.spec.md §1.1 — a PUT body containing slug never changes the stored slug", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "Contact",
      slug: "contact",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    }),
  });
  const created = (await createRes.json()) as { data: { id: string } };

  const updateRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${created.data.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Renamed", slug: "different-slug" }),
  });
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()) as { data: { slug: string; name: string } };
  assert.equal(updated.data.slug, "contact");
  assert.equal(updated.data.name, "Renamed");
});

test("admin forms routes: ui-fixes-backlog.md #8 — GET resolves by slug, and an old id-based bookmark still resolves too", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "Contact",
      slug: "contact-us",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    }),
  });
  const created = (await createRes.json()) as { data: { id: string; slug: string } };

  const bySlug = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/contact-us`, { headers: { cookie } });
  assert.equal(bySlug.status, 200);
  const bySlugBody = (await bySlug.json()) as { data: { id: string; name: string } };
  assert.equal(bySlugBody.data.id, created.data.id);
  assert.equal(bySlugBody.data.name, "Contact");

  const byId = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${created.data.id}`, {
    headers: { cookie },
  });
  assert.equal(byId.status, 200);
  const byIdBody = (await byId.json()) as { data: { slug: string } };
  assert.equal(byIdBody.data.slug, "contact-us");
});

test("admin forms routes: the slug 'new' is reserved (would collide with the admin create-form URL) and is rejected on create", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "New",
      slug: "new",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    }),
  });
  assert.equal(createRes.status, 400);
  const body = (await createRes.json()) as { code: string };
  assert.equal(body.code, "FORMS_FIELD_VALIDATION_ERROR");

  const listRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, { headers: { cookie } });
  const listed = (await listRes.json()) as { data: unknown[] };
  assert.equal(listed.data.length, 0);
});

test("admin forms routes: behavior.spec.md §1.2 — an update patch omitting an existing field id is rejected", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "Contact",
      slug: "contact",
      fields: [
        { id: "name", label: "Name", type: "text", required: true },
        { id: "email", label: "Email", type: "email", required: true },
      ],
    }),
  });
  const created = (await createRes.json()) as { data: { id: string } };

  const updateRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${created.data.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fields: [{ id: "name", label: "Name", type: "text", required: true }] }),
  });
  assert.equal(updateRes.status, 400);
  const body = (await updateRes.json()) as { code: string };
  assert.equal(body.code, "FORMS_FIELD_VALIDATION_ERROR");
});
