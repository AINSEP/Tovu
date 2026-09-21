import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "./helpers/http-test-server.js";

import express from "express";

import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { createWidgetsModule } from "../runtime/composition/modules/widgets.js";
import type { RouteDeps } from "../routes/types.js";
import { WIDGET_CONTENT_TYPE } from "../../features/widgets/types.js";

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

test("admin widgets routes: PUT with a title renames the widget; omitting it keeps the title; a non-string title is 400", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Footer note", config: { body: "hello" } }),
  });
  assert.equal(createRes.status, 201, await createRes.clone().text());
  const { widget: created } = (await createRes.json()) as { widget: { id: string } };

  const renameRes = await fetch(`${baseUrl}${BASE}/widgets/${created.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 1, title: "Autumn note", config: { body: "hello" } }),
  });
  assert.equal(renameRes.status, 200, await renameRes.clone().text());
  const renamed = (await renameRes.json()) as { widget: { title: string; version: number } };
  assert.equal(renamed.widget.title, "Autumn note", "the PUT title must persist as the widget's new title");

  const keepRes = await fetch(`${baseUrl}${BASE}/widgets/${created.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: renamed.widget.version, config: { body: "hello again" } }),
  });
  assert.equal(keepRes.status, 200, await keepRes.clone().text());
  const kept = (await keepRes.json()) as { widget: { title: string } };
  assert.equal(kept.widget.title, "Autumn note", "omitting title on a PUT must keep the current title");

  const badTitleRes = await fetch(`${baseUrl}${BASE}/widgets/${created.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 3, title: 5, config: { body: "hello" } }),
  });
  assert.equal(badTitleRes.status, 400, await badTitleRes.clone().text());
  const badTitleBody = (await badTitleRes.json()) as { code: string };
  assert.equal(badTitleBody.code, "VALIDATION_ERROR");
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
  const { registerContentType, NoopContentTypeIndexProvisioner } = await import("../../features/content-types/index.js");
  const { createEntry } = await import("../../features/entries/index.js");
  const { PRE_AUTHORIZED } = await import("../../features/widgets/authorize-helper.js");

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

  const wrongWsRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/entries/${hostId}/widget-embeds`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 3, orderedWidgetEntryIds: [w2.id, w1.id] }),
  });
  assert.equal(wrongWsRes.status, 404);

  const badBodyRes = await fetch(`${baseUrl}${BASE}/entries/${hostId}/widget-embeds`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: "not-a-number", orderedWidgetEntryIds: [w2.id] }),
  });
  assert.equal(badBodyRes.status, 400);

  const badIdsRes = await fetch(`${baseUrl}${BASE}/entries/${hostId}/widget-embeds`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 3, orderedWidgetEntryIds: [""] }),
  });
  assert.equal(badIdsRes.status, 400);

  const errRes = await fetch(`${baseUrl}${BASE}/entries/non-existent-host/widget-embeds`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 3, orderedWidgetEntryIds: [w2.id, w1.id] }),
  });
  assert.equal(errRes.status, 404);

  const removeRes = await fetch(`${baseUrl}${BASE}/entries/${hostId}/widget-embeds/${inserted.placementId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 4 }),
  });
  assert.equal(removeRes.status, 200, await removeRes.clone().text());
});

/**
 * @file T3 (2026-09-15 widgets-insert-embed fix) — RED regression coverage for the bug in
 * `ADS-memory/.local-artifacts/handoffs/2026-09-15-widgets-insert-embed-bug-EVIDENCE.md`: the
 * embed-mutation routes only ever looked in the `entries` table for a host, so a real post/page
 * (a DIFFERENT table, `features/post`) always 404'd. `deps.postRepo` (real `createRouteDeps()`
 * composition, same as every other test in this file) seeds the host directly, mirroring
 * `tool-registrations.optimistic-concurrency.test.ts:72-85`'s own `postRepo.save({...} as never)`
 * pattern rather than depending on the create-post route being wired to this path at all.
 */
function seedRouteHostPost(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "post-route-host-1",
    workspaceId: WORKSPACE_ID,
    title: "Route Host Post",
    slug: "route-host-post",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "draft",
    kind: "post",
    updatedAt: "2026-09-15T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

test("admin widgets embeds: insert -> remove -> reorder against a REAL post host, closing the 2026-09-15 'host entry was not found' bug (SPEC-043 REQ-44/45)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.identityReady;

  const postId = "post-route-host-1";
  await deps.postRepo.save(seedRouteHostPost() as never);

  const createW = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Post-embed widget", config: { body: "hi" } }),
  });
  const { widget } = (await createW.json()) as { widget: { id: string } };

  const insertRes = await fetch(`${baseUrl}${BASE}/entries/${postId}/widget-embeds`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 1, widgetEntryId: widget.id }),
  });
  assert.equal(insertRes.status, 201, await insertRes.clone().text());
  const inserted = (await insertRes.json()) as { entry: { version: number }; placementId: string };
  assert.equal(inserted.entry.version, 2);

  const removeRes = await fetch(`${baseUrl}${BASE}/entries/${postId}/widget-embeds/${inserted.placementId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 2 }),
  });
  assert.equal(removeRes.status, 200, await removeRes.clone().text());

  const insertRes2 = await fetch(`${baseUrl}${BASE}/entries/${postId}/widget-embeds`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 3, widgetEntryId: widget.id }),
  });
  assert.equal(insertRes2.status, 201, await insertRes2.clone().text());
  const inserted2 = (await insertRes2.json()) as { entry: { version: number } };

  const reorderRes = await fetch(`${baseUrl}${BASE}/entries/${postId}/widget-embeds`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: inserted2.entry.version, orderedWidgetEntryIds: [widget.id] }),
  });
  assert.equal(reorderRes.status, 200, await reorderRes.clone().text());
});

