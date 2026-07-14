import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../app";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerAdminFormsCreateRoute } from "../../routes/admin/forms/create";
import { registerAdminFormsDeleteSubmissionRoute } from "../../routes/admin/forms/delete-submission";
import { registerAdminFormsGetRoute } from "../../routes/admin/forms/get-by-id";
import { registerAdminFormsGetSubmissionRoute } from "../../routes/admin/forms/get-submission";
import { registerAdminFormsListRoute } from "../../routes/admin/forms/list";
import { registerAdminFormsListSubmissionsRoute } from "../../routes/admin/forms/list-submissions";
import { registerAdminFormsUpdateRoute } from "../../routes/admin/forms/update";
import type { RouteDeps } from "../../routes/types";

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

async function bootAuthenticated(app: express.Express, t: import("node:test").TestContext) {
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

  return { baseUrl, cookie };
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
    passwordHash: await deps.passwordHasher.hash("grant-pw"),
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

  const bareCookie = await loginWithPermissions(deps, baseUrl, []);

  const deleteRes = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/forms/${definition.id}/submissions/whatever`,
    { method: "DELETE", headers: { cookie: bareCookie } }
  );
  assert.equal(deleteRes.status, 403);
});
