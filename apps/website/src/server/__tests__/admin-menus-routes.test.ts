import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "./helpers/http-test-server.js";

import express from "express";

import { ALLOWED_HREF_SHAPES_DESCRIPTION, InMemoryNavLocationBindingRepo } from "../../features/navigation/index.js";
import type { MenuRepoPort } from "../../features/navigation/index.js";
import type { MenuRouteDeps } from "../inbound/admin-http/http/menus.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { registerAdminMenuAssignLocationRoute } from "../inbound/admin-http/routes/menus/assign-location.js";
import { registerAdminMenuCreateRoute } from "../inbound/admin-http/routes/menus/create.js";
import { registerAdminMenuDeleteRoute } from "../inbound/admin-http/routes/menus/delete.js";
import { registerAdminMenuGetRoute } from "../inbound/admin-http/routes/menus/get-by-id.js";
import { registerAdminMenuListRoute } from "../inbound/admin-http/routes/menus/list.js";
import { registerAdminMenuUpdateTreeRoute } from "../inbound/admin-http/routes/menus/update-tree.js";

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
  // NOTE: previously overrode `menuRepo`/`navLocationBindingRepo` with a second, disconnected pair
  // of in-memory repos here. That broke once `removeMenu` (bound inside `createRouteDeps()` to ITS
  // OWN internal `menuRepo` instance) was wired into the trash composition — `delete.ts` would read
  // a menu through the overridden repo but remove it through a different instance, so every delete
  // saw a false not-found. Using `createRouteDeps()`'s own repos keeps `deps.menuRepo` and
  // `deps.removeMenu` pointed at the same instance; each test still gets full isolation because this
  // function calls `createRouteDeps()` fresh every time.
  const deps: MenuRouteDeps = createRouteDeps();

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
    menu: { locations: string[]; version: number };
    binding: { locationKey: string; menuId: string };
    displacedMenu: unknown;
  };
  assert.deepEqual(assigned.menu.locations, ["primary"]);
  assert.equal(assigned.binding.locationKey, "primary");
  assert.equal(assigned.displacedMenu, null);

  // delete: one call trashes; a second 404s (no more force ladder). Purge/binding-removal is
  // covered by menu-trash-flow.test.ts, not this route test.
  const trashRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menuId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(trashRes.status, 200);
  const trashed = (await trashRes.json()) as { trashed: true; id: string; version: number | null };
  assert.equal(trashed.trashed, true);
  assert.equal(trashed.id, menuId);
  assert.equal(trashed.version, assigned.menu.version + 1); // read dynamically off the prior response

  // gone from list
  const finalListRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    headers: { cookie },
  });
  const finalList = (await finalListRes.json()) as { menus: unknown[] };
  assert.equal(finalList.menus.length, 0);

  const goneRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menuId}`, {
    headers: { cookie },
  });
  assert.equal(goneRes.status, 404);

  const secondDeleteRes = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menuId}?force=true`,
    { method: "DELETE", headers: { cookie } }
  );
  assert.equal(secondDeleteRes.status, 404, "no more force ladder — a second delete on an already-trashed menu is just not-found");
});

test("admin menus routes: GET resolves by slug as well as id (readable-slugs S6b)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Footer Nav", slug: "footer-nav" }),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { menu: { id: string; slug: string } };

  const bySlug = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/footer-nav`, {
    headers: { cookie },
  });
  assert.equal(bySlug.status, 200);
  const fetchedBySlug = (await bySlug.json()) as { menu: { id: string } };
  assert.equal(fetchedBySlug.menu.id, created.menu.id);

  // The old id-based URL keeps working too — same fallback contract as posts/pages.
  const byId = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${created.menu.id}`, {
    headers: { cookie },
  });
  assert.equal(byId.status, 200);
  const fetchedById = (await byId.json()) as { menu: { slug: string } };
  assert.equal(fetchedById.menu.slug, "footer-nav");
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