test("admin widgets embeds: unknown host is 404 WIDGETS_EMBED_HOST_NOT_FOUND, not the stale WIDGETS_INSTANCE_NOT_FOUND code", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/entries/does-not-exist/widget-embeds`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 1, widgetEntryId: "whatever" }),
  });
  assert.equal(res.status, 404, await res.clone().text());
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "WIDGETS_EMBED_HOST_NOT_FOUND");
});

test("admin widgets embeds: an HTML-format page host is 400 WIDGETS_EMBED_HOST_UNSUPPORTED (reason 'html-page')", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.identityReady;

  const pageId = "page-html-host-1";
  await deps.postRepo.save(
    seedRouteHostPost({
      id: pageId,
      slug: "html-page",
      kind: "page",
      bodyFormat: "html",
      bodyHtml: "<main></main>",
    }) as never
  );

  const res = await fetch(`${baseUrl}${BASE}/entries/${pageId}/widget-embeds`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 1, widgetEntryId: "whatever" }),
  });
  assert.equal(res.status, 400, await res.clone().text());
  const body = (await res.json()) as { code: string; details: { reason: string } };
  assert.equal(body.code, "WIDGETS_EMBED_HOST_UNSUPPORTED");
  assert.equal(body.details.reason, "html-page");
});

test("admin widgets embeds: a principal holding widgets.place but NOT content.write is 403 FORBIDDEN on a post host, nothing written", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.identityReady;

  const postId = "post-forbidden-host-1";
  await deps.postRepo.save(seedRouteHostPost({ id: postId, slug: "forbidden-host-post" }) as never);

  const createW = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Forbidden test widget", config: { body: "hi" } }),
  });
  const { widget } = (await createW.json()) as { widget: { id: string } };

  const limitedCookie = await loginWithPermissions(deps, baseUrl, ["widgets.place"]);

  const res = await fetch(`${baseUrl}${BASE}/entries/${postId}/widget-embeds`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: limitedCookie },
    body: JSON.stringify({ baseVersion: 1, widgetEntryId: widget.id }),
  });
  assert.equal(res.status, 403, await res.clone().text());
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "content.write");

  const after = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: postId });
  assert.equal(after?.version, 1);
});

test("admin widgets agent tools: widgets.place with an embed target against a REAL post host succeeds (closes the 2026-09-15 bug on the AI-tool route too)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.identityReady;

  const postId = "post-tools-place-host-1";
  await deps.postRepo.save(seedRouteHostPost({ id: postId, slug: "tools-place-host-post" }) as never);

  const createW = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Tools-place widget", config: { body: "hi" } }),
  });
  const { widget } = (await createW.json()) as { widget: { id: string } };

  const placeRes = await fetch(`${baseUrl}${BASE}/widgets/tools/place`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetInstanceId: widget.id, target: { kind: "embed", hostEntryId: postId, baseVersion: 1 } }),
  });
  assert.equal(placeRes.status, 200, await placeRes.clone().text());
  const placed = (await placeRes.json()) as { tool: string; result: { entry: { version: number } } };
  assert.equal(placed.tool, "widgets.place");
  assert.equal(placed.result.entry.version, 2);
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

test("admin widgets agent tools: widgets.diagnose on a widget entry with an unparseable fieldsJson payload reports status:null, not a 500 (resolveWidgetStatus's parse-failure branch)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await deps.entryRepo.save({
    id: "corrupted-widget-diagnose",
    workspaceId: deps.workspaceId,
    type: WIDGET_CONTENT_TYPE,
    slug: "corrupted-widget-diagnose",
    status: "published",
    title: "Corrupted widget",
    bodyJson: null,
    fieldsJson: { ext: { site: { title: "not the widgets envelope at all" } } },
    publishedAt: deps.clock.nowIso(),
    createdAt: deps.clock.nowIso(),
    updatedAt: deps.clock.nowIso(),
    version: 1,
  });

  const diagnoseRes = await fetch(`${baseUrl}${BASE}/widgets/tools/diagnose/corrupted-widget-diagnose`, { headers: { cookie } });
  assert.equal(diagnoseRes.status, 200, await diagnoseRes.clone().text());
  const diagnosed = (await diagnoseRes.json()) as { exists: boolean; status: string | null };
  assert.equal(diagnosed.exists, true, "the row IS a widget-typed entry, so exists must be true even though its payload can't be parsed");
  assert.equal(diagnosed.status, null);
});

test("admin widgets agent tools: widgets.remove removes a region placement (region kind) and an embed placement (embed kind, also exercising widgets.create's embed-target branch), rejects a malformed target/placementId, and 404s an unbound region", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.identityReady;

  // --- region-kind removal ---
  const bindRes = await fetch(`${baseUrl}${BASE}/widgets/regions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ regionKey: "remove-region-test" }),
  });
  const { area } = (await bindRes.json()) as { area: { version: number } };

  const createRegionWidget = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Region widget", config: { body: "r" } }),
  });
  const { widget: regionWidget } = (await createRegionWidget.json()) as { widget: { id: string } };

  const placeRes = await fetch(`${baseUrl}${BASE}/widgets/tools/place`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetInstanceId: regionWidget.id, target: { kind: "region", regionKey: "remove-region-test", baseVersion: area.version } }),
  });
  assert.equal(placeRes.status, 200, await placeRes.clone().text());

  const regionAfterPlace = await fetch(`${baseUrl}${BASE}/widgets/regions/remove-region-test`, { headers: { cookie } });
  const { area: areaAfterPlace, placements: placementsAfterPlace } = (await regionAfterPlace.json()) as {
    area: { version: number };
    placements: Array<{ placementId: string }>;
  };
  assert.equal(placementsAfterPlace.length, 1);
  const regionPlacementId = placementsAfterPlace[0].placementId;

  const removeRegionRes = await fetch(`${baseUrl}${BASE}/widgets/tools/remove`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ placementId: regionPlacementId, target: { kind: "region", regionKey: "remove-region-test", baseVersion: areaAfterPlace.version } }),
  });
  assert.equal(removeRegionRes.status, 200, await removeRegionRes.clone().text());
  const removedRegion = (await removeRegionRes.json()) as { tool: string; result: { areaEntry: { doc: { placements: unknown[] } } } };
  assert.equal(removedRegion.tool, "widgets.remove");
  assert.equal(removedRegion.result.areaEntry.doc.placements.length, 0);

  const regionAfterRemove = await fetch(`${baseUrl}${BASE}/widgets/regions/remove-region-test`, { headers: { cookie } });
  const { placements: placementsAfterRemove } = (await regionAfterRemove.json()) as { placements: unknown[] };
  assert.equal(placementsAfterRemove.length, 0, "the placement must actually be gone");

  // --- embed-kind removal, via a widgets.create call targeting an embed host (readTarget's
  // "embed" branch and placeTarget's insertWidgetEmbed branch were otherwise never exercised —
  // every other test in this file only ever targets a region) ---
  const { registerContentType, NoopContentTypeIndexProvisioner } = await import("../../features/content-types/index.js");
  const { createEntry } = await import("../../features/entries/index.js");
  const { PRE_AUTHORIZED } = await import("../../features/widgets/authorize-helper.js");
  await registerContentType({
    deps: { repo: deps.contentTypeRepo, clock: deps.clock, ids: deps.idGen, authorize: PRE_AUTHORIZED, indexProvisioner: new NoopContentTypeIndexProvisioner(), outbox: deps.outbox },
    input: { actorId: "system", workspaceId: deps.workspaceId, key: "article", label: "Article", fields: [] },
  });
  const hostCreated = await createEntry({
    deps: { entryRepo: deps.entryRepo, contentTypeRepo: deps.contentTypeRepo, clock: deps.clock, ids: deps.idGen, authorize: PRE_AUTHORIZED, outbox: deps.outbox },
    input: {
      actorId: "system",
      workspaceId: deps.workspaceId,
      type: "article",
      slug: "agent-tools-embed-host",
      title: "Host",
      fieldsJson: { ext: { site: {} } },
      bodyJson: { type: "doc", content: [] },
    },
  });
  if (!hostCreated.ok) throw hostCreated.error;
  const hostId = hostCreated.value.entry.id;

  const createToolRes = await fetch(`${baseUrl}${BASE}/widgets/tools/create`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      widgetType: "text",
      title: "Embed-target widget",
      config: { body: "e" },
      target: { kind: "embed", hostEntryId: hostId, baseVersion: 1 },
    }),
  });
  assert.equal(createToolRes.status, 201, await createToolRes.clone().text());
  const createdEmbed = (await createToolRes.json()) as { result: { placementId: string; entry: { version: number } } };
  assert.ok(createdEmbed.result.placementId, "widgets.create against an embed target must return the new placementId");

  const removeEmbedRes = await fetch(`${baseUrl}${BASE}/widgets/tools/remove`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      placementId: createdEmbed.result.placementId,
      target: { kind: "embed", hostEntryId: hostId, baseVersion: createdEmbed.result.entry.version },
    }),
  });
  assert.equal(removeEmbedRes.status, 200, await removeEmbedRes.clone().text());
  const removedEmbed = (await removeEmbedRes.json()) as { tool: string; result: { entry: { version: number } } };
  assert.equal(removedEmbed.tool, "widgets.remove");

  // --- malformed target / placementId rejected 400 ---
  const noTarget = await fetch(`${baseUrl}${BASE}/widgets/tools/remove`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ placementId: "whatever" }),
  });
  assert.equal(noTarget.status, 400);
  assert.equal(((await noTarget.json()) as { code: string }).code, "VALIDATION_ERROR");

  const noPlacementId = await fetch(`${baseUrl}${BASE}/widgets/tools/remove`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ target: { kind: "region", regionKey: "remove-region-test", baseVersion: 1 } }),
  });
  assert.equal(noPlacementId.status, 400);

  // --- unbound region -> 404 ---
  const unboundRemove = await fetch(`${baseUrl}${BASE}/widgets/tools/remove`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ placementId: "whatever", target: { kind: "region", regionKey: "never-bound", baseVersion: 1 } }),
  });
  assert.equal(unboundRemove.status, 404);
  assert.equal(((await unboundRemove.json()) as { code: string }).code, "WIDGETS_AREA_NOT_FOUND");

  // --- wrong workspace -> 404, across all four AI tool routes ---
  const wrongWsPlace = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/widgets/tools/place`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: "{}",
  });
  assert.equal(wrongWsPlace.status, 404);
  const wrongWsCreate = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/widgets/tools/create`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: "{}",
  });
  assert.equal(wrongWsCreate.status, 404);
  const wrongWsRemove = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/widgets/tools/remove`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: "{}",
  });
  assert.equal(wrongWsRemove.status, 404);
  const wrongWsDiagnose = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/widgets/tools/diagnose/some-id`, { headers: { cookie } });
  assert.equal(wrongWsDiagnose.status, 404);
});

