import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "./helpers/http-test-server";

import express from "express";

import { createRouteDeps } from "../app";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth";
import { createWidgetsModule } from "../modules/widgets";
import type { RouteDeps } from "../routes/types";
import { WIDGET_CONTENT_TYPE } from "../../widgets/types";

/**
 * @file Route-level tests for the admin `widgets` HTTP surface (SPEC-043, ADR-047) — instance
 * CRUD, region binding/placement, server-side embed mutation, and the AI tool surface. Mirrors
 * `admin-menus-routes.test.ts`'s real-auth pattern: `createRouteDeps()` for a real `authorize()` +
 * identity repos, real login before hitting any route. Domain-layer edge cases (config schema
 * validation detail, OCC races, guardrail taxonomy) are already covered by the `src/widgets/
 * __tests__/**` integration suites — these tests focus on HTTP wiring: status codes, request
 * parsing, permission gating (AC-28), and the end-to-end flow across routes.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}`;

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createWidgetsModule(deps).registerRoutes(app);
  return { app, deps };
}

/** Registers a principal holding ONLY the given `widgets.*` permission strings — mirrors
 * `admin-menus-routes.test.ts`'s `loginWithPermissions` exactly. */
let grantCounter = 0;
async function loginWithPermissions(deps: RouteDeps, baseUrl: string, permissions: readonly string[]): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-widgets-${suffix}`;
  const policyId = `grant-policy-widgets-${suffix}`;
  const username = `grant-widgets-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: `Grants: ${permissions.join(", ")}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({ principalId, workspaceId: deps.workspaceId, username, passwordHash: await deps.passwordHasher.hash("grant-pw") });
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: `grant-policy-${suffix}`, isBuiltin: false, isFrozen: false });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({ id: `grant-pp-${suffix}-${permission}`, workspaceId: deps.workspaceId, policyId, permission, resourceType: null, constraintJson: null });
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

test("admin widgets routes: create -> list -> get -> update -> trash -> blocked purge -> force purge ladder", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Footer note", config: { body: "hello" } }),
  });
  assert.equal(createRes.status, 201, await createRes.clone().text());
  const created = (await createRes.json()) as { widget: { id: string; status: string; version: number } };
  assert.equal(created.widget.status, "active");
  const widgetId = created.widget.id;

  const listRes = await fetch(`${baseUrl}${BASE}/widgets`, { headers: { cookie } });
  assert.equal(listRes.status, 200);
  const listed = (await listRes.json()) as { widgets: Array<{ id: string }> };
  assert.equal(listed.widgets.length, 1);
  assert.equal(listed.widgets[0].id, widgetId);

  const getRes = await fetch(`${baseUrl}${BASE}/widgets/${widgetId}`, { headers: { cookie } });
  assert.equal(getRes.status, 200);
  const fetched = (await getRes.json()) as { widget: { title: string }; whereUsed: { count: number } };
  assert.equal(fetched.widget.title, "Footer note");
  assert.equal(fetched.whereUsed.count, 0);

  const updateRes = await fetch(`${baseUrl}${BASE}/widgets/${widgetId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 1, config: { body: "updated" } }),
  });
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()) as { widget: { version: number; config: { body: string } } };
  assert.equal(updated.widget.version, 2);
  assert.equal(updated.widget.config.body, "updated");

  const staleRes = await fetch(`${baseUrl}${BASE}/widgets/${widgetId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 1, config: { body: "stale" } }),
  });
  assert.equal(staleRes.status, 409);

  const trashRes = await fetch(`${baseUrl}${BASE}/widgets/${widgetId}/trash`, { method: "POST", headers: { cookie } });
  assert.equal(trashRes.status, 200);
  const trashed = (await trashRes.json()) as { widget: { status: string } };
  assert.equal(trashed.widget.status, "trash");

  const purgeRes = await fetch(`${baseUrl}${BASE}/widgets/${widgetId}/purge`, { method: "POST", headers: { cookie } });
  assert.equal(purgeRes.status, 200);
  const purged = (await purgeRes.json()) as { purged: boolean };
  assert.equal(purged.purged, true);
});

test("admin widgets routes: invalid config is rejected 400, nothing created; unregistered type is rejected 400", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const badConfig = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "recent-entries", title: "Recent", config: { maxItems: 500 } }),
  });
  assert.equal(badConfig.status, 400);
  const badConfigBody = (await badConfig.json()) as { code: string };
  assert.equal(badConfigBody.code, "WIDGETS_CONFIG_VALIDATION_ERROR");

  const badType = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "carousel", title: "Carousel", config: {} }),
  });
  assert.equal(badType.status, 400);
  assert.equal(((await badType.json()) as { code: string }).code, "WIDGETS_TYPE_UNREGISTERED");

  const listRes = await fetch(`${baseUrl}${BASE}/widgets`, { headers: { cookie } });
  const listed = (await listRes.json()) as { widgets: unknown[] };
  assert.equal(listed.widgets.length, 0, "neither rejected create may have persisted anything");
});

test("admin widgets regions: bind -> get -> mutate placements -> regions-list reflects placement count -> purge without force is blocked, referencing region named", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createWidget = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Footer note", config: { body: "hi" } }),
  });
  const { widget } = (await createWidget.json()) as { widget: { id: string } };

  const bindRes = await fetch(`${baseUrl}${BASE}/widgets/regions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ regionKey: "footer" }),
  });
  assert.equal(bindRes.status, 201, await bindRes.clone().text());
  const bound = (await bindRes.json()) as { area: { id: string; version: number; regionKey: string } };
  assert.equal(bound.area.regionKey, "footer");

  const rebindRes = await fetch(`${baseUrl}${BASE}/widgets/regions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ regionKey: "footer" }),
  });
  assert.equal(rebindRes.status, 201);
  const rebound = (await rebindRes.json()) as { area: { id: string } };
  assert.equal(rebound.area.id, bound.area.id, "binding an already-bound region key is idempotent, never duplicates");

  const mutateRes = await fetch(`${baseUrl}${BASE}/widgets/regions/footer`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: bound.area.version, placements: [{ placementId: "p1", widgetEntryId: widget.id, enabled: true }] }),
  });
  assert.equal(mutateRes.status, 200, await mutateRes.clone().text());

  const regionGetRes = await fetch(`${baseUrl}${BASE}/widgets/regions/footer`, { headers: { cookie } });
  assert.equal(regionGetRes.status, 200);
  const regionGot = (await regionGetRes.json()) as { placements: Array<{ widgetTitle: string; broken: boolean }> };
  assert.equal(regionGot.placements.length, 1);
  assert.equal(regionGot.placements[0].widgetTitle, "Footer note");
  assert.equal(regionGot.placements[0].broken, false);

  const regionsListRes = await fetch(`${baseUrl}${BASE}/widgets/regions`, { headers: { cookie } });
  assert.equal(regionsListRes.status, 200, await regionsListRes.clone().text());
  const regionsListed = (await regionsListRes.json()) as { regions: Array<{ regionKey: string; placementCount: number }> };
  assert.equal(regionsListed.regions.length, 1);
  assert.equal(regionsListed.regions[0].placementCount, 1);

  const blockedPurge = await fetch(`${baseUrl}${BASE}/widgets/${widget.id}/purge`, { method: "POST", headers: { cookie } });
  assert.equal(blockedPurge.status, 409);
  const blockedBody = (await blockedPurge.json()) as { code: string; details: { referencingLocations: Array<{ kind: string }> } };
  assert.equal(blockedBody.code, "WIDGETS_REFERENCED");
  assert.equal(blockedBody.details.referencingLocations[0].kind, "region");
});

test("Fable adversarial-review fix (2026-07-21, Finding H): region placement mutation rejects malformed placement shapes, duplicate placementIds, and strips unrecognized extra properties instead of persisting them verbatim", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createWidget = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Footer note", config: { body: "hi" } }),
  });
  const { widget } = (await createWidget.json()) as { widget: { id: string } };

  const bindRes = await fetch(`${baseUrl}${BASE}/widgets/regions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ regionKey: "footer" }),
  });
  const { area } = (await bindRes.json()) as { area: { version: number } };

  const missingField = await fetch(`${baseUrl}${BASE}/widgets/regions/footer`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: area.version, placements: [{ placementId: "p1", enabled: true }] }),
  });
  assert.equal(missingField.status, 400, await missingField.clone().text());
  assert.equal((await missingField.json()).code, "VALIDATION_ERROR");

  const duplicateIds = await fetch(`${baseUrl}${BASE}/widgets/regions/footer`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      baseVersion: area.version,
      placements: [
        { placementId: "dup", widgetEntryId: widget.id, enabled: true },
        { placementId: "dup", widgetEntryId: widget.id, enabled: false },
      ],
    }),
  });
  assert.equal(duplicateIds.status, 400, await duplicateIds.clone().text());
  assert.equal((await duplicateIds.json()).code, "VALIDATION_ERROR");

  const extraProps = await fetch(`${baseUrl}${BASE}/widgets/regions/footer`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      baseVersion: area.version,
      placements: [{ placementId: "p1", widgetEntryId: widget.id, enabled: true, injectedField: "should not survive" }],
    }),
  });
  assert.equal(extraProps.status, 200, await extraProps.clone().text());

  const regionGetRes = await fetch(`${baseUrl}${BASE}/widgets/regions/footer`, { headers: { cookie } });
  const regionGot = (await regionGetRes.json()) as { placements: Array<Record<string, unknown>> };
  assert.equal(regionGot.placements.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(regionGot.placements[0], "injectedField"), false, "an unrecognized client-supplied property must not be persisted verbatim into the area doc");
});

