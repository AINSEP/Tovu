import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryEntryRepo } from "@jini-ai/cms/entries";
import { InMemoryEntryRefsRepo } from "../../contracts/core/entry-refs/repo.memory.js";
import { registerAdminThemesListRoute } from "../inbound/admin-http/routes/themes/list.js";
import { registerAdminWidgetListRoute } from "../inbound/admin-http/routes/widgets/list.js";
import { registerAdminWidgetGetRoute } from "../inbound/admin-http/routes/widgets/get-by-id.js";
import { registerAdminWidgetRegionGetRoute } from "../inbound/admin-http/routes/widgets/region-get.js";
import { registerAdminPolicyListRoute } from "../inbound/admin-http/routes/users/list-policies.js";
import { registerAdminRoleListRoute } from "../inbound/admin-http/routes/users/list-roles.js";
import { registerAdminPolicyPermissionListRoute } from "../inbound/admin-http/routes/users/list-policy-permissions.js";
import { createCapturingResponse, extractRouteHandler } from "./helpers/http-test-server.js";

// Handler behavior only; authentication/authorization are exercised over HTTP in sibling suites.
// Author checklist: real handlers/services, literal DTOs, distinguishing fixtures, fresh repos,
// exact port arguments (F3.6), unconditional assertions, no globals or clocks to restore.
const WS = "ws-b07";
const ROOT = "/api/admin/v1/workspaces/:workspaceId";
const allow = async () => ({ allowed: true, reason: "granted" });

async function invoke(register: (app: express.Express, deps: never) => void, deps: object, path: string,
  params: Record<string, string> = {}, query: object = {}) {
  const app = express();
  register(app, deps as never);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "reader-b07" };
  await extractRouteHandler(app, "get", path)({ params: { workspaceId: WS, ...params }, query }, res);
  return capture;
}

// F4.1/F6.2: deleting source-rank sorting, dropping invalid themes, or replacing errors with [] fails.
test("themes list orders built-ins before site themes and maps invalid diagnostics without mutating discovery order", async () => {
  const themes = [
    { manifest: { id: "a-site", name: "Site A", version: "3.2" }, source: "site", status: "invalid", errors: ["CSS import rejected", "entry template absent"] },
    { manifest: { id: "z-built", name: "Built Z", version: "2.4" }, source: "built-in", status: "valid", errors: [] },
    { manifest: { id: "a-built", name: "Built A", version: "1.7" }, source: "built-in", status: "valid", errors: [] },
  ];
  const capture = await invoke(registerAdminThemesListRoute, {
    workspaceId: WS, authorize: allow, themes,
    presentationRepo: { async findByWorkspaceId(input: unknown) {
      assert.deepEqual(input, { workspaceId: WS });
      return { activeThemeId: "a-site" };
    } },
  }, `${ROOT}/themes`);
  assert.equal(capture.statusCode, 200);
  assert.deepEqual(capture.jsonBody, { themes: [
    { id: "a-built", name: "Built A", version: "1.7", source: "built-in", status: "valid", errors: [], active: false },
    { id: "z-built", name: "Built Z", version: "2.4", source: "built-in", status: "valid", errors: [], active: false },
    { id: "a-site", name: "Site A", version: "3.2", source: "site", status: "invalid", active: true,
      errors: [{ code: null, file: null, message: "CSS import rejected" }, { code: null, file: null, message: "entry template absent" }] },
  ] });
  assert.deepEqual(themes.map((theme) => theme.manifest.id), ["a-site", "z-built", "a-built"]);
});