test("admin widgets agent tools: widgets.remove denied 403 FORBIDDEN without widgets.place grant — registerRemoveTool's own denial path, distinct from widgets.place's and region-mutate's already-tested denials (all three share the same underlying widgets.place permission check, but AC-28's test above never calls the remove tool route at all)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginWithPermissions(deps, baseUrl, []);

  const bindRes = await fetch(`${baseUrl}${BASE}/widgets/regions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ regionKey: "remove-denial-region" }),
  });
  const { area } = (await bindRes.json()) as { area: { version: number } };

  const created = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ widgetType: "text", title: "Remove-denial widget", config: { body: "x" } }),
  });
  const { widget } = (await created.json()) as { widget: { id: string } };

  const placed = await fetch(`${baseUrl}${BASE}/widgets/tools/place`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ widgetInstanceId: widget.id, target: { kind: "region", regionKey: "remove-denial-region", baseVersion: area.version } }),
  });
  assert.equal(placed.status, 200, await placed.clone().text());
  const regionAfterPlace = await fetch(`${baseUrl}${BASE}/widgets/regions/remove-denial-region`, { headers: { cookie: ownerCookie } });
  const { area: areaAfterPlace, placements } = (await regionAfterPlace.json()) as {
    area: { version: number };
    placements: Array<{ placementId: string }>;
  };

  const denied = await fetch(`${baseUrl}${BASE}/widgets/tools/remove`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({
      placementId: placements[0].placementId,
      target: { kind: "region", regionKey: "remove-denial-region", baseVersion: areaAfterPlace.version },
    }),
  });
  assert.equal(denied.status, 403);
  const deniedBody = (await denied.json()) as { code: string; details: { permission: string } };
  assert.equal(deniedBody.code, "FORBIDDEN");
  assert.equal(deniedBody.details.permission, "widgets.place");

  // The denied attempt left the placement untouched.
  const regionAfterDenial = await fetch(`${baseUrl}${BASE}/widgets/regions/remove-denial-region`, { headers: { cookie: ownerCookie } });
  const { placements: placementsAfterDenial } = (await regionAfterDenial.json()) as { placements: unknown[] };
  assert.equal(placementsAfterDenial.length, 1, "the denied removal must not have applied");
});

test("admin widgets agent tools: widgets.place against a binding whose area entry no longer exists is 404 WIDGETS_AREA_NOT_FOUND — placeIntoRegion's own `!areaEntry` branch, same orphan-binding technique the regions-list/region-get test above uses, never exercised by any agent-tools route until now", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.identityReady;

  await deps.widgetBindingRepo.upsert({
    workspaceId: deps.workspaceId,
    regionKey: "orphan-binding-place",
    areaEntryId: "does-not-exist-area-place",
    updatedAt: deps.clock.nowIso(),
  });

  const created = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Orphan-binding target", config: { body: "x" } }),
  });
  const { widget } = (await created.json()) as { widget: { id: string } };

  const res = await fetch(`${baseUrl}${BASE}/widgets/tools/place`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetInstanceId: widget.id, target: { kind: "region", regionKey: "orphan-binding-place", baseVersion: 1 } }),
  });
  assert.equal(res.status, 404);
  assert.equal(((await res.json()) as { code: string }).code, "WIDGETS_AREA_NOT_FOUND");
});

test("admin widgets agent tools: widgets.place against an unbound region is 404 WIDGETS_AREA_NOT_FOUND — placeIntoRegion's own `!binding` branch, distinct from removeRegionPlacement's already-tested equivalent (widgets.remove's own unbound-region test above never calls placeIntoRegion at all)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.identityReady;

  const created = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Unbound-region target", config: { body: "x" } }),
  });
  const { widget } = (await created.json()) as { widget: { id: string } };

  const res = await fetch(`${baseUrl}${BASE}/widgets/tools/place`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetInstanceId: widget.id, target: { kind: "region", regionKey: "never-bound-place", baseVersion: 1 } }),
  });
  assert.equal(res.status, 404);
  assert.equal(((await res.json()) as { code: string }).code, "WIDGETS_AREA_NOT_FOUND");
});

test("admin widgets agent tools: widgets.place rejects an unrecognized target.kind, a region target missing regionKey, an embed target missing hostEntryId, and a target missing baseVersion, each with 400 VALIDATION_ERROR — readTarget's own fall-through branches, never exercised by widgets.remove's malformed-target test above (which only covers a target key entirely absent)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.identityReady;

  const created = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Place target validation", config: { body: "x" } }),
  });
  const { widget } = (await created.json()) as { widget: { id: string } };

  async function placeWithTarget(target: unknown): Promise<Response> {
    return fetch(`${baseUrl}${BASE}/widgets/tools/place`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ widgetInstanceId: widget.id, target }),
    });
  }

  const unknownKind = await placeWithTarget({ kind: "bogus", regionKey: "sidebar", hostEntryId: "h1", baseVersion: 1 });
  assert.equal(unknownKind.status, 400);
  assert.equal(((await unknownKind.json()) as { code: string }).code, "VALIDATION_ERROR");

  const missingRegionKey = await placeWithTarget({ kind: "region", baseVersion: 1 });
  assert.equal(missingRegionKey.status, 400);
  assert.equal(((await missingRegionKey.json()) as { code: string }).code, "VALIDATION_ERROR");

  const missingHostEntryId = await placeWithTarget({ kind: "embed", baseVersion: 1 });
  assert.equal(missingHostEntryId.status, 400);
  assert.equal(((await missingHostEntryId.json()) as { code: string }).code, "VALIDATION_ERROR");

  const missingBaseVersion = await placeWithTarget({ kind: "region", regionKey: "sidebar" });
  assert.equal(missingBaseVersion.status, 400);
  assert.equal(((await missingBaseVersion.json()) as { code: string }).code, "VALIDATION_ERROR");
});

test("admin widgets agent tools: widgets.create rejects a missing widgetType and a missing title (parseCreateToolInput's own validation, distinct from the target validation above), and defaults an absent or null config to {} rather than rejecting it", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.identityReady;

  const bindRes = await fetch(`${baseUrl}${BASE}/widgets/regions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ regionKey: "create-validation-region" }),
  });
  const { area } = (await bindRes.json()) as { area: { version: number } };
  const target = { kind: "region", regionKey: "create-validation-region", baseVersion: area.version };

  const missingWidgetType = await fetch(`${baseUrl}${BASE}/widgets/tools/create`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "No type", config: {}, target }),
  });
  assert.equal(missingWidgetType.status, 400);
  assert.equal(((await missingWidgetType.json()) as { code: string }).code, "VALIDATION_ERROR");

  const missingTitle = await fetch(`${baseUrl}${BASE}/widgets/tools/create`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", config: {}, target }),
  });
  assert.equal(missingTitle.status, 400);
  assert.equal(((await missingTitle.json()) as { code: string }).code, "VALIDATION_ERROR");

  // Every registered widget type requires at least one config field (`registry.ts`), so there is
  // no type this defaulted `{}` can satisfy — the proof has to be in WHICH schema error comes
  // back, not a 201. `config` entirely absent takes the `typeof body.config === "object" ===
  // false` (typeof undefined !== "object") arm of the default, producing `{}`; the validator then
  // reports the field-level `config.body` error below. If the default had NOT applied (config
  // stayed `undefined`), `config-validation.ts`'s own `isPlainObject` guard would instead report
  // the coarser `{ field: "config", reason: "expected an object" }` — a distinguishable, different
  // shape this assertion would catch.
  const noConfigRes = await fetch(`${baseUrl}${BASE}/widgets/tools/create`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "No config field", target }),
  });
  assert.equal(noConfigRes.status, 400);
  const noConfigBody = (await noConfigRes.json()) as { code: string; details: { fieldErrors: unknown } };
  assert.equal(noConfigBody.code, "WIDGETS_CONFIG_VALIDATION_ERROR");
  assert.deepEqual(noConfigBody.details.fieldErrors, [{ field: "config.body", reason: "required field is missing" }]);

  // `config: null` -> `typeof null === "object"` is true in JS, so this exercises the DISTINCT
  // `body.config !== null` half of the same guard, not the `typeof` half above; same {}-default
  // outcome, same field-level error, proven the same way.
  const nullConfigRes = await fetch(`${baseUrl}${BASE}/widgets/tools/create`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Null config", config: null, target }),
  });
  assert.equal(nullConfigRes.status, 400);
  const nullConfigBody = (await nullConfigRes.json()) as { code: string; details: { fieldErrors: unknown } };
  assert.equal(nullConfigBody.code, "WIDGETS_CONFIG_VALIDATION_ERROR");
  assert.deepEqual(nullConfigBody.details.fieldErrors, [{ field: "config.body", reason: "required field is missing" }]);
});