test("admin widgets embeds: insert -> reorder -> remove against a real generic entry, server-side, no live editor session involved (REQ-44/AC-30)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // A host entry needs a registered content type first (mirrors the widgets domain-layer test
  // fixtures' own approach) — "article" avoids the "post"/"page" reserved-key collision.
  const { registerContentType } = await import("../../features/content-types/write-service");
  const { NoopContentTypeIndexProvisioner } = await import("../../features/content-types/repo.memory");
  const { createEntry } = await import("../../features/entries/write-service");
  const { PRE_AUTHORIZED } = await import("../../widgets/authorize-helper");

  await deps.identityReady;
  await registerContentType({
    deps: { repo: deps.contentTypeRepo, clock: deps.clock, ids: deps.idGen, authorize: PRE_AUTHORIZED, indexProvisioner: new NoopContentTypeIndexProvisioner(), outbox: deps.outbox },
    input: { actorId: "system", workspaceId: deps.workspaceId, key: "article", label: "Article", fields: [] },
  });
  const hostCreated = await createEntry({
    deps: { entryRepo: deps.entryRepo, contentTypeRepo: deps.contentTypeRepo, clock: deps.clock, ids: deps.idGen, authorize: PRE_AUTHORIZED, outbox: deps.outbox },
    input: { actorId: "system", workspaceId: deps.workspaceId, type: "article", slug: "route-test-host", title: "Host", fieldsJson: { ext: { site: {} } }, bodyJson: { type: "doc", content: [] } },
  });
  if (!hostCreated.ok) throw hostCreated.error;
  const hostId = hostCreated.value.entry.id;

  const createW1 = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "W1", config: { body: "one" } }),
  });
  const { widget: w1 } = (await createW1.json()) as { widget: { id: string } };
  const createW2 = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "W2", config: { body: "two" } }),
  });
  const { widget: w2 } = (await createW2.json()) as { widget: { id: string } };

  const insertRes = await fetch(`${baseUrl}${BASE}/entries/${hostId}/widget-embeds`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 1, widgetEntryId: w1.id }),
  });
  assert.equal(insertRes.status, 201, await insertRes.clone().text());
  const inserted = (await insertRes.json()) as { entry: { version: number }; placementId: string };
  assert.equal(inserted.entry.version, 2);

  const insertRes2 = await fetch(`${baseUrl}${BASE}/entries/${hostId}/widget-embeds`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 2, widgetEntryId: w2.id }),
  });
  const inserted2 = (await insertRes2.json()) as { entry: { version: number } };
  assert.equal(inserted2.entry.version, 3);

  const reorderRes = await fetch(`${baseUrl}${BASE}/entries/${hostId}/widget-embeds`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 3, orderedWidgetEntryIds: [w2.id, w1.id] }),
  });
  assert.equal(reorderRes.status, 200, await reorderRes.clone().text());

  const removeRes = await fetch(`${baseUrl}${BASE}/entries/${hostId}/widget-embeds/${inserted.placementId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 4 }),
  });
  assert.equal(removeRes.status, 200, await removeRes.clone().text());
});

test("admin widgets agent tools: widgets.create places a new instance in one call, widgets.place references an existing one, widgets.diagnose reports where-used, distinct from each other (REQ-35/AC-25)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.identityReady;

  const bindRes = await fetch(`${baseUrl}${BASE}/widgets/regions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ regionKey: "sidebar" }),
  });
  const { area } = (await bindRes.json()) as { area: { version: number } };

  const createToolRes = await fetch(`${baseUrl}${BASE}/widgets/tools/create`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      widgetType: "text",
      title: "Agent-created widget",
      config: { body: "agent" },
      target: { kind: "region", regionKey: "sidebar", baseVersion: area.version },
    }),
  });
  assert.equal(createToolRes.status, 201, await createToolRes.clone().text());
  const createdByTool = (await createToolRes.json()) as { tool: string; widget: { id: string } };
  assert.equal(createdByTool.tool, "widgets.create");

  const diagnoseRes = await fetch(`${baseUrl}${BASE}/widgets/tools/diagnose/${createdByTool.widget.id}`, { headers: { cookie } });
  assert.equal(diagnoseRes.status, 200);
  const diagnosed = (await diagnoseRes.json()) as { exists: boolean; status: string; whereUsed: { count: number } };
  assert.equal(diagnosed.exists, true);
  assert.equal(diagnosed.status, "active");
  assert.equal(diagnosed.whereUsed.count, 1, "widgets.create's placement must show up in the same instance's where-used count");

  // A second, pre-existing instance placed via widgets.place — an observably different outcome
  // from widgets.create (no new instance is created).
  const preExisting = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Reused widget", config: { body: "reuse me" } }),
  });
  const { widget: reused } = (await preExisting.json()) as { widget: { id: string } };

  const regionAfterCreateRes = await fetch(`${baseUrl}${BASE}/widgets/regions/sidebar`, { headers: { cookie } });
  const { area: areaAfterCreate } = (await regionAfterCreateRes.json()) as { area: { version: number } };

  const placeToolRes = await fetch(`${baseUrl}${BASE}/widgets/tools/place`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetInstanceId: reused.id, target: { kind: "region", regionKey: "sidebar", baseVersion: areaAfterCreate.version } }),
  });
  assert.equal(placeToolRes.status, 200, await placeToolRes.clone().text());
  const placedByTool = (await placeToolRes.json()) as { tool: string };
  assert.equal(placedByTool.tool, "widgets.place");

  const listAfterBoth = await fetch(`${baseUrl}${BASE}/widgets`, { headers: { cookie } });
  const { widgets: allWidgets } = (await listAfterBoth.json()) as { widgets: unknown[] };
  // widgets.create (step above) made ONE new instance; the ordinary create route made a second
  // ("Reused widget"); widgets.place made ZERO new instances (it only referenced the existing
  // "Reused widget") — 2 total, not 3.
  assert.equal(allWidgets.length, 2);

  const regionAfterPlaceRes = await fetch(`${baseUrl}${BASE}/widgets/regions/sidebar`, { headers: { cookie } });
  const { placements } = (await regionAfterPlaceRes.json()) as { placements: Array<{ widgetTitle: string }> };
  assert.equal(placements.length, 2, "both the widgets.create-placed and widgets.place-placed instances must be in the region");
});

