import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminWidgetListRoute } from "../../list.js";
import { registerAdminWidgetGetRoute } from "../../get-by-id.js";
import { registerAdminWidgetCreateRoute } from "../../create.js";
import { registerAdminWidgetAgentToolsRoutes } from "../../agent-tools.js";
import { registerAdminWidgetRegionGetRoute } from "../../region-get.js";
import { registerAdminWidgetRegionsListRoute } from "../../regions-list.js";
import { registerAdminWidgetRegionMutatePlacementsRoute } from "../../region-mutate-placements.js";
import { registerAdminWidgetTrashRoute } from "../../trash.js";
import { InMemoryWidgetRegionBindingRepo } from "@jini-ai/cms/widgets";
import { bindWidgetArea } from "@jini-ai/cms/widgets";
import { buildWidgetsRegionDeps } from "#src/features/widgets/deps";

const base = "/api/admin/v1/workspaces/:workspaceId/widgets";
function row(id: string, widgetType = "text", status = "active") {
  return { id, workspaceId: "ws-7", type: "widget", slug: `slug-${id}`, title: `Title ${id}`,
    status: "published" as const, bodyJson: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z", version: 3,
    fieldsJson: { ext: { widget: { payload: JSON.stringify({ widgetType, status, config: { body: `Body ${id}` } }) } } },
  };
}
function harness(overrides: Record<string, unknown> = {}) {
  let counter = 0;
  const deps = { workspaceId: "ws-7", entryRepo: new InMemoryEntryRepo(), entryRefsRepo: new InMemoryEntryRefsRepo(),
    contentTypeRepo: new InMemoryContentTypeRepo(), outbox: new InMemoryOutbox(), widgetBindingRepo: new InMemoryWidgetRegionBindingRepo(),
    clock: { nowIso: () => "2026-10-01T12:00:00.000Z", nowMs: () => Date.parse("2026-10-01T12:00:00.000Z") }, idGen: { newId: () => `b07-id-${++counter}` },
    authorize: async () => ({ allowed: true, reason: "matched" }), ...overrides,
  };
  const app = express();
  registerAdminWidgetListRoute(app, deps as any);
  registerAdminWidgetGetRoute(app, deps as any);
  registerAdminWidgetCreateRoute(app, deps as any);
  registerAdminWidgetAgentToolsRoutes(app, deps as any);
  registerAdminWidgetRegionGetRoute(app, deps as any);
  registerAdminWidgetRegionsListRoute(app, deps as any);
  registerAdminWidgetRegionMutatePlacementsRoute(app, deps as any);
  registerAdminWidgetTrashRoute(app, deps as any);
  return { deps, invoke: async (method: "get" | "post" | "put", suffix = "", request: Record<string, unknown> = {}) => {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "principal-7" };
    await extractRouteHandler(app, method, base + suffix)({ params: { workspaceId: "ws-7", id: "slug-active-text" }, query: {}, ...request }, res);
    return capture;
  } };
}
// F4.3/F6.2: ignoring widgetType/includeInactive, dropping skippedIds, or using slug as ref target must fail.
test("library filters type, treats only literal true as includeInactive, and emits exact skip diagnostics", async () => {
  const { deps, invoke } = harness();
  for (const entry of [row("active-text"), row("inactive-text", "text", "purged"), row("active-social", "social-links"), { ...row("corrupt"), fieldsJson: {} }]) {
    await deps.entryRepo.save(entry as any);
  }
  for (const [query, ids] of [
    [{}, ["active-text", "active-social"]],
    [{ widgetType: "text", includeInactive: "false" }, ["active-text"]],
    [{ widgetType: "text", includeInactive: "true" }, ["active-text", "inactive-text"]],
    [{ widgetType: "text", includeInactive: true }, ["active-text"]],
    [{ widgetType: ["text"] }, ["active-text", "active-social"]],
  ] as const) {
    const result = await invoke("get", "", { query });
    assert.equal(result.statusCode, 200);
    const body = result.jsonBody as any;
    assert.deepEqual(body.widgets.map((w: any) => w.id), ids);
    assert.equal(body.skippedCount, 1);
    assert.deepEqual(body.skippedIds, ["corrupt"]);
  }
});
test("healthy empty library omits optional skipped fields entirely", async () => {
  const { invoke } = harness();
  assert.deepEqual(await invoke("get"), { statusCode: 200, jsonBody: { widgets: [] } });
});
test("slug lookup reports where-used for the resolved id with exact source locations", async () => {
  const { deps, invoke } = harness();
  await deps.entryRepo.save(row("active-text") as any);
  await deps.entryRefsRepo.rebuildForWorkspace({ workspaceId: "ws-7", refs: [
    { workspaceId: "ws-7", sourceEntryId: "area-7", sourceKind: "widget-area-placement", fieldPath: "doc.placements[2]", targetKind: "entry", targetId: "active-text" },
    { workspaceId: "ws-7", sourceEntryId: "post-8", sourceKind: "widget-embed", fieldPath: "bodyJson.content[1]", targetKind: "entry", targetId: "active-text" },
    { workspaceId: "ws-7", sourceEntryId: "unrelated", sourceKind: "widget-embed", fieldPath: "bodyJson.content[0]", targetKind: "entry", targetId: "other-widget" },
  ] });
  assert.deepEqual(await invoke("get", "/:id"), { statusCode: 200, jsonBody: {
    widget: { id: "active-text", workspaceId: "ws-7", slug: "slug-active-text", title: "Title active-text", status: "active", widgetType: "text", config: { body: "Body active-text" }, updatedAt: "2026-09-02T00:00:00Z", version: 3 },
    revisions: [], whereUsed: { count: 2, references: [
      { kind: "region", sourceEntryId: "area-7", fieldPath: "doc.placements[2]" },
      { kind: "embed", sourceEntryId: "post-8", fieldPath: "bodyJson.content[1]" },
    ] },
  } });
});
// F6.3: read back the real entry, so silently omitting slug/config forwarding cannot pass.
test("create persists caller slug, title and non-default config", async () => {
  const { deps, invoke } = harness();
  const result = await invoke("post", "", { body: { widgetType: "text", title: "Explicit title", slug: "custom-widget-url", config: { body: "Saved text" } } });
  assert.equal(result.statusCode, 201);
  const stored = await deps.entryRepo.findBySlug({ workspaceId: "ws-7", type: "widget", slug: "custom-widget-url" });
  assert.ok(stored);
  assert.equal(stored.title, "Explicit title");
  assert.deepEqual(stored.fieldsJson, { ext: { widget: { payload: '{"widgetType":"text","config":{"body":"Saved text"},"status":"active"}' } } });
  assert.equal((result.jsonBody as any).widget.id, stored.id);
  assert.equal((result.jsonBody as any).widget.slug, "custom-widget-url");
});
test("create rejects missing title or type with the validation envelope and no entries", async () => {
  const { deps, invoke } = harness();
  for (const body of [undefined, { title: "Valid" }, { widgetType: "text", title: 42 }]) {
    assert.deepEqual(await invoke("post", "", { body }), { statusCode: 400, jsonBody: {
      error: "widgetType and title are required strings", code: "VALIDATION_ERROR",
    } });
    assert.deepEqual(await deps.entryRepo.listByWorkspace({ workspaceId: "ws-7" }, { type: "widget" }), []);
    assert.deepEqual(await deps.entryRepo.listByWorkspace({ workspaceId: "ws-7" }), [], "invalid input must leave no entries of any type");
  }
});
test("list and get repository failures map to generic 500", async () => {
  const fail = async () => { throw new Error("private db detail"); };
  const { invoke } = harness({ entryRepo: { listByWorkspace: fail, findBySlug: fail } });
  assert.deepEqual(await invoke("get"), { statusCode: 500, jsonBody: { error: "internal error" } });
  assert.deepEqual(await invoke("get", "/:id"), { statusCode: 500, jsonBody: { error: "internal error" } });
});

