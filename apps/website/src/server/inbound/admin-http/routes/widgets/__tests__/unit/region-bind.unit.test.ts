import test from "node:test";
import assert from "node:assert/strict";
import type { RouteDeps } from "../../../../../routes/types.js";

test("registerAdminWidgetRegionBindRoute: full unit coverage", async (t) => {
  let bindResult: any = null;
  let bindError: Error | null = null;
  let mockPrincipal: any = { id: "p1" };
  let errorMapped: any = null;

  const realHttpWidgets = await import("#src/server/inbound/admin-http/http/widgets");
  t.mock.module("#src/server/inbound/admin-http/http/widgets", {
    namedExports: {
      ...realHttpWidgets,
      requireWidgetsPermissionOrRespond: async () => mockPrincipal,
      mapWidgetErrorToResponse: (err: any, res: any) => {
        errorMapped = err;
        res.status(500).json({ error: "mapped" });
      },
      toAdminWidgetAreaResponse: (entry: any) => ({ transformed: true, entry }),
    },
  });

  const realRegionArea = await import("#src/features/widgets/region-area-service");
  t.mock.module("#src/features/widgets/region-area-service", {
    namedExports: {
      ...realRegionArea,
      bindWidgetArea: async () => {
        if (bindError) throw bindError;
        return bindResult;
      },
    },
  });

  const { registerAdminWidgetRegionBindRoute } = await import("../../region-bind.js");

  let routeHandler: any;
  const mockApp = {
    post: (path: string, handler: any) => {
      routeHandler = handler;
    },
  };

  const deps = {
    workspaceId: "ws-1",
    authorize: () => Promise.resolve(true),
  } as unknown as RouteDeps;

  registerAdminWidgetRegionBindRoute(mockApp as any, deps);
  assert.ok(routeHandler, "route handler was registered");

  function createMockRes() {
    return {
      statusCode: 200,
      body: null as any,
      status(code: number) {
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
    mockPrincipal = null;
    const res = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1" }, body: { regionKey: "header" } }, res);
    assert.equal(res.statusCode, 200); // not modified by handler itself
  }

  // 4. Success path
  {
    mockPrincipal = { id: "principal-1" };
    bindResult = { areaEntry: { id: "area-1" } };
    bindError = null;
    const res = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1" }, body: { regionKey: "header" } }, res);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { transformed: true, entry: { id: "area-1" } });
  }

  // 5. Error handling path
  {
    mockPrincipal = { id: "principal-1" };
    bindError = new Error("Failed to bind area");
    errorMapped = null;
    const res = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1" }, body: { regionKey: "header" } }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(errorMapped?.message, "Failed to bind area");
  }
});