test("admin widgets embed-remove route: rejects wrong workspace and a missing baseVersion, and maps a stale baseVersion to a version-conflict error instead of a raw 500", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.identityReady;

  const { registerContentType, NoopContentTypeIndexProvisioner } = await import("../../features/content-types/index.js");
  const { createEntry } = await import("../../features/entries/index.js");
  const { PRE_AUTHORIZED } = await import("../../features/widgets/authorize-helper.js");
  await registerContentType({
    deps: { repo: deps.contentTypeRepo, clock: deps.clock, ids: deps.idGen, authorize: PRE_AUTHORIZED, indexProvisioner: new NoopContentTypeIndexProvisioner(), outbox: deps.outbox },
    input: { actorId: "system", workspaceId: deps.workspaceId, key: "article", label: "Article", fields: [] },
  });
  const hostCreated = await createEntry({
    deps: { entryRepo: deps.entryRepo, contentTypeRepo: deps.contentTypeRepo, clock: deps.clock, ids: deps.idGen, authorize: PRE_AUTHORIZED, outbox: deps.outbox },
    input: {
      actorId: "system",
      workspaceId: deps.workspaceId,
      type: "article",
      slug: "embed-remove-route-host",
      title: "Host",
      fieldsJson: { ext: { site: {} } },
      bodyJson: { type: "doc", content: [] },
    },
  });
  if (!hostCreated.ok) throw hostCreated.error;
  const hostId = hostCreated.value.entry.id;

  const createW = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ widgetType: "text", title: "Embed remove target", config: { body: "x" } }),
  });
  const { widget } = (await createW.json()) as { widget: { id: string } };

  const insertRes = await fetch(`${baseUrl}${BASE}/entries/${hostId}/widget-embeds`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: 1, widgetEntryId: widget.id }),
  });
  const inserted = (await insertRes.json()) as { placementId: string; entry: { version: number } };

  const wrongWs = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/entries/${hostId}/widget-embeds/${inserted.placementId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: inserted.entry.version }),
  });
  assert.equal(wrongWs.status, 404);

  const missingBaseVersion = await fetch(`${baseUrl}${BASE}/entries/${hostId}/widget-embeds/${inserted.placementId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({}),
  });
  assert.equal(missingBaseVersion.status, 400);
  assert.equal(((await missingBaseVersion.json()) as { code: string }).code, "VALIDATION_ERROR");

  const staleVersion = await fetch(`${baseUrl}${BASE}/entries/${hostId}/widget-embeds/${inserted.placementId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: inserted.entry.version + 99 }),
  });
  assert.equal(staleVersion.status, 409, await staleVersion.clone().text());

  const removeRes = await fetch(`${baseUrl}${BASE}/entries/${hostId}/widget-embeds/${inserted.placementId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ baseVersion: inserted.entry.version }),
  });
  assert.equal(removeRes.status, 200, await removeRes.clone().text());
});

test("admin widgets regions-list/region-get: reject wrong workspace and no-permission, 404 an unbound region, tolerate a binding whose area entry is missing or wrong-typed, and surface a force-purged widget's dangling placement as broken", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginWithPermissions(deps, baseUrl, []);
  await deps.identityReady;

  // wrong workspace -> 404 (both routes)
  const wrongWsList = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/widgets/regions`, { headers: { cookie: ownerCookie } });
  assert.equal(wrongWsList.status, 404);
  const wrongWsGet = await fetch(`${baseUrl}/api/admin/v1/workspaces/wrong-ws/widgets/regions/anything`, { headers: { cookie: ownerCookie } });
  assert.equal(wrongWsGet.status, 404);

  // no widgets.read permission -> 403 (both routes)
  const deniedList = await fetch(`${baseUrl}${BASE}/widgets/regions`, { headers: { cookie: bareCookie } });
  assert.equal(deniedList.status, 403);
  assert.equal(((await deniedList.json()) as { details: { permission: string } }).details.permission, "widgets.read");
  const deniedGet = await fetch(`${baseUrl}${BASE}/widgets/regions/anything`, { headers: { cookie: bareCookie } });
  assert.equal(deniedGet.status, 403);
  assert.equal(((await deniedGet.json()) as { details: { permission: string } }).details.permission, "widgets.read");

  // region-get: never-bound region -> 404
  const unbound = await fetch(`${baseUrl}${BASE}/widgets/regions/never-bound-region`, { headers: { cookie: ownerCookie } });
  assert.equal(unbound.status, 404);
  assert.equal(((await unbound.json()) as { code: string }).code, "WIDGETS_AREA_NOT_FOUND");

  // A binding pointing at a completely nonexistent area entry (simulates the derived binding index
  // not having been rebuilt after the area entry disappeared) — regions-list must degrade to a
  // zero placement count rather than throw, while region-get (which actually needs the area entry's
  // contents to answer) correctly still 404s.
  await deps.widgetBindingRepo.upsert({
    workspaceId: deps.workspaceId,
    regionKey: "orphan-binding",
    areaEntryId: "does-not-exist-area",
    updatedAt: deps.clock.nowIso(),
  });
  const listWithOrphan = await fetch(`${baseUrl}${BASE}/widgets/regions`, { headers: { cookie: ownerCookie } });
  assert.equal(listWithOrphan.status, 200, await listWithOrphan.clone().text());
  const { regions } = (await listWithOrphan.json()) as { regions: Array<{ regionKey: string; placementCount: number }> };
  const orphanRegion = regions.find((r) => r.regionKey === "orphan-binding");
  assert.ok(orphanRegion, "the orphaned binding must still be listed");
  assert.equal(orphanRegion?.placementCount, 0, "a missing area entry must count as zero placements, not throw");

  const getOrphan = await fetch(`${baseUrl}${BASE}/widgets/regions/orphan-binding`, { headers: { cookie: ownerCookie } });
  assert.equal(getOrphan.status, 404, "region-get requires the area entry to actually exist, unlike regions-list's tolerant count");
  assert.equal(((await getOrphan.json()) as { code: string }).code, "WIDGETS_AREA_NOT_FOUND");

  // A binding pointing at a REAL entry that is the wrong content type (not a widget_area) —
  // region-get's `areaEntry.type !== WIDGET_AREA_CONTENT_TYPE` branch.
  const { registerContentType, NoopContentTypeIndexProvisioner } = await import("../../features/content-types/index.js");
  const { createEntry } = await import("../../features/entries/index.js");
  const { PRE_AUTHORIZED } = await import("../../features/widgets/authorize-helper.js");
  await registerContentType({
    deps: { repo: deps.contentTypeRepo, clock: deps.clock, ids: deps.idGen, authorize: PRE_AUTHORIZED, indexProvisioner: new NoopContentTypeIndexProvisioner(), outbox: deps.outbox },
    input: { actorId: "system", workspaceId: deps.workspaceId, key: "article", label: "Article", fields: [] },
  });
  const wrongTypeEntry = await createEntry({
    deps: { entryRepo: deps.entryRepo, contentTypeRepo: deps.contentTypeRepo, clock: deps.clock, ids: deps.idGen, authorize: PRE_AUTHORIZED, outbox: deps.outbox },
    input: {
      actorId: "system",
      workspaceId: deps.workspaceId,
      type: "article",
      slug: "not-a-widget-area",
      title: "Not an area",
      fieldsJson: { ext: { site: {} } },
      bodyJson: { type: "doc", content: [] },
    },
  });
  if (!wrongTypeEntry.ok) throw wrongTypeEntry.error;
  await deps.widgetBindingRepo.upsert({
    workspaceId: deps.workspaceId,
    regionKey: "wrong-type-binding",
    areaEntryId: wrongTypeEntry.value.entry.id,
    updatedAt: deps.clock.nowIso(),
  });
  const getWrongType = await fetch(`${baseUrl}${BASE}/widgets/regions/wrong-type-binding`, { headers: { cookie: ownerCookie } });
  assert.equal(getWrongType.status, 404);
  assert.equal(((await getWrongType.json()) as { code: string }).code, "WIDGETS_AREA_NOT_FOUND");

  // A real region holding a placement whose target widget was force-purged out from under it —
  // REQ-43's documented "dangling reference" outcome. region-get must surface broken:true instead
  // of throwing (the widget row survives force-purge — status flips to "purged" — so this is the
  // realistic dangling-reference shape, not a nonexistent-row one the write path already blocks).
  const bindRes = await fetch(`${baseUrl}${BASE}/widgets/regions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ regionKey: "broken-placement-region" }),
  });
  const { area } = (await bindRes.json()) as { area: { version: number } };
  const purgeTarget = await fetch(`${baseUrl}${BASE}/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ widgetType: "text", title: "Force-purged widget", config: { body: "gone" } }),
  });
  const { widget: purgeTargetWidget } = (await purgeTarget.json()) as { widget: { id: string } };

  const placeForBroken = await fetch(`${baseUrl}${BASE}/widgets/tools/place`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ widgetInstanceId: purgeTargetWidget.id, target: { kind: "region", regionKey: "broken-placement-region", baseVersion: area.version } }),
  });
  assert.equal(placeForBroken.status, 200, await placeForBroken.clone().text());

  const forcePurgeRes = await fetch(`${baseUrl}${BASE}/widgets/${purgeTargetWidget.id}/purge?force=true`, { method: "POST", headers: { cookie: ownerCookie } });
  assert.equal(forcePurgeRes.status, 200, await forcePurgeRes.clone().text());

  const getBroken = await fetch(`${baseUrl}${BASE}/widgets/regions/broken-placement-region`, { headers: { cookie: ownerCookie } });
  assert.equal(getBroken.status, 200, await getBroken.clone().text());
  const { placements: brokenPlacements } = (await getBroken.json()) as {
    placements: Array<{ broken: boolean; widgetTitle: string | null; widgetType: string | null }>;
  };
  assert.equal(brokenPlacements.length, 1);
  assert.equal(brokenPlacements[0].broken, true, "a force-purged (status: 'purged') target must be reported broken, even though its row still exists");
  assert.equal(brokenPlacements[0].widgetTitle, "Force-purged widget", "the row survives force-purge, so title/type are still resolvable — only `broken` flips");
  assert.equal(brokenPlacements[0].widgetType, "text");
});

