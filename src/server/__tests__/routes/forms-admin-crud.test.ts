import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server.js";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminFormsCreateRoute } from "../../routes/admin/forms/create.js";
import { registerAdminFormsGetRoute } from "../../routes/admin/forms/get-by-id.js";
import { registerAdminFormsListRoute } from "../../routes/admin/forms/list.js";
import { registerAdminFormsUpdateRoute } from "../../routes/admin/forms/update.js";
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

test("admin forms routes: create -> list -> get -> update golden path (AC-01/AC-02)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "Contact",
      slug: "contact",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
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
    data: { name: string; slug: string; notify: { enabled: boolean; recipients: string[] } };
  };
  assert.equal(fetched.data.name, "Contact");
  assert.equal(fetched.data.slug, "contact");
  assert.deepEqual(fetched.data.notify, { enabled: true, recipients: ["ops@example.com"] });
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

test("admin forms routes: AC-03 — type:date is rejected, nothing created", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: "Contact",
      slug: "contact",
      fields: [{ id: "when", label: "When", type: "date", required: false }],
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

  const deleteRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${created.data.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  // No DELETE handler is registered for this path — Express responds 404 (route not found).
  assert.equal(deleteRes.status, 404);
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
