import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryEntryRepo } from "@jini-ai/cms/entries";
import { InMemoryContentTypeRepo } from "@jini-ai/cms/content-types";
import { InMemoryEntryRefsRepo } from "@jini-ai/cms/widgets";
import { InMemoryOutbox } from "@jini-ai/infra/events/memory-bus";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { registerAdminWidgetListRoute, registerAdminWidgetGetRoute, registerAdminWidgetCreateRoute, registerAdminWidgetRegionGetRoute, registerAdminWidgetRegionMutatePlacementsRoute, registerAdminWidgetRegionsListRoute, registerAdminWidgetTrashRoute, registerAdminWidgetAgentToolsRoutes } from "#src/server/runtime/composition/modules/widgets";
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
function harness(overrides: Record<string, unknown> = {}, incidents?: ReturnType<typeof createRouteIncidentReporter>) {
  let counter = 0;
  const deps = { workspaceId: "ws-7", entryRepo: new InMemoryEntryRepo(), entryRefsRepo: new InMemoryEntryRefsRepo(),
    contentTypeRepo: new InMemoryContentTypeRepo(), outbox: new InMemoryOutbox(), widgetBindingRepo: new InMemoryWidgetRegionBindingRepo(),
    clock: { nowIso: () => "2026-10-01T12:00:00.000Z", nowMs: () => Date.parse("2026-10-01T12:00:00.000Z") }, idGen: { newId: () => `b07-id-${++counter}` },
    authorize: async () => ({ allowed: true, reason: "matched" }), ...overrides,
  };
  const app = express();
  registerAdminWidgetListRoute({ app, deps: deps as any, errors: createRouteIncidentReporter().errors });
  registerAdminWidgetGetRoute({ app, deps: deps as any, errors: createRouteIncidentReporter().errors });
  registerAdminWidgetCreateRoute({ app, deps: deps as any, errors: createRouteIncidentReporter().errors });
  registerAdminWidgetAgentToolsRoutes({ app, deps: deps as any, errors: incidents?.errors ?? createRouteIncidentReporter().errors });
  registerAdminWidgetRegionGetRoute({ app, deps: deps as any, errors: createRouteIncidentReporter().errors });
  registerAdminWidgetRegionsListRoute({ app, deps: deps as any, errors: createRouteIncidentReporter().errors });
  registerAdminWidgetRegionMutatePlacementsRoute({ app, deps: deps as any, errors: createRouteIncidentReporter().errors });
  registerAdminWidgetTrashRoute({ app, deps: deps as any, errors: createRouteIncidentReporter().errors });
  return { deps, invoke: async (method: "get" | "post" | "put", suffix = "", request: Record<string, unknown> = {}) => {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "principal-7" };
    if (incidents) res.locals.failureReporter = incidents.reporter;
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
    assertAdminResponse({ actual: body.widgets.map((w: any) => w.id), expected: ids });
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
  assertAdminResponse({ actual: await invoke("get"), expected: { statusCode: 500, jsonBody: { error: "internal error" } } }, { failure: {"message":"The widget operation could not be completed.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"widget operation"} });
  assertAdminResponse({ actual: await invoke("get", "/:id"), expected: { statusCode: 500, jsonBody: { error: "internal error" } } }, { failure: {"message":"The widget operation could not be completed.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"widget operation"} });
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
  assertAdminResponse({ actual: await deps.entryRepo.findById({ workspaceId: "ws-7", id: areaEntry.id }), expected: beforeStaleWrite });
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
  assertAdminResponse({ actual: await invoke("get", "/regions"), expected: { statusCode: 500, jsonBody: { error: "internal error" } } }, { failure: {"message":"The widget operation could not be completed.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"widget operation"} });
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
  assertAdminResponse({ actual: await deps.widgetBindingRepo.findByRegion({ workspaceId: "ws-7", regionKey: "footer" }), expected: binding });
  assert.deepEqual(await deps.entryRepo.listByWorkspace({ workspaceId: "ws-7" }, { type: "widget_area" }), []);
  assert.deepEqual(await deps.entryRepo.listByWorkspace({ workspaceId: "ws-7" }), [], "a missing area must leave no entries of any type");
});

test("widgets list: mounted in reporter mode, a failed answer write is one site incident whose ID the 500 carries", async () => {
  const incidents = createRouteIncidentReporter();
  const app = express();
  // The route's own answer is the first `res.json`; refusing it is a write the transport could not take.
  app.use((_req, res, next) => {
    res.locals.principal = { id: "principal-1" };
    const json = res.json.bind(res);
    let refused = false;
    res.json = (body: unknown) => { if (!refused) { refused = true; throw new Error("socket refused the body"); } return json(body); };
    next();
  });
  let authorizations = 0;
  const authorize = async () => { authorizations++; return { allowed: true, reason: "matched" }; };
  registerAdminWidgetListRoute({ app, deps: { workspaceId: "ws-1", entryRepo: new InMemoryEntryRepo(), authorize } as any, errors: incidents.errors });
  const result = await dispatchJsonRequest(app, "GET", "/api/admin/v1/workspaces/ws-1/widgets");
  const { error } = result.body as { error: { code: string; requestId: string } };
  assert.deepEqual({ status: result.status, code: error.code }, { status: 500, code: "INTERNAL_ERROR" });
  assert.equal(incidents.entries.length, 1, "exactly one record: the failed write, never a second route operation");
  assert.match(error.requestId, /^ERR-7E57-/);
  assert.ok(JSON.stringify(incidents.entries[0]).includes(error.requestId), "the reply names the recorded incident");
  assert.equal(authorizations, 1, "the route ran once; a failed write never runs the handler again");
});

test("a failed create-tool placement returns the saved widget ID and one private failure", async (t) => {
  const incidents = createRouteIncidentReporter();
  const bindingRepo = new InMemoryWidgetRegionBindingRepo();
  const { deps, invoke } = harness({ widgetBindingRepo: bindingRepo }, incidents);
  const lookups: unknown[] = [];
  t.mock.method(bindingRepo, "findByRegion", async (scope: Parameters<typeof bindingRepo.findByRegion>[0]) => {
    lookups.push(scope);
    throw new Error("private placement database detail");
  });
  const response = await invoke("post", "/tools/create", { body: {
    widgetType: "text", title: "Footer card", config: { body: "Saved in the library" },
    target: { kind: "region", regionKey: "footer", baseVersion: 3 },
  } });
  assert.equal(response.statusCode, 500);
  const body = response.jsonBody as {
    tool: string; placementFailed: boolean; widget: { id: string; title: string; config: unknown }; code: string; errorId: string;
  };
  assert.deepEqual([body.tool, body.placementFailed, body.code, body.errorId], [
    "widgets.create", true, "INTERNAL_ERROR", "ERR-7E57-0000-0000-0000",
  ]);
  assert.deepEqual(lookups, [{ workspaceId: "ws-7", regionKey: "footer" }]);
  const saved = await deps.entryRepo.listByWorkspace({ workspaceId: "ws-7" }, { type: "widget" });
  assert.deepEqual(saved.map(({ id, title }) => ({ id, title })), [{ id: body.widget.id, title: "Footer card" }]);
  assert.deepEqual([body.widget.title, body.widget.config], ["Footer card", { body: "Saved in the library" }]);
  assert.deepEqual(await deps.entryRepo.listByWorkspace({ workspaceId: "ws-7" }, { type: "widget_area" }), []);
  assert.doesNotMatch(JSON.stringify(body), /private placement database detail/);
  assert.equal(incidents.entries.length, 1);
  assert.match(JSON.stringify(incidents.entries), /private placement database detail/);
});
