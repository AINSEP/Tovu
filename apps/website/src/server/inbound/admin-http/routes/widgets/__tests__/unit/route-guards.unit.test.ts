import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryWidgetRegionBindingRepo, WIDGET_AREA_CONTENT_TYPE } from "@jini-ai/cms/widgets";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminWidgetCreateRoute } from "../../create.js";
import { registerAdminWidgetEmbedInsertRoute } from "../../embed-insert.js";
import { registerAdminWidgetEmbedRemoveRoute } from "../../embed-remove.js";
import { registerAdminWidgetEmbedReorderRoute } from "../../embed-reorder.js";
import { registerAdminWidgetGetRoute } from "../../get-by-id.js";
import { registerAdminWidgetListRoute } from "../../list.js";
import { registerAdminWidgetPreviewRoute } from "../../preview.js";
import { registerAdminWidgetRegionBindRoute } from "../../region-bind.js";
import { registerAdminWidgetRegionGetRoute } from "../../region-get.js";
import { parseWidgetRegionPlacements, registerAdminWidgetRegionMutatePlacementsRoute } from "../../region-mutate-placements.js";
import { registerAdminWidgetRegionsListRoute } from "../../regions-list.js";
import { registerAdminWidgetTrashRoute } from "../../trash.js";
import { registerAdminWidgetAgentToolsRoutes } from "../../agent-tools.js";

/**
 * @file Direct-handler coverage for the admin widget routes' defensive edges: the `?? ""`
 * route-param guard (a hand-built req carrying no `workspaceId` is refused 404, never coerced into
 * a lookup), absent JSON bodies, malformed placement shapes, and domain failures reaching each
 * route's error mapping. Every route runs against real in-memory repositories.
 */

const B = "/api/admin/v1/workspaces/:workspaceId";
type Method = "get" | "post" | "put" | "delete";

function harness({ allowed = true }: { allowed?: boolean } = {}) {
  const app = express();
  let authorizeCalls = 0;
  let counter = 0;
  const entryRepo = new InMemoryEntryRepo();
  const widgetBindingRepo = new InMemoryWidgetRegionBindingRepo();
  const deps = {
    workspaceId: "ws-1",
    authorize: async () => { authorizeCalls++; return { allowed, reason: allowed ? "matched" : "denied" }; },
    entryRepo,
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    outbox: new InMemoryOutbox(),
    widgetBindingRepo,
    clock: { nowMs: () => Date.parse("2026-10-01T12:00:00.000Z"), nowIso: () => "2026-10-01T12:00:00.000Z" },
    idGen: { newId: () => `guard-${++counter}` },
  } as unknown as RouteDeps;
  for (const register of [
    registerAdminWidgetCreateRoute, registerAdminWidgetEmbedInsertRoute, registerAdminWidgetEmbedRemoveRoute,
    registerAdminWidgetEmbedReorderRoute, registerAdminWidgetGetRoute, registerAdminWidgetListRoute,
    registerAdminWidgetRegionBindRoute, registerAdminWidgetRegionGetRoute, registerAdminWidgetRegionMutatePlacementsRoute,
    registerAdminWidgetRegionsListRoute, registerAdminWidgetTrashRoute, registerAdminWidgetAgentToolsRoutes,
  ]) register(app, deps);
  registerAdminWidgetPreviewRoute(app, deps);
  return {
    entryRepo,
    widgetBindingRepo,
    authorizeCalls: () => authorizeCalls,
    invoke: async (method: Method, path: string, req: { params?: Record<string, string>; body?: unknown; query?: unknown }, principal: unknown = { id: "principal-1" }) => {
      const { res, capture } = createCapturingResponse();
      const headers: Record<string, string> = {};
      (res as any).setHeader = (name: string, value: string) => { headers[name] = value; };
      if (principal) res.locals.principal = principal;
      await extractRouteHandler(app, method, path)({ params: {}, query: {}, ...req }, res);
      return { ...capture, headers };
    },
  };
}

const ROUTES: Array<[Method, string]> = [
  ["post", `${B}/widgets`],
  ["post", `${B}/entries/:hostEntryId/widget-embeds`],
  ["delete", `${B}/entries/:hostEntryId/widget-embeds/:placementId`],
  ["put", `${B}/entries/:hostEntryId/widget-embeds`],
  ["get", `${B}/widgets/:id`],
  ["get", `${B}/widgets`],
  ["get", `${B}/widgets/regions/:regionKey`],
  ["put", `${B}/widgets/regions/:regionKey`],
  ["get", `${B}/widgets/regions`],
  ["post", `${B}/widgets/:id/trash`],
  ["post", `${B}/widgets/preview`],
];