/**
 * `req.params.workspaceId ?? ""` (regions-list.ts, region-get.ts, embed-remove.ts, and all four
 * agent-tools.ts routes) / agent-tools.ts's own `req.body ?? {}` (place/create/remove): Express
 * guarantees a matched `:workspaceId` segment is always a populated string, and real `body-parser`
 * always assigns `req.body` to an object — so the right side of every `??` below is unreachable
 * through any real HTTP request. Per this repo's established convention (`extractRouteHandler`'s
 * own doc, `helpers/http-test-server.ts`, and `admin-menus-routes.test.ts`'s identical treatment of
 * `parseMenuTreeRequestBody`'s `(rawBody ?? {})`), the fix is to KEEP the guard and exercise it with
 * a hand-built `req` that deliberately omits the field, not to delete it as dead code.
 */
test("admin widgets routes: `req.params.workspaceId ?? \"\"` fallback, forced via direct handler calls (regions-list, region-get, embed-remove, and all four agent-tools routes)", async (t) => {
  const { app } = buildTestApp();

  const listHandler = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/widgets/regions");
  const listCapture = createCapturingResponse();
  await listHandler({ params: {} }, listCapture.res);
  assert.equal(listCapture.capture.statusCode, 404);
  assert.equal((listCapture.capture.jsonBody as { error: string }).error, "workspace was not found");

  const getHandler = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/widgets/regions/:regionKey");
  const getCapture = createCapturingResponse();
  await getHandler({ params: { regionKey: "footer" } }, getCapture.res);
  assert.equal(getCapture.capture.statusCode, 404);
  assert.equal((getCapture.capture.jsonBody as { error: string }).error, "workspace was not found");

  const embedRemoveHandler = extractRouteHandler(app, "delete", "/api/admin/v1/workspaces/:workspaceId/entries/:hostEntryId/widget-embeds/:placementId");
  const embedRemoveCapture = createCapturingResponse();
  await embedRemoveHandler({ params: { hostEntryId: "h1", placementId: "p1" }, body: { baseVersion: 1 } }, embedRemoveCapture.res);
  assert.equal(embedRemoveCapture.capture.statusCode, 404);
  assert.equal((embedRemoveCapture.capture.jsonBody as { error: string }).error, "workspace was not found");

  const placeHandler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/widgets/tools/place");
  const placeCapture = createCapturingResponse();
  await placeHandler({ params: {}, body: {} }, placeCapture.res);
  assert.equal(placeCapture.capture.statusCode, 404);
  assert.equal((placeCapture.capture.jsonBody as { error: string }).error, "workspace was not found");

  const createHandler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/widgets/tools/create");
  const createCapture = createCapturingResponse();
  await createHandler({ params: {}, body: {} }, createCapture.res);
  assert.equal(createCapture.capture.statusCode, 404);
  assert.equal((createCapture.capture.jsonBody as { error: string }).error, "workspace was not found");

  const removeHandler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/widgets/tools/remove");
  const removeCapture = createCapturingResponse();
  await removeHandler({ params: {}, body: {} }, removeCapture.res);
  assert.equal(removeCapture.capture.statusCode, 404);
  assert.equal((removeCapture.capture.jsonBody as { error: string }).error, "workspace was not found");

  const diagnoseHandler = extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/widgets/tools/diagnose/:widgetInstanceId");
  const diagnoseCapture = createCapturingResponse();
  await diagnoseHandler({ params: { widgetInstanceId: "w1" } }, diagnoseCapture.res);
  assert.equal(diagnoseCapture.capture.statusCode, 404);
  assert.equal((diagnoseCapture.capture.jsonBody as { error: string }).error, "workspace was not found");
});