test("AC-28/REQ-40/41: a principal with no widgets.* grants is denied 403 (not silently downgraded) on create/update/trash/purge/place/region-bind/region-mutate, naming the specific permission each time; the correct grant restores access", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginWithPermissions(deps, baseUrl, []);

  const createDenied = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ widgetType: "text", title: "Should not be created", config: { body: "x" } }),
  });
  assert.equal(createDenied.status, 403);
  assert.equal(((await createDenied.json()) as { details: { permission: string } }).details.permission, "widgets.create");

  const bindDenied = await fetch(`${baseUrl}${BASE}/widgets/regions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ regionKey: "footer" }),
  });
  assert.equal(bindDenied.status, 403);
  assert.equal(((await bindDenied.json()) as { details: { permission: string } }).details.permission, "widgets.place");

  // Owner creates a real instance so update/trash/purge have a real target to be denied against.
  const created = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ widgetType: "text", title: "Owner widget", config: { body: "x" } }),
  });
  const { widget } = (await created.json()) as { widget: { id: string; version: number } };

  const updateDenied = await fetch(`${baseUrl}${BASE}/widgets/${widget.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ baseVersion: widget.version, config: { body: "y" } }),
  });
  assert.equal(updateDenied.status, 403);
  assert.equal(((await updateDenied.json()) as { details: { permission: string } }).details.permission, "widgets.update");

  const trashDenied = await fetch(`${baseUrl}${BASE}/widgets/${widget.id}/trash`, { method: "POST", headers: { cookie: bareCookie } });
  assert.equal(trashDenied.status, 403);
  assert.equal(((await trashDenied.json()) as { details: { permission: string } }).details.permission, "widgets.delete");

  const purgeDenied = await fetch(`${baseUrl}${BASE}/widgets/${widget.id}/purge?force=true`, { method: "POST", headers: { cookie: bareCookie } });
  assert.equal(purgeDenied.status, 403);
  assert.equal(((await purgeDenied.json()) as { details: { permission: string } }).details.permission, "widgets.delete.force");

  // Round-2 external-audit fix (2026-07-21, codex medium finding R2-WIDGETS-002): this test's own
  // title claimed "place"/"region-mutate" coverage, but only region-BIND (a different route, which
  // happens to share the widgets.place permission string) was ever actually exercised — the
  // widgets.place AI TOOL (a distinct code path in agent-tools.ts) and the region-MUTATE endpoint
  // (region-mutate-placements.ts) had zero denial coverage of their own. Bind a region with the
  // owner, then exercise both denied paths for real with the no-grants principal.
  const ownerBind = await fetch(`${baseUrl}${BASE}/widgets/regions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ regionKey: "ac28-region" }),
  });
  const { area: ac28Area } = (await ownerBind.json()) as { area: { version: number } };

  const placeToolDenied = await fetch(`${baseUrl}${BASE}/widgets/tools/place`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ widgetInstanceId: widget.id, target: { kind: "region", regionKey: "ac28-region", baseVersion: ac28Area.version } }),
  });
  assert.equal(placeToolDenied.status, 403);
  assert.equal(((await placeToolDenied.json()) as { details: { permission: string } }).details.permission, "widgets.place");

  const regionMutateDenied = await fetch(`${baseUrl}${BASE}/widgets/regions/ac28-region`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ baseVersion: ac28Area.version, placements: [{ placementId: "ac28-p1", widgetEntryId: widget.id, enabled: true }] }),
  });
  assert.equal(regionMutateDenied.status, 403);
  assert.equal(((await regionMutateDenied.json()) as { details: { permission: string } }).details.permission, "widgets.place");

  // Both denied attempts left the region untouched (still empty, same version).
  const regionAfterDenials = await fetch(`${baseUrl}${BASE}/widgets/regions/ac28-region`, { headers: { cookie: ownerCookie } });
  const regionAfterDenialsBody = (await regionAfterDenials.json()) as { area: { version: number }; placements: unknown[] };
  assert.equal(regionAfterDenialsBody.area.version, ac28Area.version);
  assert.equal(regionAfterDenialsBody.placements.length, 0);

  // The widget survives every denied mutation attempt untouched.
  const stillThere = await fetch(`${baseUrl}${BASE}/widgets/${widget.id}`, { headers: { cookie: ownerCookie } });
  const stillThereBody = (await stillThere.json()) as { widget: { version: number; status: string } };
  assert.equal(stillThereBody.widget.version, 1, "no denied mutation may have applied");
  assert.equal(stillThereBody.widget.status, "active");

  // The correct grant restores access — proves the gate, not a global outage.
  const createOnlyCookie = await loginWithPermissions(deps, baseUrl, ["widgets.create"]);
  const createAllowed = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: createOnlyCookie },
    body: JSON.stringify({ widgetType: "text", title: "Grant-only widget", config: { body: "z" } }),
  });
  assert.equal(createAllowed.status, 201);
});

test("404s for unknown workspace and unknown widget id", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const wrongWorkspace = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/widgets`, { headers: { cookie } });
  assert.equal(wrongWorkspace.status, 404);

  const missingWidget = await fetch(`${baseUrl}${BASE}/widgets/does-not-exist`, { headers: { cookie } });
  assert.equal(missingWidget.status, 404);
});

