import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { InMemoryMenuRepo, InMemoryNavLocationBindingRepo } from "../../navigation/repo.memory";
import type { MenuRouteDeps } from "../http/admin/menus";
import { createRouteDeps } from "../app";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth";
import { registerAdminMenuAssignLocationRoute } from "../routes/admin/menus/assign-location";
import { registerAdminMenuCreateRoute } from "../routes/admin/menus/create";
import { registerAdminMenuDeleteRoute } from "../routes/admin/menus/delete";
import { registerAdminMenuGetRoute } from "../routes/admin/menus/get-by-id";
import { registerAdminMenuListRoute } from "../routes/admin/menus/list";
import { registerAdminMenuUpdateTreeRoute } from "../routes/admin/menus/update-tree";

/**
 * @file Route-level tests for the admin `menus` HTTP surface (ADR-029).
 *
 * The registrars are gated by `navigation.manage` (SPEC-006 REQ-05, wired in this pass — see the
 * Programmer handoff), so this suite mirrors `admin-integrations-routes.test.ts`'s already-working
 * pattern: `createRouteDeps()` for a real `authorize()` + identity repos, real auth middleware, and
 * a real login before hitting any route, instead of the unauthenticated bare-Express harness this
 * file used before gating landed.
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

test("admin menus routes: SPEC-006 REQ-05 — a principal without navigation.manage is denied 403 on every route, and a grant restores access", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const listDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(listDenied.status, 403);
  const listDeniedBody = (await listDenied.json()) as { code: string; details: { permission: string; reason: string } };
  assert.equal(listDeniedBody.code, "FORBIDDEN");
  assert.equal(listDeniedBody.details.permission, "navigation.manage");
  assert.equal(listDeniedBody.details.reason, "no_grant");

  const createDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ title: "Should not be created", slug: "should-not-be-created" }),
  });
  assert.equal(createDenied.status, 403);
  assert.equal(((await createDenied.json()) as { code: string }).code, "FORBIDDEN");

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

  const updateDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ expectedVersion: 1, title: "Owner Nav", slug: "owner-nav", items: [] }),
  });
  assert.equal(updateDenied.status, 403);

  const assignDenied = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}/locations`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: bareCookie },
      body: JSON.stringify({ locationKey: "primary" }),
    }
  );
  assert.equal(assignDenied.status, 403);

  const deleteDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    method: "DELETE",
    headers: { cookie: bareCookie },
  });
  assert.equal(deleteDenied.status, 403);

  // The menu is untouched by any of the denied mutation attempts.
  const stillThere = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(stillThere.status, 200);
  const stillThereBody = (await stillThere.json()) as { menu: { version: number; status: string } };
  assert.equal(stillThereBody.menu.version, 1, "the denied update must not have applied");
  assert.equal(stillThereBody.menu.status, "draft");
});