// F4.4: both alias candidates exist, so a direct id match cannot accidentally satisfy the contract.
test("themes list resolves retired basic to the current name and leaves all themes inactive without settings", async () => {
  const themes = [
    { manifest: { id: "basic", name: "Retired", version: "1" }, source: "site", status: "valid", errors: [] },
    { manifest: { id: "tovu-theme", name: "Current", version: "2" }, source: "site", status: "valid", errors: [] },
  ];
  for (const [settings, flags] of [[{ activeThemeId: "basic" }, [false, true]], [null, [false, false]]] as const) {
    const capture = await invoke(registerAdminThemesListRoute, {
      workspaceId: WS, authorize: allow, themes, presentationRepo: { findByWorkspaceId: async () => settings },
    }, `${ROOT}/themes`);
    assert.equal(capture.statusCode, 200);
    assert.deepEqual((capture.jsonBody as { themes: { id: string; active: boolean }[] }).themes.map(({ id, active }) => ({ id, active })),
      [{ id: "basic", active: flags[0] }, { id: "tovu-theme", active: flags[1] }]);
  }
});

test("themes list conceals a presentation repository failure", async () => {
  let read = false;
  const capture = await invoke(registerAdminThemesListRoute, {
    workspaceId: WS, authorize: allow, themes: [], presentationRepo: { async findByWorkspaceId() {
      read = true;
      throw new Error("private database path");
    } },
  }, `${ROOT}/themes`);
  assert.equal(read, true);
  assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: "internal error" } });
});

async function widgetRepo() {
  const repo = new InMemoryEntryRepo();
  for (const [id, widgetType, status] of [["text-active", "text", "active"], ["text-inactive", "text", "trash"], ["nav-active", "navigation", "active"]]) {
    await repo.save({ id, workspaceId: WS, type: "widget", slug: id, title: `Title ${id}`, status: "published",
      fieldsJson: { ext: { widget: { payload: JSON.stringify({ widgetType, status, config: { body: `Body ${id}` } }) } } },
      bodyJson: null, publishedAt: "2026-09-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z", version: 7 });
  }
  return repo;
}

// F4.3: two types and two statuses distinguish omitted, false and true query values.
test("widget list filters type and only the literal true query includes inactive payloads", async () => {
  const entryRepo = await widgetRepo();
  const cases = [
    [{}, ["nav-active", "text-active"]],
    [{ widgetType: "text" }, ["text-active"]],
    [{ widgetType: "text", includeInactive: "false" }, ["text-active"]],
    [{ widgetType: "text", includeInactive: "true" }, ["text-active", "text-inactive"]],
    [{ widgetType: ["text"], includeInactive: true }, ["nav-active", "text-active"]],
  ] as const;
  for (const [query, ids] of cases) {
    const capture = await invoke(registerAdminWidgetListRoute, { workspaceId: WS, entryRepo, authorize: allow }, `${ROOT}/widgets`, {}, query);
    assert.equal(capture.statusCode, 200);
    const body = capture.jsonBody as { widgets: { id: string; config: object }[] };
    assert.deepEqual(body.widgets.map((widget) => widget.id).sort(), ids);
    assert.deepEqual(body.widgets.find((widget) => widget.id === "text-active")?.config, { body: "Body text-active" });
    assert.deepEqual(Object.keys(body), ["widgets"]);
  }
});

// F1.2: dropping either diagnostic key is observable even though the healthy widget stays listed.
test("widget list identifies corrupt rows and removes diagnostic keys after the row is repaired", async () => {
  const entryRepo = await widgetRepo();
  const bad = { id: "corrupt", workspaceId: WS, type: "widget", slug: "corrupt", title: "Broken", status: "published" as const,
    bodyJson: null, fieldsJson: {}, publishedAt: "2026-09-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z", version: 3 };
  await entryRepo.save(bad);
  const deps = { workspaceId: WS, entryRepo, authorize: allow };
  const capture = await invoke(registerAdminWidgetListRoute, deps, `${ROOT}/widgets`);
  assert.equal(capture.statusCode, 200);
  const body = capture.jsonBody as { widgets: { id: string }[]; skippedCount: number; skippedIds: string[] };
  assert.deepEqual(body.widgets.map((widget) => widget.id).sort(), ["nav-active", "text-active"]);
  assert.equal(body.skippedCount, 1);
  assert.deepEqual(body.skippedIds, ["corrupt"]);
  await entryRepo.save({ ...bad, fieldsJson: { ext: { widget: { payload: '{"widgetType":"text","status":"active","config":{"body":"Repaired"}}' } } } });
  const repaired = await invoke(registerAdminWidgetListRoute, deps, `${ROOT}/widgets`);
  assert.equal(repaired.statusCode, 200);
  assert.deepEqual(Object.keys(repaired.jsonBody as object), ["widgets"]);
  assert.deepEqual((repaired.jsonBody as { widgets: { id: string }[] }).widgets.map((widget) => widget.id).sort(), ["corrupt", "nav-active", "text-active"]);
});

