import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { asyncRoute } from "../../express/async-route.js";
import { captureRouteError } from "../../../server/inbound/shared/observability-middleware.js";
import { extractRouteHandler, startTestServer } from "../../../server/__tests__/helpers/http-test-server.js";
import { lastRouteHandler } from "../../../server/__tests__/helpers/last-route-handler.js";

/** @file `asyncRoute`: a rejected async handler ends in the app's error path instead of hanging. */

async function boot(t: test.TestContext, register: (app: express.Express) => void): Promise<string> {
  const app = express();
  register(app);
  app.use(captureRouteError);
  return startTestServer(app, t);
}

// A hung request is the bug; a short client timeout turns it into a failed assertion, not a stuck test.
// A fresh signal per request: one shared signal would start its clock when the file loads.
const within = (): RequestInit => ({ signal: AbortSignal.timeout(2_000) });

test("a rejection before the handler's own try reaches the admin error response", async (t) => {
  const baseUrl = await boot(t, (app) => {
    app.get("/api/admin/v1/things", asyncRoute({ handler: async (_req, res) => {
      await Promise.reject(new Error("session store unreachable"));
      res.json({ ok: true });
    } }));
  });
  const response = await fetch(`${baseUrl}/api/admin/v1/things`, within());
  assert.equal(response.status, 500);
  const body = await response.json() as { error?: unknown };
  assert.equal(typeof body.error, "string");
  assert.doesNotMatch(String(body.error), /session store unreachable/, "the raw cause stays in the logs, not the response");
});

test("a public route rejection ends in a 500 instead of an open request", async (t) => {
  const baseUrl = await boot(t, (app) => {
    app.get("/newsletter/confirm", asyncRoute({ handler: async () => { throw new Error("newsletter module failed to start"); } }));
  });
  const response = await fetch(`${baseUrl}/newsletter/confirm`, within());
  assert.equal(response.status, 500);
});

test("a rejection without a value is still a failure, not a fall-through to the next route", async (t) => {
  const baseUrl = await boot(t, (app) => {
    const emptyReason: unknown = undefined;
    app.get("/api/admin/v1/empty", asyncRoute({ handler: () => Promise.reject(emptyReason) }));
    app.get("/api/admin/v1/empty", (_req, res) => { res.json({ reached: "next route" }); });
  });
  const response = await fetch(`${baseUrl}/api/admin/v1/empty`, within());
  assert.equal(response.status, 500);
});

test("a middleware that resolves and calls next() continues the chain unchanged", async (t) => {
  const baseUrl = await boot(t, (app) => {
    app.use(asyncRoute({ handler: async (_req, res, next) => { res.locals.seen = await Promise.resolve("yes"); next(); } }));
    app.get("/page", (_req, res) => { res.json({ seen: res.locals.seen }); });
  });
  const response = await fetch(`${baseUrl}/page`, within());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { seen: "yes" });
});

test("a stream that already sent its headers is closed when a later await fails", async (t) => {
  const baseUrl = await boot(t, (app) => {
    app.get("/api/admin/v1/events", asyncRoute({ handler: async (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(": connected\n\n");
      await Promise.reject(new Error("revision head read failed"));
    } }));
  });
  const response = await fetch(`${baseUrl}/api/admin/v1/events`, within());
  assert.equal(response.status, 200);
  // Reading to the end only finishes because the server closed the stream; a hang would hit `within`.
  const text = await response.text().catch((error: unknown) => (error instanceof Error && error.name === "TimeoutError" ? "HUNG" : ": closed"));
  assert.notEqual(text, "HUNG");
});

test("the original handler stays reachable so direct-call test helpers can await the real work", async () => {
  let finished = false;
  const handler = async (): Promise<void> => {
    await new Promise((resolve) => setImmediate(resolve));
    finished = true;
  };
  const wrapped = asyncRoute({ handler });
  assert.equal(wrapped.handler, handler);

  const app = express();
  app.get("/first", wrapped);
  app.put("/last", (_req, _res, next) => { next(); }, wrapped);
  assert.equal(extractRouteHandler(app, "get", "/first"), handler);
  assert.equal(lastRouteHandler(app, "put", "/last"), handler);

  await extractRouteHandler(app, "get", "/first")({}, {});
  assert.equal(finished, true, "awaiting the helper's result waits for the handler, not just the wrapper");
});
