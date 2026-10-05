import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminWidgetEmbedInsertRoute } from "../../embed-insert.js";

const path = "/api/admin/v1/workspaces/:workspaceId/entries/:hostEntryId/widget-embeds";
const host = {
  id: "host-7", workspaceId: "ws-7", type: "article", slug: "host-seven", title: "Host Seven",
  status: "draft" as const, version: 4, fieldsJson: {}, publishedAt: null,
  bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep this content" }] }] },
  createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z",
};

async function harness() {
  const app = express();
  const entryRepo = new InMemoryEntryRepo();
  await entryRepo.save(structuredClone(host));
  let authorizations = 0;
  registerAdminWidgetEmbedInsertRoute(app, {
    workspaceId: "ws-7", entryRepo,
    authorize: async () => { authorizations++; return { allowed: true, reason: "matched" }; },
  } as any);
  return {
    entryRepo,
    authorizations: () => authorizations,
    invoke: async (body: unknown, workspaceId = "ws-7") => {
      const { res, capture } = createCapturingResponse();
      res.locals.principal = { id: "principal-7" };
      await extractRouteHandler(app, "post", path)({ params: { workspaceId, hostEntryId: "host-7" }, body }, res);
      return capture;
    },
  };
}

// F4.4/F6.3: deleting either type guard must fail; each fixture violates only that field.
test("embed insert rejects a missing or mistyped version or widget id before touching the host", async () => {
  const h = await harness();
  for (const body of [
    { widgetEntryId: "widget-9" },
    { baseVersion: "4", widgetEntryId: "widget-9" },
    { baseVersion: 4 },
    { baseVersion: 4, widgetEntryId: 9 },
    undefined, null,
  ]) {
    assert.deepEqual(await h.invoke(body), { statusCode: 400, jsonBody: {
      error: "baseVersion and widgetEntryId are required", code: "VALIDATION_ERROR",
    } });
    assert.deepEqual(await h.entryRepo.findById({ workspaceId: "ws-7", id: "host-7" }), host);
  }
  assert.equal(h.authorizations(), 0);
});

// F4.4: valid body ensures only the workspace guard can reject the request as 404.
test("embed insert rejects a foreign workspace before authorization or mutation", async () => {
  const h = await harness();
  assert.deepEqual(await h.invoke({ baseVersion: 4, widgetEntryId: "widget-9" }, "foreign-workspace"), {
    statusCode: 404, jsonBody: { error: "workspace was not found" },
  });
  assert.equal(h.authorizations(), 0);
  assert.deepEqual(await h.entryRepo.findById({ workspaceId: "ws-7", id: "host-7" }), host);
});