// F3.6/F4.3: slug differs from id; distractor target/workspace rows expose a wrong reference lookup.
test("widget get resolves a slug and discloses the resolved instance's region and embed references", async () => {
  const entryRepo = await widgetRepo();
  const widget = await entryRepo.findById({ workspaceId: WS, id: "text-active" });
  assert.ok(widget);
  await entryRepo.save({ ...widget, slug: "footer-note" });
  const entryRefsRepo = new InMemoryEntryRefsRepo();
  await entryRefsRepo.rebuildForWorkspace({ workspaceId: WS, refs: [
    { workspaceId: WS, sourceEntryId: "footer-area", sourceKind: "widget-area-placement", fieldPath: "bodyJson.placements[2]", targetKind: "entry", targetId: "text-active" },
    { workspaceId: WS, sourceEntryId: "about-page", sourceKind: "widget-embed", fieldPath: "bodyJson.content[3]", targetKind: "entry", targetId: "text-active" },
    { workspaceId: WS, sourceEntryId: "wrong-target", sourceKind: "widget-embed", fieldPath: "bodyJson.content[0]", targetKind: "entry", targetId: "footer-note" },
  ] });
  await entryRefsRepo.rebuildForWorkspace({ workspaceId: "foreign", refs: [
    { workspaceId: "foreign", sourceEntryId: "private-page", sourceKind: "widget-embed", fieldPath: "bodyJson.content[0]", targetKind: "entry", targetId: "text-active" },
  ] });
  const capture = await invoke(registerAdminWidgetGetRoute, { workspaceId: WS, entryRepo, entryRefsRepo, authorize: allow }, `${ROOT}/widgets/:id`, { id: "footer-note" });
  assert.equal(capture.statusCode, 200);
  assert.deepEqual(capture.jsonBody, {
    widget: { id: "text-active", workspaceId: WS, slug: "footer-note", title: "Title text-active", status: "active", widgetType: "text",
      config: { body: "Body text-active" }, updatedAt: "2026-09-02T00:00:00Z", version: 7 }, revisions: [],
    whereUsed: { count: 2, references: [
      { kind: "region", sourceEntryId: "footer-area", fieldPath: "bodyJson.placements[2]" },
      { kind: "embed", sourceEntryId: "about-page", fieldPath: "bodyJson.content[3]" },
    ] },
  });
});

