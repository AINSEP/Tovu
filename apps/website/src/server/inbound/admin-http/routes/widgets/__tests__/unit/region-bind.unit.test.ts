import test from "node:test";
import assert from "node:assert/strict";
import type { RouteDeps } from "#src/server/routes/types";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryWidgetRegionBindingRepo } from "@jini-ai/cms/widgets";

test("registerAdminWidgetRegionBindRoute: validation, authorization, binding and failure responses", async () => {
  let bindCalls = 0;
  let capturedInput: any = null;
  let permissionArgs: unknown;
  let bindError: Error | null = null;
  let allowed = true;
  // Fault only the binding repository; permission checks, writes and DTO mapping stay real.
  class BindingRepo extends InMemoryWidgetRegionBindingRepo {
    /** Records normalized lookup input and injects a repository failure before any binding write. */
    override async findByRegion(input: Parameters<InMemoryWidgetRegionBindingRepo["findByRegion"]>[0]) {
      bindCalls++;
      capturedInput = input;
      if (bindError) throw bindError;
      return super.findByRegion(input);
    }
  }
  const widgetBindingRepo = new BindingRepo();
  let counter = 0;
  const now = "2026-10-01T12:00:00.000Z";

  const { registerAdminWidgetRegionBindRoute } = await import("../../region-bind.js");

  let routeHandler: any;
  const mockApp = {
    post: (path: string, handler: any) => {
      routeHandler = handler;
    },
  };

  const deps = {
    workspaceId: "ws-1",
    authorize: async (input: unknown) => {
      permissionArgs = input;
      return { allowed, reason: allowed ? "matched" : "denied" };
    },
    entryRepo: new InMemoryEntryRepo(),
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    outbox: new InMemoryOutbox(),
    widgetBindingRepo,
    clock: { nowMs: () => Date.parse(now) },
    idGen: { newId: () => `region-bind-${++counter}` },
  } as unknown as RouteDeps;

  registerAdminWidgetRegionBindRoute(mockApp as any, deps);
  assert.ok(routeHandler, "route handler was registered");

  function createMockRes() {
    return {
      locals: { principal: { id: "principal-1" } },
      statusCode: 200,
      statusCalls: 0,
      body: null as any,
      status(code: number) {
        this.statusCalls++;
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.body = data;
        return this;
      },
    };
  }

  // 1. Workspace mismatch returns 404
  {
    const res = createMockRes();
    await routeHandler({ params: { workspaceId: "other-ws" }, body: {} }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: "workspace was not found" });

    const resMissing = createMockRes();
    await routeHandler({ params: {}, body: {} }, resMissing);
    assert.equal(resMissing.statusCode, 404);
  }

  // 2. Missing or empty regionKey returns 400
  {
    const resNullBody = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1" } }, resNullBody);
    assert.equal(resNullBody.statusCode, 400);
    assert.equal(resNullBody.body.code, "VALIDATION_ERROR");

    const res1 = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1" }, body: {} }, res1);
    assert.equal(res1.statusCode, 400);
    assert.equal(res1.body.code, "VALIDATION_ERROR");

    const res2 = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1" }, body: { regionKey: "   " } }, res2);
    assert.equal(res2.statusCode, 400);
    assert.equal(res2.body.code, "VALIDATION_ERROR");

    const res3 = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1" }, body: { regionKey: 123 } }, res3);
    assert.equal(res3.statusCode, 400);
  }

  // 3. Permission denied (requireWidgetsPermissionOrRespond returns null)
  {
    allowed = false;
    const callsBefore = bindCalls;
    const res = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1" }, body: { regionKey: "header" } }, res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, {
      error: "principal 'principal-1' is not authorized for 'widgets.place' (denied)",
      code: "FORBIDDEN", details: { permission: "widgets.place", reason: "denied" },
    });
    assert.equal(bindCalls, callsBefore, "denied requests must not call the write service");
  }

  // 4. Success path
  {
    allowed = true;
    bindError = null;
    const res = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1" }, body: { regionKey: "  header " } }, res);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(permissionArgs, { principalId: "principal-1", workspaceId: "ws-1", permission: "widgets.place", entityType: "widget" });
    assert.deepEqual(capturedInput, { workspaceId: "ws-1", regionKey: "header" });
    const binding = await widgetBindingRepo.findByRegion({ workspaceId: "ws-1", regionKey: "header" });
    assert.ok(binding);
    assert.deepEqual(res.body, { area: {
      id: binding.areaEntryId, workspaceId: "ws-1", regionKey: "header",
      doc: { schemaVersion: 1, placements: [] }, updatedAt: now, version: 1,
    } });
  }

  // 5. Error handling path
  {
    bindError = new Error("Failed to bind area");
    const res = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1" }, body: { regionKey: "header" } }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: "internal error" });
  }
});
