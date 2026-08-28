import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "./helpers/http-test-server.js";

import express from "express";

import { InMemoryMenuRepo, InMemoryNavLocationBindingRepo } from "../../features/navigation/index.js";
import type { MenuRouteDeps } from "../http/admin/menus.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { registerAdminMenuAssignLocationRoute } from "../routes/admin/menus/assign-location.js";
import { registerAdminMenuCreateRoute } from "../routes/admin/menus/create.js";
import { registerAdminMenuDeleteRoute } from "../routes/admin/menus/delete.js";
import { registerAdminMenuGetRoute } from "../routes/admin/menus/get-by-id.js";
import { registerAdminMenuListRoute } from "../routes/admin/menus/list.js";
import { registerAdminMenuUpdateTreeRoute } from "../routes/admin/menus/update-tree.js";

/**
 * @file Route-level tests for the admin `menus` HTTP surface (ADR-029).
 *
 * ADR-PIPE-012 D-1/D-2/D-9: the six routes now each check an action-specific `admin.menus.*`
 * permission instead of the single flat `navigation.manage` (SPEC-006 REQ-05's original gating).
 * This suite mirrors `admin-integrations-routes.test.ts`'s already-working pattern:
 * `createRouteDeps()` for a real `authorize()` + identity repos, real auth middleware, and a real
 * login before hitting any route.
 */
function buildTestApp(): { app: express.Express; deps: MenuRouteDeps } {
  const deps: MenuRouteDeps = {
    ...createRouteDeps(),
    menuRepo: new InMemoryMenuRepo(),
    navLocationBindingRepo: new InMemoryNavLocationBindingRepo(),
  };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminMenuListRoute(app, deps);
  registerAdminMenuGetRoute(app, deps);
  registerAdminMenuCreateRoute(app, deps);
  registerAdminMenuUpdateTreeRoute(app, deps);
  registerAdminMenuAssignLocationRoute(app, deps);
  registerAdminMenuDeleteRoute(app, deps);
  return { app, deps };
}

/** Boots a test app on an ephemeral port and returns an authenticated (owner) fetch cookie + base URL. */
/**
 * Registers a principal with a login but no role/policy grants at all — `authorize()` returns
 * `no_grant` for any permission it's checked against. Used to prove the denied side of the
 * `navigation.manage` gate (mirrors `identity-routes.test.ts`'s viewer-construction style, minus
 * the role assignment).
 */
async function loginAsBarePrincipal(deps: MenuRouteDeps, baseUrl: string) {
  await deps.identityReady;
  const bareId = "bare-principal-menus";
  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username: "bare-menus",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-menus", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

let grantCounter = 0;

/**
 * Registers a principal holding ONLY the given permission strings (no role, no wildcard) — proves
 * the per-action `admin.menus.*` cutover grants exactly what it names, nothing more (ADR-PIPE-012
 * C-010a..f). Mirrors `loginAsBarePrincipal`'s login-then-return-cookie shape, plus a direct
 * `principal_policies` grant instead of zero grants.
 */
async function loginWithPermissions(
  deps: MenuRouteDeps,
  baseUrl: string,
  permissions: readonly string[]
): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-menus-${suffix}`;
  const policyId = `grant-policy-menus-${suffix}`;
  const username = `grant-menus-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: `Grants: ${permissions.join(", ")}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash("grant-pw"),
  });
  await deps.policyRepo.save({
    id: policyId,
    workspaceId: deps.workspaceId,
    name: `grant-policy-${suffix}`,
    isBuiltin: false,
    isFrozen: false,
  });
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
  await deps.principalPolicyRepo.save({
    id: `grant-link-${suffix}`,
    workspaceId: deps.workspaceId,
    principalId,
    policyId,
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "grant-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("admin menus routes: create -> list -> get -> update-tree -> assign -> delete ladder", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // create
  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      title: "Primary Nav",
      slug: "primary-nav",
      items: [{ id: "item-1", label: "Home", target: { kind: "url", href: "/" } }],
    }),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { menu: { id: string; version: number } };
  const menuId = created.menu.id;
  assert.equal(created.menu.version, 1);

  // list
  const listRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, { headers: { cookie } });
  assert.equal(listRes.status, 200);
  const listed = (await listRes.json()) as { menus: Array<{ id: string }> };
  assert.equal(listed.menus.length, 1);
  assert.equal(listed.menus[0].id, menuId);

  // get
  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menuId}`, {
    headers: { cookie },
  });
  assert.equal(getRes.status, 200);
  const fetched = (await getRes.json()) as { menu: { items: unknown[] } };
  assert.equal(fetched.menu.items.length, 1);

  // update-tree (whole-tree replace, OCC on version 1)
  const updateRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menuId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      expectedVersion: 1,
      title: "Primary Nav",
      slug: "primary-nav",
      items: [
        { id: "item-1", label: "Home", target: { kind: "url", href: "/" } },
        { id: "item-2", label: "About", target: { kind: "url", href: "/about" } },
      ],
    }),
  });
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()) as { menu: { version: number; items: unknown[] } };
  assert.equal(updated.menu.version, 2);
  assert.equal(updated.menu.items.length, 2);

  // stale OCC is rejected
  const staleRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menuId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      expectedVersion: 1,
      title: "Primary Nav",
      slug: "primary-nav",
      items: [],
    }),
  });
  assert.equal(staleRes.status, 409);

  // assign location
  const assignRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menuId}/locations`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ locationKey: "primary" }),
  });
  assert.equal(assignRes.status, 200);
  const assigned = (await assignRes.json()) as {
    menu: { locations: string[] };
    binding: { locationKey: string; menuId: string };
    displacedMenu: unknown;
  };
  assert.deepEqual(assigned.menu.locations, ["primary"]);
  assert.equal(assigned.binding.locationKey, "primary");
  assert.equal(assigned.displacedMenu, null);

  // delete ladder: first call trashes (still location-bound, so purge would 409)
  const trashRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menuId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(trashRes.status, 200);
  const trashed = (await trashRes.json()) as { menu: { status: string } | null; purged: boolean };
  assert.equal(trashed.purged, false);
  assert.equal(trashed.menu?.status, "trash");

  // second call attempts purge — rejected (still bound to "primary")
  const blockedPurgeRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menuId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(blockedPurgeRes.status, 409);
  const blockedPurgeBody = (await blockedPurgeRes.json()) as { boundLocations: string[] };
  assert.deepEqual(blockedPurgeBody.boundLocations, ["primary"]);

  // force purge succeeds
  const forcePurgeRes = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menuId}?force=true`,
    { method: "DELETE", headers: { cookie } }
  );
  assert.equal(forcePurgeRes.status, 200);
  const forcePurged = (await forcePurgeRes.json()) as { menu: null; purged: boolean };
  assert.equal(forcePurged.purged, true);
  assert.equal(forcePurged.menu, null);

  // gone from list
  const finalListRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    headers: { cookie },
  });
  const finalList = (await finalListRes.json()) as { menus: unknown[] };
  assert.equal(finalList.menus.length, 0);
});

