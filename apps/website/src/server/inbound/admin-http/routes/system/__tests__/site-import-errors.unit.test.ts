import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import type { RouteDeps } from "#src/server/routes/types";
import { registerAdminSiteImportRoutes } from "../site-imports.js";

test("non-ZIP import failures name the parser's actual limit and cause", async () => {
  let failure: unknown;
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminSiteImportRoutes({ app, deps: portFake<RouteDeps>({
    workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "fixture" }),
    siteImportBackend: { list: async () => { throw failure; } },
  }) });
  // Inject parser-shaped faults through the backend to exercise the registered failure boundary.
  const cases = [
    { type: "entity.too.large", limit: 8192, status: 413, message: "the request is over the 8 KiB limit for this step." },
    { type: "entity.too.large", limit: 512, status: 413, message: "the request is over the 512 B limit for this step." },
    { type: "encoding.unsupported", status: 400, message: "send an uncompressed request body." },
    { type: "entity.parse.failed", status: 400, message: "the request body could not be parsed." },
    { type: "request.aborted", status: 400, message: "the request ended before the complete body arrived." },
    { type: "request.size.invalid", status: 400, message: "the body size does not match the Content-Length header." },
  ];
  for (const fault of cases) {
    failure = Object.assign(new Error("private parser diagnostic"), { type: fault.type, limit: fault.limit });
    const response = await dispatchJsonRequest(app, "GET", "/api/admin/v1/workspaces/ws/site-imports");
    assert.equal(response.status, fault.status);
    assert.deepEqual(response.body, {
      code: fault.status === 413 ? "LIMIT_EXCEEDED" : "IMPORT_FAILED",
      message: `Import history failed: ${fault.message}`,
    });
  }
});