// F1.2/F4.1: a count-only diagnostic can hide dropped or misidentified source locations.
test("diagnose returns exact reference locations with the requested instance's status", async () => {
  const { deps, invoke } = harness();
  await deps.entryRepo.save(row("diagnosed") as any);
  await deps.entryRefsRepo.rebuildForWorkspace({ workspaceId: "ws-7", refs: [
    { workspaceId: "ws-7", sourceEntryId: "area-9", sourceKind: "widget-area-placement", fieldPath: "doc.placements[4]", targetKind: "entry", targetId: "diagnosed" },
    { workspaceId: "ws-7", sourceEntryId: "host-3", sourceKind: "widget-embed", fieldPath: "bodyJson.content[2]", targetKind: "entry", targetId: "diagnosed" },
    { workspaceId: "ws-7", sourceEntryId: "irrelevant", sourceKind: "widget-embed", fieldPath: "bodyJson.content[0]", targetKind: "entry", targetId: "other-widget" },
  ] });
  assert.deepEqual(await invoke("get", "/tools/diagnose/:widgetInstanceId", { params: { workspaceId: "ws-7", widgetInstanceId: "diagnosed" } }), {
    statusCode: 200, jsonBody: { tool: "widgets.diagnose", exists: true, status: "active", whereUsed: { count: 2, references: [
      { kind: "region", sourceEntryId: "area-9", fieldPath: "doc.placements[4]" },
      { kind: "embed", sourceEntryId: "host-3", fieldPath: "bodyJson.content[2]" },
    ] } },
  });
});
test("region resolves active widget type and marks wrong-type and missing targets broken by placement id", async () => {
  const { deps, invoke } = harness({ widgetBindingRepo: { findByRegion: async (input: unknown) => {
    assert.deepEqual(input, { workspaceId: "ws-7", regionKey: "footer" }); return { areaEntryId: "area-7" };
  } } });
  await deps.entryRepo.save(row("active-text") as any);
  await deps.entryRepo.save({ ...row("article"), type: "article" } as any);
  await deps.entryRepo.save({ ...row("area-7"), type: "widget_area", fieldsJson: { ext: { widgets: { payload: JSON.stringify({ regionKey: "footer", doc: { schemaVersion: 1, placements: [
    { placementId: "p-active", widgetEntryId: "active-text", enabled: false },
    { placementId: "p-wrong-type", widgetEntryId: "article", enabled: true },
    { placementId: "p-missing", widgetEntryId: "missing", enabled: true },
  ] } }) } } } } as any);
  const result = await invoke("get", "/regions/:regionKey", { params: { workspaceId: "ws-7", regionKey: "footer" } });
  assert.equal(result.statusCode, 200);
  assert.deepEqual((result.jsonBody as any).placements, [
    { placementId: "p-active", widgetEntryId: "active-text", enabled: false, widgetTitle: "Title active-text", widgetType: "text", broken: false },
    { placementId: "p-wrong-type", widgetEntryId: "article", enabled: true, widgetTitle: "Title article", widgetType: null, broken: true },
    { placementId: "p-missing", widgetEntryId: "missing", enabled: true, widgetTitle: null, widgetType: null, broken: true },
  ]);
});