test("admin menus routes: create rejects duplicate slug and invalid tree", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const first = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Footer Nav", slug: "footer-nav" }),
  });
  assert.equal(first.status, 201);

  const duplicateSlug = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Another Footer", slug: "footer-nav" }),
  });
  assert.equal(duplicateSlug.status, 409);

  const badTarget = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      title: "Bad Menu",
      slug: "bad-menu",
      items: [{ id: "item-1", label: "XSS", target: { kind: "url", href: "javascript:alert(1)" } }],
    }),
  });
  assert.equal(badTarget.status, 400);
});

test("admin menus routes: 404s for unknown workspace and unknown menu id", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const wrongWorkspace = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/menus`, {
    headers: { cookie },
  });
  assert.equal(wrongWorkspace.status, 404);

  const missingMenu = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/does-not-exist`, {
    headers: { cookie },
  });
  assert.equal(missingMenu.status, 404);
});

test("admin menus routes: ADR-PIPE-012 D-1/D-2/D-9 — a principal with no grants is denied 403 on every route with the new per-action permission named, and a grant restores access", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const listDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(listDenied.status, 403);
  const listDeniedBody = (await listDenied.json()) as { code: string; details: { permission: string; reason: string } };
  assert.equal(listDeniedBody.code, "FORBIDDEN");
  assert.equal(listDeniedBody.details.permission, "admin.menus.read");
  assert.equal(listDeniedBody.details.reason, "no_grant");

  const createDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ title: "Should not be created", slug: "should-not-be-created" }),
  });
  assert.equal(createDenied.status, 403);
  const createDeniedBody = (await createDenied.json()) as { code: string; details: { permission: string } };
  assert.equal(createDeniedBody.code, "FORBIDDEN");
  assert.equal(createDeniedBody.details.permission, "admin.menus.create");

  // No menu was created for the denied caller.
  const listAfterDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    headers: { cookie: ownerCookie },
  });
  const { menus: menusAfterDenied } = (await listAfterDenied.json()) as { menus: unknown[] };
  assert.equal(menusAfterDenied.length, 0, "the denied create must not have written a menu");

  // The owner (wildcard '*') succeeds where the bare principal was denied — proves the gate, not
  // a global outage.
  const createAllowed = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ title: "Owner Nav", slug: "owner-nav" }),
  });
  assert.equal(createAllowed.status, 201);
  const { menu } = (await createAllowed.json()) as { menu: { id: string } };

  const getDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(getDenied.status, 403);
  assert.equal(
    ((await getDenied.json()) as { details: { permission: string } }).details.permission,
    "admin.menus.read"
  );

  const updateDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ expectedVersion: 1, title: "Owner Nav", slug: "owner-nav", items: [] }),
  });
  assert.equal(updateDenied.status, 403);
  assert.equal(
    ((await updateDenied.json()) as { details: { permission: string } }).details.permission,
    "admin.menus.update"
  );

  const assignDenied = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}/locations`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: bareCookie },
      body: JSON.stringify({ locationKey: "primary" }),
    }
  );
  assert.equal(assignDenied.status, 403);
  assert.equal(
    ((await assignDenied.json()) as { details: { permission: string } }).details.permission,
    "admin.menus.assign"
  );

  const deleteDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    method: "DELETE",
    headers: { cookie: bareCookie },
  });
  assert.equal(deleteDenied.status, 403);
  assert.equal(
    ((await deleteDenied.json()) as { details: { permission: string } }).details.permission,
    "admin.menus.delete"
  );

  // The menu is untouched by any of the denied mutation attempts.
  const stillThere = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(stillThere.status, 200);
  const stillThereBody = (await stillThere.json()) as { menu: { version: number; status: string } };
  assert.equal(stillThereBody.menu.version, 1, "the denied update must not have applied");
  // menu-service.ts's createMenu defaults new menus to 'published', not 'draft' (Jini cfd31024,
  // 2026-08-09) — see tool-registrations.menus.test.ts's own output-projection test for the full
  // rationale. Incidental to this test's actual point (the menu is untouched by the denied calls
  // above), but the status value itself must still match reality.
  assert.equal(stillThereBody.menu.status, "published");
});

// ---------------------------------------------------------------------------
// ADR-PIPE-012 C-010a..f — per-route permission cutover (T029-T034)
// ---------------------------------------------------------------------------

test("T029/C-010a: list.ts is gated by admin.menus.read specifically — that grant alone succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["admin.menus.read"]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
});

test("T030/C-010a: get-by-id.ts is gated by admin.menus.read specifically — that grant alone succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ title: "Nav", slug: "get-by-id-nav" }),
  });
  const { menu } = (await created.json()) as { menu: { id: string } };

  const cookie = await loginWithPermissions(deps, baseUrl, ["admin.menus.read"]);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
});

test("T031/C-010b: create.ts is gated by admin.menus.create specifically — that grant alone succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["admin.menus.create"]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Create-only Nav", slug: "create-only-nav" }),
  });
  assert.equal(res.status, 201);
});

test("T032/C-010c: update-tree.ts is gated by admin.menus.update specifically — that grant alone succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ title: "Nav", slug: "update-only-nav" }),
  });
  const { menu } = (await created.json()) as { menu: { id: string } };

  const cookie = await loginWithPermissions(deps, baseUrl, ["admin.menus.update"]);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ expectedVersion: 1, title: "Renamed", slug: "update-only-nav", items: [] }),
  });
  assert.equal(res.status, 200);
});

test("T033/C-010d: assign-location.ts is gated by admin.menus.assign specifically — that grant alone succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ title: "Nav", slug: "assign-only-nav" }),
  });
  const { menu } = (await created.json()) as { menu: { id: string } };

  const cookie = await loginWithPermissions(deps, baseUrl, ["admin.menus.assign"]);
  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}/locations`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ locationKey: "primary" }),
    }
  );
  assert.equal(res.status, 200);
});