test("every widget route refuses a request carrying no workspaceId param 404, before authorization", async () => {
  const h = harness();
  for (const [method, path] of ROUTES) {
    const result = await h.invoke(method, path, { params: {}, body: { baseVersion: 1, widgetEntryId: "w", widgetType: "text", title: "T", placements: [], orderedWidgetEntryIds: ["w"] } });
    assert.deepEqual({ statusCode: result.statusCode, jsonBody: result.jsonBody }, { statusCode: 404, jsonBody: { error: "workspace was not found" } }, `${method} ${path}`);
  }
  assert.equal(h.authorizeCalls(), 0);
});

test("every widget route refuses a foreign workspace 404", async () => {
  const h = harness();
  for (const [method, path] of ROUTES) {
    const result = await h.invoke(method, path, { params: { workspaceId: "ws-other", id: "x", regionKey: "r", hostEntryId: "h", placementId: "p" }, body: {} });
    assert.equal(result.statusCode, 404, `${method} ${path}`);
    assert.deepEqual(result.jsonBody, { error: "workspace was not found" });
  }
  assert.equal(h.authorizeCalls(), 0);
});

test("preview without an authenticated principal fails closed 401 and is never cached", async () => {
  const h = harness();
  const result = await h.invoke("post", `${B}/widgets/preview`, { params: { workspaceId: "ws-1" }, body: { widgetType: "text", content: {} } }, null);
  assert.deepEqual(result, { statusCode: 401, jsonBody: { error: "authentication required" }, headers: { "Cache-Control": "no-store" } });
  assert.equal(h.authorizeCalls(), 0);
});

test("create, embed remove and embed reorder treat an absent JSON body as a validation error", async () => {
  const h = harness();
  const params = { workspaceId: "ws-1", hostEntryId: "host-1", placementId: "p-1" };
  assert.deepEqual((await h.invoke("post", `${B}/widgets`, { params, body: undefined })).jsonBody, {
    error: "widgetType and title are required strings", code: "VALIDATION_ERROR",
  });
  assert.deepEqual((await h.invoke("delete", `${B}/entries/:hostEntryId/widget-embeds/:placementId`, { params, body: undefined })).jsonBody, {
    error: "baseVersion is required", code: "VALIDATION_ERROR",
  });
  for (const body of [undefined, { baseVersion: 1, orderedWidgetEntryIds: "w-1" }, { baseVersion: 1, orderedWidgetEntryIds: ["w-1", ""] }, { baseVersion: 1, orderedWidgetEntryIds: [7] }]) {
    const result = await h.invoke("put", `${B}/entries/:hostEntryId/widget-embeds`, { params, body });
    assert.deepEqual({ statusCode: result.statusCode, jsonBody: result.jsonBody }, {
      statusCode: 400, jsonBody: { error: "baseVersion and non-empty string orderedWidgetEntryIds[] are required", code: "VALIDATION_ERROR" },
    });
  }
  assert.equal(await h.entryRepo.findById({ workspaceId: "ws-1", id: "host-1" }), null);
});

test("region mutation treats an absent JSON body as a validation error", async () => {
  const h = harness();
  const result = await h.invoke("put", `${B}/widgets/regions/:regionKey`, { params: { workspaceId: "ws-1", regionKey: "sidebar" }, body: undefined });
  assert.deepEqual(result.jsonBody, { error: "baseVersion and placements[] are required", code: "VALIDATION_ERROR" });
});

test("parseWidgetRegionPlacements rejects every malformed placement shape and keeps an object content payload", () => {
  const ok = { placementId: "p-1", widgetEntryId: "w-1", enabled: true };
  for (const bad of [null, "p-1", 3, { ...ok, placementId: 1 }, { ...ok, widgetEntryId: null }, { ...ok, enabled: "yes" },
    { ...ok, content: null }, { ...ok, content: [] }, { ...ok, content: "text" }]) {
    assert.equal(parseWidgetRegionPlacements({ raw: [bad] }), null, JSON.stringify(bad));
  }
  assert.equal(parseWidgetRegionPlacements({ raw: [ok, { ...ok, widgetEntryId: "w-2" }] }), null, "duplicate placementId");
  assert.deepEqual(parseWidgetRegionPlacements({ raw: [{ ...ok, content: { heading: "Hi" } }, { placementId: "p-2", widgetEntryId: "w-2", enabled: false, extra: 1 }] }), [
    { placementId: "p-1", widgetEntryId: "w-1", enabled: true, content: { heading: "Hi" } },
    { placementId: "p-2", widgetEntryId: "w-2", enabled: false },
  ]);
  assert.deepEqual(parseWidgetRegionPlacements({ raw: [] }), []);
});

