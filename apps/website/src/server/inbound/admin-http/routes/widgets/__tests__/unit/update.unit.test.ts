import test from "node:test";
import assert from "node:assert/strict";
import type { RouteDeps } from "../../../../../routes/types.js";

test("registerAdminWidgetUpdateRoute: full unit coverage", async (t) => {
  let updateResult: any = null;
  let updateError: Error | null = null;
  let capturedInput: any = null;
  let errorMapped: any = null;

  const realHttpWidgets = await import("#src/server/inbound/admin-http/http/widgets");
  t.mock.module("#src/server/inbound/admin-http/http/widgets", {
    namedExports: {
      ...realHttpWidgets,
      mapWidgetErrorToResponse: (err: any, res: any) => {
        errorMapped = err;
        res.status(500).json({ error: "mapped" });
      },
      toAdminWidgetResponse: (instance: any) => ({ transformed: true, instance }),
    },
  });

  const realDevAuth = await import("#src/server/inbound/admin-http/dev-auth");
  t.mock.module("#src/server/inbound/admin-http/dev-auth", {
    namedExports: {
      ...realDevAuth,
      getAuthedPrincipal: () => ({ id: "principal-123" }),
    },
  });

  const realWriteService = await import("#src/features/widgets/write-service");
  t.mock.module("#src/features/widgets/write-service", {
    namedExports: {
      ...realWriteService,
      updateWidgetInstance: async (args: any) => {
        capturedInput = args.input;
        if (updateError) throw updateError;
        return updateResult;
      },
    },
  });

  const { registerAdminWidgetUpdateRoute } = await import("../../update.js");

  let routeHandler: any;
  const mockApp = {
    put: (path: string, handler: any) => {
      routeHandler = handler;
    },
  };

  const deps = {
    workspaceId: "ws-1",
  } as unknown as RouteDeps;

  registerAdminWidgetUpdateRoute(mockApp as any, deps);
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

  // 1. Workspace mismatch or missing returns 404
  {
    const res = createMockRes();
    await routeHandler({ params: { workspaceId: "other-ws", id: "w-1" }, body: {} }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: "workspace was not found" });

    const resMissing = createMockRes();
    await routeHandler({ params: { id: "w-1" }, body: {} }, resMissing);
    assert.equal(resMissing.statusCode, 404);
  }

  // 2. Missing body or invalid baseVersion returns 400
  {
    const resNullBody = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1", id: "w-1" } }, resNullBody);
    assert.equal(resNullBody.statusCode, 400);
    assert.equal(resNullBody.body.code, "VALIDATION_ERROR");

    const resNoBaseVersion = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1", id: "w-1" }, body: {} }, resNoBaseVersion);
    assert.equal(resNoBaseVersion.statusCode, 400);

    const resStringBaseVersion = createMockRes();
    await routeHandler({ params: { workspaceId: "ws-1", id: "w-1" }, body: { baseVersion: "1" } }, resStringBaseVersion);
    assert.equal(resStringBaseVersion.statusCode, 400);
  }

  // 3. Success path with object config
  {
    updateResult = { instance: { id: "w-1", version: 2 } };
    updateError = null;
    const res = createMockRes();
    await routeHandler(
      {
        params: { workspaceId: "ws-1", id: "w-1" },
        body: { baseVersion: 1, config: { title: "New Widget" } },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { transformed: true, instance: { id: "w-1", version: 2 } });
    assert.deepEqual(capturedInput.config, { title: "New Widget" });
    assert.equal(capturedInput.baseVersion, 1);
    assert.equal(capturedInput.actor.principalId, "principal-123");
  }

  // 4. Success path with null/non-object config defaulting to {}
  {
    updateResult = { instance: { id: "w-1", version: 2 } };
    const res = createMockRes();
    await routeHandler(
      {
        params: { workspaceId: "ws-1", id: "w-1" },
        body: { baseVersion: 1, config: null },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.deepEqual(capturedInput.config, {});
  }

  // 5. Error handling path
  {
    updateError = new Error("Conflict or not found");
    errorMapped = null;
    const res = createMockRes();
    await routeHandler(
      {
        params: { workspaceId: "ws-1", id: "w-1" },
        body: { baseVersion: 1 },
      },
      res
    );
    assert.equal(res.statusCode, 500);
    assert.equal(errorMapped?.message, "Conflict or not found");
  }
});