test("T034/C-010e: delete.ts — admin.menus.delete alone succeeds on trash + blocked-purge-409; ?force=true without admin.menus.delete.force is 403 (not a silent downgrade); both present succeeds the force-purge", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ title: "Nav", slug: "delete-only-nav" }),
  });
  const { menu } = (await created.json()) as { menu: { id: string } };
  await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}/locations`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ locationKey: "primary" }),
  });

  const deleteOnlyCookie = await loginWithPermissions(deps, baseUrl, ["admin.menus.delete"]);

  // Trash step: admin.menus.delete alone succeeds.
  const trashRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    method: "DELETE",
    headers: { cookie: deleteOnlyCookie },
  });
  assert.equal(trashRes.status, 200);

  // Blocked purge (still bound to "primary"): admin.menus.delete alone still succeeds (409, not 403).
  const blockedRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    method: "DELETE",
    headers: { cookie: deleteOnlyCookie },
  });
  assert.equal(blockedRes.status, 409);

  // ?force=true WITHOUT admin.menus.delete.force: 403, not a silent downgrade to the ordinary 409.
  const forceDeniedRes = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}?force=true`,
    { method: "DELETE", headers: { cookie: deleteOnlyCookie } }
  );
  assert.equal(forceDeniedRes.status, 403);
  const forceDeniedBody = (await forceDeniedRes.json()) as { details: { permission: string } };
  assert.equal(forceDeniedBody.details.permission, "admin.menus.delete.force");

  // Both permissions present: force-purge succeeds.
  const bothCookie = await loginWithPermissions(deps, baseUrl, [
    "admin.menus.delete",
    "admin.menus.delete.force",
  ]);
  const forcedRes = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}?force=true`,
    { method: "DELETE", headers: { cookie: bothCookie } }
  );
  assert.equal(forcedRes.status, 200);
  const forcedBody = (await forcedRes.json()) as { purged: boolean };
  assert.equal(forcedBody.purged, true);
});

test("T041/INV-NEW-02: zero navigation.manage string literals remain in src/server/routes/admin/menus/*.ts after cutover", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = join(import.meta.dirname, "../routes/admin/menus");
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts")) continue;
    const contents = readFileSync(join(dir, file), "utf8");
    assert.equal(
      contents.includes("navigation.manage"),
      false,
      `${file} still references the deprecated 'navigation.manage' string literal`
    );
  }
});