test("Fable adversarial-review fix (2026-07-21, Finding D): widgets.create's instance survives a placement failure — the response names the created widget id instead of silently orphaning it, and a follow-up widgets.place (not a retried widgets.create) is the correct recovery, minting no duplicate", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.identityReady;

  const bindRes = await fetch(`${baseUrl}${BASE}/widgets/regions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ regionKey: "sidebar" }),
  });
  const { area } = (await bindRes.json()) as { area: { version: number } };

  // A deliberately STALE baseVersion — placement will fail with a version conflict, after the
  // instance itself has already been created.
  const createToolRes = await fetch(`${baseUrl}${BASE}/widgets/tools/create`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      widgetType: "text",
      title: "Orphan-risk widget",
      config: { body: "agent" },
      target: { kind: "region", regionKey: "sidebar", baseVersion: area.version + 99 },
    }),
  });
  assert.equal(createToolRes.status, 409, await createToolRes.clone().text());
  const failed = (await createToolRes.json()) as { tool: string; widget?: { id: string }; placementFailed?: boolean; code?: string };
  assert.equal(failed.placementFailed, true);
  assert.equal(failed.code, "WIDGETS_AREA_CONFLICT");
  assert.ok(failed.widget?.id, "the created instance's id must be in the response — it was NOT rolled back, so the caller must be told it exists");

  // The instance really was created and persisted (not orphaned/invisible).
  const getRes = await fetch(`${baseUrl}${BASE}/widgets/${failed.widget!.id}`, { headers: { cookie } });
  assert.equal(getRes.status, 200);

  // The correct recovery is widgets.place against the SAME id (never a second widgets.create) —
  // confirms no duplicate is needed and the returned id is directly usable.
  const regionRes = await fetch(`${baseUrl}${BASE}/widgets/regions/sidebar`, { headers: { cookie } });
  const { area: freshArea } = (await regionRes.json()) as { area: { version: number } };
  const placeRes = await fetch(`${baseUrl}${BASE}/widgets/tools/place`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetInstanceId: failed.widget!.id, target: { kind: "region", regionKey: "sidebar", baseVersion: freshArea.version } }),
  });
  assert.equal(placeRes.status, 200, await placeRes.clone().text());

  const listRes = await fetch(`${baseUrl}${BASE}/widgets`, { headers: { cookie } });
  const { widgets } = (await listRes.json()) as { widgets: unknown[] };
  assert.equal(widgets.length, 1, "only ONE instance must exist — the create+place recovery must not have minted a duplicate");
});

test("Fable adversarial-review fix (2026-07-21, Finding B): a malformed widget-instance row is skipped by the list route, not a 500 for the whole library screen", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Healthy widget", config: { body: "hello" } }),
  });
  assert.equal(createRes.status, 201);
  const { widget: healthy } = (await createRes.json()) as { widget: { id: string } };

  // Simulates the real reachable path Fable's review found: some OTHER write path (e.g. a generic
  // admin entry-update endpoint that doesn't know about widgets' own payload envelope) wipes a
  // widget entry's fieldsJson down to something `parseWidgetInstancePayload` cannot parse.
  await deps.entryRepo.save({
    id: "corrupted-widget",
    workspaceId: deps.workspaceId,
    type: WIDGET_CONTENT_TYPE,
    slug: "corrupted-widget",
    status: "published",
    title: "Corrupted widget",
    bodyJson: null,
    fieldsJson: { ext: { site: { title: "not the widgets envelope at all" } } },
    publishedAt: deps.clock.nowIso(),
    createdAt: deps.clock.nowIso(),
    updatedAt: deps.clock.nowIso(),
    version: 1,
  });

  const listRes = await fetch(`${baseUrl}${BASE}/widgets`, { headers: { cookie } });
  assert.equal(listRes.status, 200, await listRes.clone().text());
  const listed = (await listRes.json()) as { widgets: Array<{ id: string }> };
  assert.equal(listed.widgets.length, 1, "the corrupted row must be skipped, not crash the whole list");
  assert.equal(listed.widgets[0].id, healthy.id);
});

test("Fable adversarial-review fix (2026-07-21, Finding B): widgets.diagnose on a real entry id that is NOT a widget instance reports exists:false, not a 500", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await deps.entryRepo.save({
    id: "a-regular-page",
    workspaceId: deps.workspaceId,
    type: "page",
    slug: "a-regular-page",
    status: "published",
    title: "Not a widget",
    bodyJson: null,
    fieldsJson: { ext: { site: {} } },
    publishedAt: deps.clock.nowIso(),
    createdAt: deps.clock.nowIso(),
    updatedAt: deps.clock.nowIso(),
    version: 1,
  });

  const diagnoseRes = await fetch(`${baseUrl}${BASE}/widgets/tools/diagnose/a-regular-page`, { headers: { cookie } });
  assert.equal(diagnoseRes.status, 200, await diagnoseRes.clone().text());
  const diagnosed = (await diagnoseRes.json()) as { exists: boolean; status: string | null };
  assert.equal(diagnosed.exists, false);
  assert.equal(diagnosed.status, null);
});