// ---------------------------------------------------------------------------
// update-tree.ts coverage gap fill — this route's own workspace check, body-shape
// guard, and `sendUpdateMenuTreeError`'s NotFound/Validation branches, none of
// which the golden-path/permission suites above reach.
// ---------------------------------------------------------------------------

test("update-tree: 404s for a wrong workspace id on the PUT route itself (not just GET/list)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/menus/whatever`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ expectedVersion: 1, items: [] }),
  });
  assert.equal(res.status, 404);
});

test("update-tree: 400s when 'items' is missing or not an array, before any menu lookup", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const missing = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/does-not-exist`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ expectedVersion: 1 }),
  });
  assert.equal(missing.status, 400);
  assert.match(String(((await missing.json()) as { error?: string }).error), /items must be an array/);

  const wrongType = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/does-not-exist`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ expectedVersion: 1, items: "not-an-array" }),
  });
  assert.equal(wrongType.status, 400);
});

test("update-tree: 404 MenuNotFoundError (sendUpdateMenuTreeError's own mapping) for a well-formed request against an id that does not exist — distinct from the workspace-mismatch 404 above", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/does-not-exist`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ expectedVersion: 1, title: "X", slug: "x", items: [] }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /was not found/);
});

test("update-tree: 400 MenuValidationError reached through the UPDATE path's own error mapping (not create's), for a disallowed url scheme", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Nav", slug: "validation-nav" }),
  });
  const { menu } = (await created.json()) as { menu: { id: string } };

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      expectedVersion: 1,
      items: [{ id: "item-1", label: "XSS", target: { kind: "url", href: "javascript:alert(1)" } }],
    }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  // Jini `menu-service.ts`'s write-time href allowlist (replaced a scheme DENYLIST 2026-09-03) now
  // reports this LLM-caller-facing message instead of the old "disallowed scheme" text — see that
  // file's `isAllowedHref`/`ALLOWED_HREF_SHAPES_DESCRIPTION` doc. Asserted against the imported
  // constant (not a hand-typed copy of the shapes text) so this test cannot itself drift from the
  // real message the way the old denylist/allowlist copies drifted from each other.
  assert.equal(
    body.error,
    `url target href is not allowed: 'javascript:alert(1)'. Accepted shapes: ${ALLOWED_HREF_SHAPES_DESCRIPTION}.`
  );

  // The rejected update must not have applied — still version 1, still empty.
  const stillThere = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    headers: { cookie },
  });
  const stillThereBody = (await stillThere.json()) as { menu: { version: number; items: unknown[] } };
  assert.equal(stillThereBody.menu.version, 1);
  assert.equal(stillThereBody.menu.items.length, 0);
});

test("update-tree: omitting title/slug carries the existing values forward unchanged (the route's one partial-update exception — 'items' itself is always a full replace)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      title: "Original Title",
      slug: "original-slug",
      items: [{ id: "item-1", label: "Home", target: { kind: "url", href: "/" } }],
    }),
  });
  const { menu } = (await created.json()) as { menu: { id: string } };

  // Replace only the items — title/slug omitted entirely.
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      expectedVersion: 1,
      items: [{ id: "item-1", label: "Home", target: { kind: "url", href: "/" } }, { id: "item-2", label: "About", target: { kind: "url", href: "/about" } }],
    }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { menu: { title: string; slug: string; items: unknown[] } };
  assert.equal(body.menu.title, "Original Title", "omitting title on update must NOT blank it");
  assert.equal(body.menu.slug, "original-slug", "omitting slug on update must NOT blank it");
  assert.equal(body.menu.items.length, 2);
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

test("T034/C-010e: delete.ts — admin.menus.delete alone succeeds; a second delete on an already-trashed menu is 404; ?force=true changes nothing", async (t) => {
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

  // A principal holding only `admin.menus.delete` can trash it — no separate `.force` permission
  // is ever consulted now that there is no force ladder.
  const trashRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    method: "DELETE",
    headers: { cookie: deleteOnlyCookie },
  });
  assert.equal(trashRes.status, 200);

  // A second delete on an already-trashed menu is just not-found — not 403, not 409.
  const secondRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
    method: "DELETE",
    headers: { cookie: deleteOnlyCookie },
  });
  assert.equal(secondRes.status, 404);

  // `?force=true` is not a recognized param anymore — same 404, no 403 for a missing `.force` grant.
  const forceRes = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}?force=true`,
    { method: "DELETE", headers: { cookie: deleteOnlyCookie } }
  );
  assert.equal(forceRes.status, 404);
});

