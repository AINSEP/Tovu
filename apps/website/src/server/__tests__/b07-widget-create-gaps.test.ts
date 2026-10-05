import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryEntryRepo } from "@jini-ai/cms/entries";
import { InMemoryContentTypeRepo } from "@jini-ai/cms/content-types";
import { InMemoryEntryRefsRepo } from "../../contracts/core/entry-refs/repo.memory.js";
import { registerAdminWidgetCreateRoute } from "../inbound/admin-http/routes/widgets/create.js";
import { registerAdminWidgetGetRoute } from "../inbound/admin-http/routes/widgets/get-by-id.js";
import type { RouteDeps } from "../routes/types.js";
import { createCapturingResponse, extractRouteHandler } from "./helpers/http-test-server.js";

// Author checklist: real route, service and repos; fixed time/ids; no subject mocks/globals;
// independent repository/GET read-back (F6.3), literal payload (F1.2), one invalid guard per case
// (F4.4). Authorization has real HTTP coverage in admin-widgets-routes.test.ts:736.
const WS = "ws-b07";
const ROOT = "/api/admin/v1/workspaces/:workspaceId/widgets";
const AT = "2026-10-04T12:00:00.000Z";

function harness() {
  let sequence = 0;
  const deps = {
    workspaceId: WS, entryRepo: new InMemoryEntryRepo(), contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(), clock: { nowMs: () => Date.parse(AT), nowIso: () => AT },
    idGen: { newId: () => `b07-${++sequence}` }, authorize: async () => ({ allowed: true, reason: "granted" }),
    outbox: { async enqueue() {} },
  };
  const app = express();
  registerAdminWidgetCreateRoute(app, deps as unknown as RouteDeps);
  registerAdminWidgetGetRoute(app, deps as unknown as RouteDeps);
  async function invoke(method: "post" | "get", body?: unknown, id?: string) {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "operator-b07" };
    await extractRouteHandler(app, method, method === "post" ? ROOT : `${ROOT}/:id`)(
      { params: { workspaceId: WS, id }, body }, res);
    return capture;
  }
  return { deps, invoke };
}

// One Question: removing parseWidgetCreateBody's slug field must make both independent reads fail.
test("widget create persists the supplied slug, title and config and is readable by that slug", async () => {
  const { deps, invoke } = harness();
  assert.equal(await deps.entryRepo.findBySlug({ workspaceId: WS, type: "widget", slug: "legal-footer" }), null);
  const created = await invoke("post", { widgetType: "text", title: "Terms notice", slug: "legal-footer", config: { body: "Copyright 2026, Acme" } });
  assert.equal(created.statusCode, 201);
  const row = await deps.entryRepo.findBySlug({ workspaceId: WS, type: "widget", slug: "legal-footer" });
  assert.ok(row, "the route must forward the caller's slug to the real stored entry");
  assert.equal(row.title, "Terms notice");
  assert.deepEqual(row.fieldsJson, { ext: { widget: { payload: '{"widgetType":"text","config":{"body":"Copyright 2026, Acme"},"status":"active"}' } } });
  const read = await invoke("get", undefined, "legal-footer");
  assert.equal(read.statusCode, 200);
  assert.deepEqual(read.jsonBody, {
    widget: { id: row.id, workspaceId: WS, slug: "legal-footer", title: "Terms notice", status: "active", widgetType: "text",
      config: { body: "Copyright 2026, Acme" }, updatedAt: AT, version: 1 },
    revisions: [], whereUsed: { count: 0, references: [] },
  });
});

test("widget create rejects a missing or non-string title/type before creating any entries", async () => {
  const { deps, invoke } = harness();
  for (const body of [undefined, null, { widgetType: "text", config: { body: "valid" } },
    { widgetType: "text", title: 7, config: { body: "valid" } }, { title: "Valid title", config: { body: "valid" } },
    { widgetType: 7, title: "Valid title", config: { body: "valid" } }]) {
    assert.deepEqual(await invoke("post", body), {
      statusCode: 400, jsonBody: { error: "widgetType and title are required strings", code: "VALIDATION_ERROR" },
    });
    assert.deepEqual(await deps.entryRepo.listByWorkspace({ workspaceId: WS }), []);
  }
});

// One Question: forwarding null/undefined/scalar config instead of normalizing it to {} changes
// the named field-level error to the object-shape error; a generic 400 would mask this (F4.4).
test("widget create normalizes absent, null and scalar config to an empty object for domain validation", async () => {
  const { deps, invoke } = harness();
  for (const config of [undefined, null, "wrong shape"]) {
    const capture = await invoke("post", { widgetType: "text", title: "Valid title", config });
    assert.deepEqual(capture, { statusCode: 400, jsonBody: {
      error: "config for widget type 'text' failed schema validation (REQ-02)", code: "WIDGETS_CONFIG_VALIDATION_ERROR",
      details: { fieldErrors: [{ field: "config.body", reason: "required field is missing" }] },
    } });
    assert.deepEqual(await deps.entryRepo.listByWorkspace({ workspaceId: WS }), []);
  }
});
