import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server.js";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminFormsCreateRoute } from "../../inbound/admin-http/routes/forms/create.js";
import { registerAdminFormsDeleteSubmissionRoute } from "../../inbound/admin-http/routes/forms/delete-submission.js";
import { registerAdminFormsGetRoute } from "../../inbound/admin-http/routes/forms/get-by-id.js";
import { registerAdminFormsGetSubmissionRoute } from "../../inbound/admin-http/routes/forms/get-submission.js";
import { registerAdminFormsListRoute } from "../../inbound/admin-http/routes/forms/list.js";
import { registerAdminFormsListSubmissionsRoute } from "../../inbound/admin-http/routes/forms/list-submissions.js";
import { registerAdminFormsUpdateRoute } from "../../inbound/admin-http/routes/forms/update.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Route-level auth tests for all 7 admin `forms` routes (SPEC-010 REQ-15, AC-21/22/23,
 * INV-06). Each route is exercised without its matching permission (a principal holding zero
 * grants) -> 403 FORBIDDEN, and then again after a matching grant -> succeeds.
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
  registerAdminFormsListSubmissionsRoute(app, deps);
  registerAdminFormsGetSubmissionRoute(app, deps);
  registerAdminFormsDeleteSubmissionRoute(app, deps);
  return { app, deps };
}

let grantCounter = 0;

/** Registers a principal holding ONLY the given permission strings (or none). Mirrors `admin-menus-routes.test.ts`'s pattern. */
async function loginWithPermissions(deps: RouteDeps, baseUrl: string, permissions: readonly string[]): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-forms-${suffix}`;
  const policyId = `grant-policy-forms-${suffix}`;
  const username = `grant-forms-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: `Grants: ${permissions.join(", ") || "(none)"}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash({ password: "grant-pw" }),
  });
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: `grant-policy-${suffix}`, isBuiltin: false, isFrozen: false });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({
      id: `grant-pp-${suffix}-${permission}`,
      workspaceId: deps.workspaceId,
      policyId,
      permission,
      resourceType: null,
      constraintJson: null,
    });
  }
  await deps.principalPolicyRepo.save({ id: `grant-link-${suffix}`, workspaceId: deps.workspaceId, principalId, policyId });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "grant-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("admin forms routes: AC-21 — a principal lacking admin.forms.manage is denied 403 on list/create/get/update", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  // Seed a definition with the owner cookie first.
  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ name: "Contact", slug: "contact", fields: [{ id: "name", label: "Name", type: "text", required: true }] }),
  });
  const { data: definition } = (await createRes.json()) as { data: { id: string } };

  const bareCookie = await loginWithPermissions(deps, baseUrl, []);

  const listRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, { headers: { cookie: bareCookie } });
  assert.equal(listRes.status, 403);

  const createRes2 = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ name: "X", slug: "x", fields: [{ id: "name", label: "Name", type: "text", required: true }] }),
  });
  assert.equal(createRes2.status, 403);

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${definition.id}`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(getRes.status, 403);

  const updateRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${definition.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ status: "disabled" }),
  });
  assert.equal(updateRes.status, 403);

  // A grant restores access, proving the gate is real (not a permanently-broken route).
  const grantedCookie = await loginWithPermissions(deps, baseUrl, ["admin.forms.manage"]);
  const grantedRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    headers: { cookie: grantedCookie },
  });
  assert.equal(grantedRes.status, 200);
});