// F4.3/F6.3: forcing enabled=true, reversing order, or spreading injected properties must fail read-back.
test("region placement write preserves disabled state and order, strips extra properties, and rejects a stale version", async () => {
  const { deps, invoke } = harness();
  await deps.entryRepo.save(row("active-text") as any);
  const { areaEntry } = await bindWidgetArea({ deps: buildWidgetsRegionDeps(deps as any), input: { workspaceId: "ws-7", regionKey: "footer" } });
  const request = { params: { workspaceId: "ws-7", regionKey: "footer" }, body: { baseVersion: areaEntry.version, placements: [
    { placementId: "p-disabled", widgetEntryId: "active-text", enabled: false, injected: "must be stripped" },
    { placementId: "p-enabled", widgetEntryId: "active-text", enabled: true },
  ] } };
  const result = await invoke("put", "/regions/:regionKey", request);
  assert.equal(result.statusCode, 200);
  const stored = await deps.entryRepo.findById({ workspaceId: "ws-7", id: areaEntry.id });
  assert.ok(stored);
  assert.deepEqual(JSON.parse((stored.fieldsJson as any).ext.widgets.payload), { regionKey: "footer", doc: { schemaVersion: 1, placements: [
    { placementId: "p-disabled", widgetEntryId: "active-text", enabled: false },
    { placementId: "p-enabled", widgetEntryId: "active-text", enabled: true },
  ] } });
  assert.equal(stored.version, areaEntry.version + 1);
  const subsequent = await invoke("get", "/regions/:regionKey", { params: { workspaceId: "ws-7", regionKey: "footer" } });
  assert.equal(subsequent.statusCode, 200);
  assert.deepEqual((subsequent.jsonBody as any).placements.map(({ placementId, enabled }: any) => ({ placementId, enabled })), [
    { placementId: "p-disabled", enabled: false }, { placementId: "p-enabled", enabled: true },
  ]);
  const beforeStaleWrite = structuredClone(stored);
  const stale = await invoke("put", "/regions/:regionKey", { ...request, body: { baseVersion: areaEntry.version, placements: [] } });
  assert.equal(stale.statusCode, 409);
  assert.equal((stale.jsonBody as any).code, "WIDGETS_AREA_CONFLICT");
  assert.deepEqual((stale.jsonBody as any).details, { currentVersion: areaEntry.version + 1 });
  assert.deepEqual(await deps.entryRepo.findById({ workspaceId: "ws-7", id: areaEntry.id }), beforeStaleWrite);
});