/**
 * `req.params.workspaceId ?? ""` / `req.params.menuId ?? ""` / `parseMenuTreeRequestBody`'s own
 * `(rawBody ?? {})` (extractRouteHandler's own doc, `helpers/http-test-server.ts`): Express
 * guarantees a matched `:param` is always populated, and real `body-parser` always assigns
 * `req.body`, so the right side of every `??` below is unreachable through any real HTTP request.
 * Restored 2026-09-03 after being wrongly deleted as "unreachable dead code" -- the repo's
 * established answer is to KEEP the guard and exercise it with a hand-built `req` that
 * deliberately violates those contracts.
 */
test("update menu tree: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call", async () => {
  const { app } = buildTestApp();
  const handler = extractRouteHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/menus/:menuId");
  const { res, capture } = createCapturingResponse();

  await handler({ params: {}, body: { items: [] } }, res);

  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { error: string }).error, "workspace was not found");
});

test("update menu tree: `parseMenuTreeRequestBody`'s `(rawBody ?? {})` fallback, forced via a direct handler call with req.body omitted entirely", async () => {
  const { app, deps } = buildTestApp();
  const handler = extractRouteHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/menus/:menuId");
  const { res, capture } = createCapturingResponse();

  // No `body` key at all -> `(rawBody ?? {})` fallback; `{}.items` is not an array, so this reaches
  // the batch-shape guard rather than throwing on a property access of `undefined`.
  await handler({ params: { workspaceId: deps.workspaceId } }, res);

  assert.equal(capture.statusCode, 400);
  assert.equal((capture.jsonBody as { error: string }).error, "items must be an array");
});

test("update menu tree: `req.params.menuId ?? \"\"` fallback, forced via a direct handler call past auth with a real seeded principal", async () => {
  const { app, deps } = buildTestApp();
  await deps.identityReady;
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  const ownerPrincipal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: ownerUser.principalId });
  assert.ok(ownerPrincipal, "expected the seeded admin principal");

  const handler = extractRouteHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/menus/:menuId");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = ownerPrincipal;

  await handler({ params: { workspaceId: deps.workspaceId }, body: { items: [] } }, res); // no menuId

  // An empty menuId resolves nothing -- the ordinary not-found mapping, proof the `?? ""` fallback
  // produced a real (if unmatched) lookup key rather than throwing.
  assert.equal(capture.statusCode, 404);
});

/**
 * `sendUpdateMenuTreeError`'s final `res.status(500).json({ error: "internal error" })` arm — the
 * one branch none of the golden-path/permission/validation tests above reach, since every other
 * failure this route can hit maps to a specific `Menu*Error`. Forced with a `menuRepo` stub whose
 * `findById` throws a plain `Error`, so `updateMenuTree` (`menu-service.ts`) rejects with something
 * that is none of `MenuValidationError`/`MenuConflictError`/`MenuNotFoundError` — the only way to
 * reach the handler's default arm without a real storage failure.
 */