test("a region whose placements point at a missing entry and at a non-widget entry reports both as broken", async () => {
  const h = harness();
  const bound = await h.invoke("post", `${B}/widgets/regions`, { params: { workspaceId: "ws-1" }, body: { regionKey: "sidebar" } });
  assert.equal(bound.statusCode, 201);
  const binding = await h.widgetBindingRepo.findByRegion({ workspaceId: "ws-1", regionKey: "sidebar" });
  assert.ok(binding);
  const area = await h.entryRepo.findById({ workspaceId: "ws-1", id: binding.areaEntryId });
  assert.ok(area && area.type === WIDGET_AREA_CONTENT_TYPE);
  const fieldsJson = structuredClone(area.fieldsJson) as { ext: Record<string, { payload: string }> };
  const owner = Object.keys(fieldsJson.ext)[0]!;
  const payload = JSON.parse(fieldsJson.ext[owner]!.payload);
  payload.doc.placements = [
    { placementId: "p-missing", widgetEntryId: "gone", enabled: true },
    { placementId: "p-page", widgetEntryId: "page-1", enabled: true },
  ];
  fieldsJson.ext[owner]!.payload = JSON.stringify(payload);
  await h.entryRepo.save({ ...area, fieldsJson });
  await h.entryRepo.save({ ...area, id: "page-1", type: "page", slug: "page-1", title: "A plain page", fieldsJson: {} });

  const result = await h.invoke("get", `${B}/widgets/regions/:regionKey`, { params: { workspaceId: "ws-1", regionKey: "sidebar" } });
  assert.equal(result.statusCode, 200);
  assert.deepEqual((result.jsonBody as { placements: unknown[] }).placements, [
    { placementId: "p-missing", widgetEntryId: "gone", enabled: true, widgetTitle: null, widgetType: null, broken: true },
    { placementId: "p-page", widgetEntryId: "page-1", enabled: true, widgetTitle: "A plain page", widgetType: null, broken: true },
  ]);
});

test("domain refusals inside embed remove, embed reorder, get, trash and the create tool reach the widget error mapping", async () => {
  const h = harness();
  await h.entryRepo.save({
    id: "host-1", workspaceId: "ws-1", type: "article", slug: "host-one", title: "Host One", status: "draft", version: 4,
    fieldsJson: {}, publishedAt: null, bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }] },
    createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z",
  } as any);
  const params = { workspaceId: "ws-1", hostEntryId: "host-1", placementId: "p-1", id: "no-such-widget" };
  const removed = await h.invoke("delete", `${B}/entries/:hostEntryId/widget-embeds/:placementId`, { params, body: { baseVersion: 1 } });
  const reordered = await h.invoke("put", `${B}/entries/:hostEntryId/widget-embeds`, { params, body: { baseVersion: 1, orderedWidgetEntryIds: ["w-1"] } });
  const fetched = await h.invoke("get", `${B}/widgets/:id`, { params });
  const trashed = await h.invoke("post", `${B}/widgets/:id/trash`, { params });
  const created = await h.invoke("post", `${B}/widgets/tools/create`, { params, body: {
    widgetType: "no-such-widget-type", title: "Never created", config: {}, target: { kind: "region", regionKey: "sidebar", baseVersion: 1 },
  } });
  const snapshot = (r: { statusCode: number; jsonBody: unknown }) => [r.statusCode, (r.jsonBody as { code?: string }).code];
  assert.deepEqual([removed, reordered, fetched, trashed, created].map(snapshot), [
    [404, "WIDGETS_EMBED_PLACEMENT_NOT_FOUND"],
    [400, "WIDGETS_EMBED_REORDER_COUNT_MISMATCH"],
    [404, "WIDGETS_INSTANCE_NOT_FOUND"],
    [404, "WIDGETS_INSTANCE_NOT_FOUND"],
    [400, "WIDGETS_TYPE_UNREGISTERED"],
  ]);
  assert.equal((await h.entryRepo.findById({ workspaceId: "ws-1", id: "host-1" }))?.version, 4, "a refused embed mutation leaves the host untouched");
});

test("widgets.diagnose refuses a caller without widgets.read 403, and an index failure reaches the error mapping as 500", async (t) => {
  const denied = harness({ allowed: false });
  const params = { workspaceId: "ws-1", widgetInstanceId: "w-1" };
  const refused = await denied.invoke("get", `${B}/widgets/tools/diagnose/:widgetInstanceId`, { params });
  assert.deepEqual({ statusCode: refused.statusCode, jsonBody: refused.jsonBody }, { statusCode: 403, jsonBody: {
    error: "principal 'principal-1' is not authorized for 'widgets.read' (denied)", code: "FORBIDDEN", details: { permission: "widgets.read", reason: "denied" },
  } });

  const logged: unknown[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });
  const h = harness();
  t.mock.method(h.entryRepo, "findById", async () => { throw new Error("entries table unavailable"); });
  const failed = await h.invoke("get", `${B}/widgets/tools/diagnose/:widgetInstanceId`, { params });
  assert.deepEqual({ statusCode: failed.statusCode, jsonBody: failed.jsonBody }, { statusCode: 500, jsonBody: { error: "internal error" } });
  assert.equal(logged.length, 1);
});