// F1.2/F2.5: echoing the pre-trash version (3) instead of the port's version must fail.
// Existing admin-widgets-routes.test.ts:71 verifies the real Trash hides the row.
test("trash response preserves the marker port's exact version, including null", async () => {
  for (const version of [12, null]) {
    let writes = 0;
    const { deps, invoke } = harness({ removeWidget: async (input: unknown) => {
      writes++;
      assert.deepEqual(input, {
        workspaceId: "ws-7", id: "active-text", expectedVersion: 3,
        display: { title: "Title active-text", subtitle: "slug-active-text" },
        at: "2026-10-01T12:00:00.000Z", actor: { principalId: "principal-7", pluginId: null },
      });
      return { ok: true, version };
    } });
    await deps.entryRepo.save(row("active-text") as any);
    assert.deepEqual(await invoke("post", "/:id/trash", { params: { workspaceId: "ws-7", id: "active-text" } }), {
      statusCode: 200, jsonBody: { trashed: true, id: "active-text", version },
    });
    assert.equal(writes, 1);
  }
});

// F1.2/F4.3: dropping binding metadata, counting enabled rows only, or omitting orphan bindings must fail.
test("regions list retains binding metadata and counts disabled placements while retaining orphan bindings", async () => {
  const { deps, invoke } = harness();
  await deps.widgetBindingRepo.upsert({ workspaceId: "ws-7", regionKey: "footer", areaEntryId: "area-7", updatedAt: "2026-09-29T14:00:00Z" });
  await deps.widgetBindingRepo.upsert({ workspaceId: "ws-7", regionKey: "sidebar", areaEntryId: "missing-area", updatedAt: "2026-09-30T15:00:00Z" });
  await deps.entryRepo.save({ ...row("area-7"), type: "widget_area", fieldsJson: { ext: { widgets: { payload: JSON.stringify({ regionKey: "footer", doc: { schemaVersion: 1, placements: [
    { placementId: "p-disabled", widgetEntryId: "one", enabled: false },
    { placementId: "p-enabled", widgetEntryId: "two", enabled: true },
  ] } }) } } } } as any);
  const result = await invoke("get", "/regions");
  assert.equal(result.statusCode, 200);
  assert.deepEqual((result.jsonBody as any).regions.sort((a: any, b: any) => a.regionKey.localeCompare(b.regionKey)), [
    { workspaceId: "ws-7", regionKey: "footer", areaEntryId: "area-7", updatedAt: "2026-09-29T14:00:00Z", placementCount: 2 },
    { workspaceId: "ws-7", regionKey: "sidebar", areaEntryId: "missing-area", updatedAt: "2026-09-30T15:00:00Z", placementCount: 0 },
  ]);
});

// F6.2: returning 200 with a partial list after an area read fails must be rejected.
test("regions list returns a generic 500 if an area repository read fails", async () => {
  const { deps, invoke } = harness({ entryRepo: { findById: async () => { throw new Error("private area database detail"); } } });
  await deps.widgetBindingRepo.upsert({ workspaceId: "ws-7", regionKey: "footer", areaEntryId: "area-7", updatedAt: "2026-09-29T14:00:00Z" });
  assert.deepEqual(await invoke("get", "/regions"), { statusCode: 500, jsonBody: { error: "internal error" } });
});

// F4.4/F6.2: a real binding isolates the missing-area guard from the unbound-region guard.
test("remove tool returns WIDGETS_AREA_NOT_FOUND for a binding whose area no longer exists", async () => {
  const { deps, invoke } = harness();
  const binding = { workspaceId: "ws-7", regionKey: "footer", areaEntryId: "missing-area", updatedAt: "2026-09-29T14:00:00Z" };
  await deps.widgetBindingRepo.upsert(binding);
  assert.deepEqual(await invoke("post", "/tools/remove", { body: {
    placementId: "p-7", target: { kind: "region", regionKey: "footer", baseVersion: 4 },
  } }), { statusCode: 404, jsonBody: {
    error: "region area entry for 'footer' was not found", code: "WIDGETS_AREA_NOT_FOUND",
  } });
  assert.deepEqual(await deps.widgetBindingRepo.findByRegion({ workspaceId: "ws-7", regionKey: "footer" }), binding);
  assert.deepEqual(await deps.entryRepo.listByWorkspace({ workspaceId: "ws-7" }, { type: "widget_area" }), []);
  assert.deepEqual(await deps.entryRepo.listByWorkspace({ workspaceId: "ws-7" }), [], "a missing area must leave no entries of any type");
});