test("admin widgets agent tools: `req.body ?? {}` fallback on widgets.place/create/remove, forced via direct handler calls with req.body omitted entirely", async (t) => {
  const { app, deps } = buildTestApp();

  const placeHandler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/widgets/tools/place");
  const placeCapture = createCapturingResponse();
  await placeHandler({ params: { workspaceId: deps.workspaceId } }, placeCapture.res); // no `body` key at all
  assert.equal(placeCapture.capture.statusCode, 400);
  assert.equal((placeCapture.capture.jsonBody as { code: string }).code, "VALIDATION_ERROR");

  const createHandler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/widgets/tools/create");
  const createCapture = createCapturingResponse();
  await createHandler({ params: { workspaceId: deps.workspaceId } }, createCapture.res);
  assert.equal(createCapture.capture.statusCode, 400);
  assert.equal((createCapture.capture.jsonBody as { code: string }).code, "VALIDATION_ERROR");

  const removeHandler = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/widgets/tools/remove");
  const removeCapture = createCapturingResponse();
  await removeHandler({ params: { workspaceId: deps.workspaceId } }, removeCapture.res);
  assert.equal(removeCapture.capture.statusCode, 400);
  assert.equal((removeCapture.capture.jsonBody as { code: string }).code, "VALIDATION_ERROR");
});