test("region reads and mutations: a binding whose area entry is not a widget area is not found; an unbound region refuses the mutation", async () => {
  const h = harness();
  await h.invoke("post", `${B}/widgets/regions`, { params: { workspaceId: "ws-1" }, body: { regionKey: "footer" } });
  const binding = await h.widgetBindingRepo.findByRegion({ workspaceId: "ws-1", regionKey: "footer" });
  assert.ok(binding);
  const area = await h.entryRepo.findById({ workspaceId: "ws-1", id: binding.areaEntryId });
  await h.entryRepo.save({ ...area!, type: "page" });
  const read = await h.invoke("get", `${B}/widgets/regions/:regionKey`, { params: { workspaceId: "ws-1", regionKey: "footer" } });
  assert.deepEqual({ statusCode: read.statusCode, jsonBody: read.jsonBody }, { statusCode: 404, jsonBody: { error: "region area entry was not found", code: "WIDGETS_AREA_NOT_FOUND" } });

  const unbound = await h.invoke("put", `${B}/widgets/regions/:regionKey`, { params: { workspaceId: "ws-1", regionKey: "nowhere" }, body: { baseVersion: 1, placements: [] } });
  assert.deepEqual({ statusCode: unbound.statusCode, jsonBody: unbound.jsonBody }, { statusCode: 404, jsonBody: { error: "region 'nowhere' is not bound", code: "WIDGETS_AREA_NOT_FOUND" } });
  const malformed = await h.invoke("put", `${B}/widgets/regions/:regionKey`, { params: { workspaceId: "ws-1", regionKey: "footer" }, body: { baseVersion: 1, placements: [{ placementId: "p" }] } });
  assert.equal(malformed.statusCode, 400);
  assert.equal((malformed.jsonBody as { code: string }).code, "VALIDATION_ERROR");
});

test("a region placement pointing at a real but trashed (status \"trash\") widget keeps its title and type yet reports broken", async () => {
  const h = harness();
  const created = await h.invoke("post", `${B}/widgets`, { params: { workspaceId: "ws-1" }, body: { widgetType: "text", title: "Retired notice", config: { body: "old" } } });
  assert.equal(created.statusCode, 201, JSON.stringify(created.jsonBody));
  const widgetId = (created.jsonBody as { widget: { id: string } }).widget.id;
  // The trash route's removal port is out of scope here; the stored payload status is what
  // region-get reads, so mark the instance "trash" directly in storage.
  const widget = await h.entryRepo.findById({ workspaceId: "ws-1", id: widgetId });
  const widgetFields = structuredClone(widget!.fieldsJson) as { ext: Record<string, { payload: string }> };
  const widgetOwner = Object.keys(widgetFields.ext)[0]!;
  const widgetPayload = JSON.parse(widgetFields.ext[widgetOwner]!.payload);
  assert.equal(widgetPayload.status, "active");
  widgetPayload.status = "trash";
  widgetFields.ext[widgetOwner]!.payload = JSON.stringify(widgetPayload);
  await h.entryRepo.save({ ...widget!, fieldsJson: widgetFields });

  await h.invoke("post", `${B}/widgets/regions`, { params: { workspaceId: "ws-1" }, body: { regionKey: "aside" } });
  const binding = await h.widgetBindingRepo.findByRegion({ workspaceId: "ws-1", regionKey: "aside" });
  const area = await h.entryRepo.findById({ workspaceId: "ws-1", id: binding!.areaEntryId });
  const fieldsJson = structuredClone(area!.fieldsJson) as { ext: Record<string, { payload: string }> };
  const owner = Object.keys(fieldsJson.ext)[0]!;
  const payload = JSON.parse(fieldsJson.ext[owner]!.payload);
  payload.doc.placements = [{ placementId: "p-old", widgetEntryId: widgetId, enabled: true }];
  fieldsJson.ext[owner]!.payload = JSON.stringify(payload);
  await h.entryRepo.save({ ...area!, fieldsJson });

  const result = await h.invoke("get", `${B}/widgets/regions/:regionKey`, { params: { workspaceId: "ws-1", regionKey: "aside" } });
  assert.deepEqual((result.jsonBody as { placements: unknown[] }).placements, [
    { placementId: "p-old", widgetEntryId: widgetId, enabled: true, widgetTitle: "Retired notice", widgetType: "text", broken: true },
  ]);
});