test("admin forms routes: AC-22 — a principal lacking admin.forms.submissions.read is denied 403 on list/get submissions", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ name: "Contact", slug: "contact-2", fields: [{ id: "name", label: "Name", type: "text", required: true }] }),
  });
  const { data: definition } = (await createRes.json()) as { data: { id: string } };

  const bareCookie = await loginWithPermissions(deps, baseUrl, []);

  const listSubsRes = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${definition.id}/submissions`,
    { headers: { cookie: bareCookie } }
  );
  assert.equal(listSubsRes.status, 403);

  const getSubRes = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${definition.id}/submissions/whatever`,
    { headers: { cookie: bareCookie } }
  );
  assert.equal(getSubRes.status, 403);

  const grantedCookie = await loginWithPermissions(deps, baseUrl, ["admin.forms.submissions.read"]);
  const grantedRes = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${definition.id}/submissions`,
    { headers: { cookie: grantedCookie } }
  );
  assert.equal(grantedRes.status, 200);
});

test("admin forms routes: AC-23 — a principal lacking admin.forms.submissions.delete is denied 403, submission unchanged", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ name: "Contact", slug: "contact-3", fields: [{ id: "name", label: "Name", type: "text", required: true }] }),
  });
  const { data: definition } = (await createRes.json()) as { data: { id: string } };

  const submission = { id: "sub-delete-auth", workspaceId: deps.workspaceId, formDefinitionId: definition.id,
    data: { name: "Ada" }, sourceIp: "1.1.1.1", submittedAt: deps.clock.nowIso() };
  await deps.formSubmissionRepo.create(submission);

  const bareCookie = await loginWithPermissions(deps, baseUrl, []);

  const deleteRes = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${definition.id}/submissions/${submission.id}`,
    { method: "DELETE", headers: { cookie: bareCookie } }
  );
  assert.equal(deleteRes.status, 403);
  assert.equal((await deleteRes.json()).details.permission, "admin.forms.submissions.delete");
  const readCookie = await loginWithPermissions(deps, baseUrl, ["admin.forms.submissions.read"]);
  const readOnlyDelete = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${definition.id}/submissions/${submission.id}`, {
    method: "DELETE", headers: { cookie: readCookie },
  });
  assert.equal(readOnlyDelete.status, 403);
  assert.equal((await readOnlyDelete.json()).details.permission, "admin.forms.submissions.delete");
  assert.deepEqual(await deps.formSubmissionRepo.findById({ workspaceId: deps.workspaceId, id: submission.id }), submission);
  const listRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${definition.id}/submissions`, { headers: { cookie: ownerCookie } });
  assert.equal(listRes.status, 200);
  assert.deepEqual((await listRes.json()).data.map((row: { id: string }) => row.id), [submission.id]);

  const deleteCookie = await loginWithPermissions(deps, baseUrl, ["admin.forms.submissions.delete"]);
  const grantedRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${definition.id}/submissions/${submission.id}`, {
    method: "DELETE", headers: { cookie: deleteCookie },
  });
  assert.equal(grantedRes.status, 204);
  assert.equal(await deps.formSubmissionRepo.findById({ workspaceId: deps.workspaceId, id: submission.id }), null);
  const afterRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${definition.id}/submissions`, { headers: { cookie: ownerCookie } });
  assert.equal(afterRes.status, 200);
  assert.deepEqual((await afterRes.json()).data, []);
});

test("admin forms routes: manage and submission-read permissions are separate on every route", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/forms`;
  const createRes = await fetch(base, { method: "POST", headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ name: "Contact", slug: "matrix-contact", fields: [{ id: "name", label: "Name", type: "text", required: true }] }) });
  assert.equal(createRes.status, 201);
  const definition = (await createRes.json()).data;
  await deps.formSubmissionRepo.create({ id: "matrix-sub", workspaceId: deps.workspaceId, formDefinitionId: definition.id,
    data: { name: "Ada" }, sourceIp: "1.1.1.1", submittedAt: deps.clock.nowIso() });

  const routes = [
    { method: "GET", path: "", permission: "admin.forms.manage", status: 200 },
    { method: "POST", path: "", permission: "admin.forms.manage", status: 201,
      body: { name: "New", slug: "matrix-new", fields: [{ id: "name", label: "Name", type: "text", required: true }] } },
    { method: "GET", path: `/${definition.id}`, permission: "admin.forms.manage", status: 200 },
    { method: "PUT", path: `/${definition.id}`, permission: "admin.forms.manage", status: 200, body: { name: "Updated Contact" } },
    { method: "GET", path: `/${definition.id}/submissions`, permission: "admin.forms.submissions.read", status: 200 },
    { method: "GET", path: `/${definition.id}/submissions/matrix-sub`, permission: "admin.forms.submissions.read", status: 200 },
  ];
  for (const permission of ["admin.forms.manage", "admin.forms.submissions.read", "admin.forms.submissions.delete"]) {
    const cookie = await loginWithPermissions(deps, baseUrl, [permission]);
    for (const route of routes) {
      const res = await fetch(`${base}${route.path}`, { method: route.method, headers: { "content-type": "application/json", cookie },
        ...(route.body ? { body: JSON.stringify(route.body) } : {}) });
      const body = await res.json();
      assert.equal(res.status, permission === route.permission ? route.status : 403, `${permission}: ${route.method} ${route.path}`);
      if (permission !== route.permission) assert.equal(body.details.permission, route.permission);
      else if (route.path.endsWith("matrix-sub")) assert.deepEqual(body.data.data, { name: "Ada" });
    }
  }
});