test("update menu tree: sendUpdateMenuTreeError's default 500 branch, forced via a repo that throws a non-Menu error", async () => {
  const throwingMenuRepo: MenuRepoPort = {
    findById: async () => {
      throw new Error("boom: repo exploded");
    },
    findBySlug: async () => null,
    list: async () => [],
    save: async () => {},
    remove: async () => {},
  };
  const deps: MenuRouteDeps = {
    ...createRouteDeps(),
    menuRepo: throwingMenuRepo,
    navLocationBindingRepo: new InMemoryNavLocationBindingRepo(),
  };
  const app = express();
  registerAdminMenuUpdateTreeRoute(app, deps);

  await deps.identityReady;
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  const ownerPrincipal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: ownerUser.principalId });
  assert.ok(ownerPrincipal, "expected the seeded admin principal");

  const handler = extractRouteHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/menus/:menuId");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = ownerPrincipal;

  await handler({ params: { workspaceId: deps.workspaceId, menuId: "whatever" }, body: { items: [] } }, res);

  assert.equal(capture.statusCode, 500);
  assert.deepEqual(capture.jsonBody, { error: "internal error" });
});

test("update-tree: a menu item with a missing or null target is a 400 with a specific message, NOT an opaque 500", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Primary", slug: "primary-target-guard" }),
  });
  assert.equal(created.status, 201);
  const { menu } = (await created.json()) as { menu: { id: string; version: number } };

  // Cross-package contract lock. `validateTarget` in @jini-ai/cms/navigation read `target.kind`
  // unguarded, so an item with no target threw a raw TypeError that this route's catch-all
  // flattened into a 500 -- an operator saw "internal error" for what is purely a malformed
  // request body. Fixed upstream in Jini e467f5c4; asserted here because Tovu consumes that
  // package as a prebuilt dist, so a stale or reverted build would silently restore the 500 and
  // no Tovu test would notice.
  for (const badItem of [{ id: "item-1", label: "Home" }, { id: "item-1", label: "Home", target: null }]) {
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/menus/${menu.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ expectedVersion: menu.version, items: [badItem] }),
    });

    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(badItem)}, got ${res.status}`);
    // Assert the message, not just the status: a 400 carrying "internal error" would still be
    // useless to the operator this fix exists for.
    assert.equal(((await res.json()) as { error: string }).error, "every menu item requires a target");
  }
});

test("update-tree: the catch-all 500 branch logs the unmapped error server-side instead of discarding it", async () => {
  const throwingMenuRepo: MenuRepoPort = {
    findById: async () => {
      throw new Error("boom: repo exploded");
    },
    findBySlug: async () => null,
    list: async () => [],
    save: async () => {},
    remove: async () => {},
  };
  const deps: MenuRouteDeps = {
    ...createRouteDeps(),
    menuRepo: throwingMenuRepo,
    navLocationBindingRepo: new InMemoryNavLocationBindingRepo(),
  };
  const app = express();
  registerAdminMenuUpdateTreeRoute(app, deps);

  await deps.identityReady;
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  const ownerPrincipal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: ownerUser.principalId });
  assert.ok(ownerPrincipal, "expected the seeded admin principal");

  const handler = extractRouteHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/menus/:menuId");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = ownerPrincipal;

  const logged: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
  try {
    await handler({ params: { workspaceId: deps.workspaceId, menuId: "whatever" }, body: { items: [] } }, res);
  } finally {
    console.error = realError;
  }

  // The wire response is deliberately unchanged -- the fix is the diagnostic, not the envelope.
  assert.equal(capture.statusCode, 500);
  assert.deepEqual(capture.jsonBody, { error: "internal error" });

  assert.equal(logged.length, 1, "expected exactly one server-side log for the unmapped error");
  // Assert the ORIGINAL error text reached the log. Asserting only that console.error fired would
  // pass under a log that printed "internal error" and threw the real cause away -- which is the
  // exact defect being fixed.
  assert.match(logged[0]!, /boom: repo exploded/);
});

test("T041/INV-NEW-02: zero navigation.manage string literals remain in src/server/inbound/admin-http/routes/menus/*.ts after cutover", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = join(import.meta.dirname, "../inbound/admin-http/routes/menus");
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