// F1.2/F4.3: healthy type/config identity must be resolved, while missing and inactive targets
// remain individually diagnosable. Setting widgetType to null for every row must fail.
test("widget region get resolves healthy widget types and retains disabled, missing and inactive placements", async () => {
  const entryRepo = await widgetRepo();
  const placements = [
    { placementId: "healthy-p", widgetEntryId: "text-active", enabled: false },
    { placementId: "missing-p", widgetEntryId: "missing-target", enabled: true },
    { placementId: "inactive-p", widgetEntryId: "text-inactive", enabled: true },
  ];
  await entryRepo.save({ id: "footer-area", workspaceId: WS, type: "widget_area", slug: "widget-area-footer", title: "Footer area", status: "published",
    fieldsJson: { ext: { widgets: { payload: JSON.stringify({ regionKey: "footer", doc: { schemaVersion: 1, placements } }) } } },
    bodyJson: null, publishedAt: "2026-09-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z", version: 4 });
  const reads: unknown[] = [];
  const capture = await invoke(registerAdminWidgetRegionGetRoute, { workspaceId: WS, entryRepo, authorize: allow,
    widgetBindingRepo: { async findByRegion(input: unknown) {
      reads.push(input);
      return { areaEntryId: "footer-area" };
    } },
  }, `${ROOT}/widgets/regions/:regionKey`, { regionKey: "footer" });
  assert.deepEqual(reads, [{ workspaceId: WS, regionKey: "footer" }]);
  assert.deepEqual(capture, { statusCode: 200, jsonBody: {
    area: { id: "footer-area", workspaceId: WS, regionKey: "footer", doc: { schemaVersion: 1, placements: [
      { placementId: "healthy-p", widgetEntryId: "text-active", enabled: false },
      { placementId: "missing-p", widgetEntryId: "missing-target", enabled: true },
      { placementId: "inactive-p", widgetEntryId: "text-inactive", enabled: true },
    ] }, updatedAt: "2026-09-02T00:00:00Z", version: 4 },
    placements: [
      { placementId: "healthy-p", widgetEntryId: "text-active", enabled: false, widgetTitle: "Title text-active", widgetType: "text", broken: false },
      { placementId: "missing-p", widgetEntryId: "missing-target", enabled: true, widgetTitle: null, widgetType: null, broken: true },
      { placementId: "inactive-p", widgetEntryId: "text-inactive", enabled: true, widgetTitle: "Title text-inactive", widgetType: "text", broken: true },
    ],
  } });
});

// F1.2/F4.1: empty lists or a mapper dropping names/flags cannot pass these literal envelopes.
test("policy and role lists preserve picker metadata and scope repository reads to the bound workspace", async () => {
  const policies = [{ id: "policy-b07", workspaceId: WS, name: "Publish only", description: "Limited publication", isBuiltin: false, isFrozen: true }];
  const roles = [{ id: "role-b07", workspaceId: WS, name: "Curator", isBuiltin: true }];
  for (const [register, suffix, repoName, rows, expected] of [
    [registerAdminPolicyListRoute, "policies", "policyRepo", policies, { policies }],
    [registerAdminRoleListRoute, "roles", "roleRepo", roles, { roles }],
  ] as const) {
    const reads: unknown[] = [];
    const capture = await invoke(register, { workspaceId: WS, authorize: allow, [repoName]: { async list(input: unknown) {
      reads.push(input);
      return rows.map((row) => ({ ...row, privateStorageField: "hidden" }));
    } } }, `${ROOT}/${suffix}`);
    assert.deepEqual(reads, [{ workspaceId: WS }]);
    assert.deepEqual(capture, { statusCode: 200, jsonBody: expected });
  }
});

// F4.4: a missing policy must 404 even when the permission repository could return an empty list.
test("policy permission listing refuses an absent parent and conceals repository failures", async () => {
  let permissionReads = 0;
  const reads: unknown[] = [];
  const deps = { workspaceId: WS, authorize: allow,
    policyRepo: { async findById(input: unknown) { reads.push(input); return null; } },
    policyPermissionRepo: { async listByPolicyId() { permissionReads++; return []; } },
  };
  const missing = await invoke(registerAdminPolicyPermissionListRoute, deps, `${ROOT}/policies/:policyId/permissions`, { policyId: "absent-b07" });
  assert.deepEqual(reads, [{ workspaceId: WS, id: "absent-b07" }]);
  assert.equal(permissionReads, 0);
  assert.deepEqual(missing, { statusCode: 404, jsonBody: { error: "policy 'absent-b07' was not found", code: "RESOURCE_NOT_FOUND" } });
  const failed = await invoke(registerAdminPolicyPermissionListRoute, { ...deps, policyRepo: { async findById() {
    throw new Error("private connection string");
  } } }, `${ROOT}/policies/:policyId/permissions`, { policyId: "absent-b07" });
  assert.deepEqual(failed, { statusCode: 500, jsonBody: { error: "internal error" } });
});
