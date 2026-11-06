import assert from "node:assert/strict";
import test from "node:test";
import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { PassThrough } from "node:stream";
import express from "express";
import { createTracker } from "@jini-ai/diagnostics/observability/node";

import { registerAdminAnalyticsRecentHitsRoute, type AdminAnalyticsRecentHitsDeps } from "../../inbound/admin-http/routes/analytics/recent-hits.js";
import { applyRequestTracking } from "../../inbound/shared/observability-middleware.js";
import { assertAnalyticsFailure } from "../helpers/assert-analytics-failure.js";

/** Exercise the real HTTP/Express stack without opening a sandbox-forbidden listener. */
async function request(app: express.Express, requestId: string | undefined) {
  const socket = new PassThrough();
  const req = new IncomingMessage(socket as unknown as Socket);
  req.method = "GET";
  req.url = "/api/admin/v1/workspaces/ws/analytics/recent-hits";
  req.headers = requestId ? { "x-request-id": requestId } : {};
  req.push(null);
  const res = new ServerResponse(req);
  res.assignSocket(socket as unknown as Socket);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<{ status: number; requestId: unknown; body: unknown }>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("analytics response timed out")), 3000);
      const chunks: Buffer[] = [];
      socket.on("data", chunk => chunks.push(Buffer.from(chunk)));
      res.on("finish", () => {
        const wire = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, requestId: res.getHeader("x-request-id"), body: JSON.parse(wire.slice(wire.indexOf("\r\n\r\n") + 4)) });
      });
      app(req, res);
    });
  } finally {
    clearTimeout(timer);
    socket.destroy();
  }
}

// Guard the wire-contract regression at every failing port of the analytics route family.
// Keep the real routing and request tracking; only authentication and failing ports are fixtures.
for (const failure of ["authorize", "sink"] as const) {
  for (const requestId of [undefined, "analytics-existing-request"] as const) {
    test(`analytics/recent-hits: ${failure} failure preserves the canonical 500 with ${requestId ? "existing" : "generated"} requestId`, async t => {
      const secret = "ghp_" + "x".repeat(36);
      const fail = async () => { throw new Error(`private ${failure} failure ${secret}`); };
      const logs: unknown[][] = [];
      const reports: Array<{ error: Error; options: unknown }> = [];
      t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });

      const app = express();
      applyRequestTracking(app, { tracker: createTracker({}), env: { TOVU_LOG_REQUESTS: undefined, TOVU_LOG_SLOW_REQUESTS: undefined } });
      app.use((_req, res, next) => {
        res.locals.principal = { id: "owner" };
        res.locals.adminFailureTracker = { error: (report: { error: Error }, options: unknown) => { reports.push({ ...report, options }); } };
        next();
      });
      const deps: AdminAnalyticsRecentHitsDeps = {
        workspaceId: "ws",
        authorize: failure === "authorize" ? fail : async () => ({ allowed: true, reason: "test" }),
        analyticsSink: {
          capabilities: () => ({ durable: false, batch: true }),
          accept: async () => {},
          acceptBatch: async () => {},
          list: failure === "sink" ? fail : async () => [],
        },
      };
      registerAdminAnalyticsRecentHitsRoute(app, deps);
      const response = await request(app, requestId);

      assert.equal(response.status, 500);
      const correlation = response.requestId;
      assert.ok(correlation);
      if (requestId) assert.equal(correlation, requestId);
      const errorId = assertAnalyticsFailure({ body: response.body, requestId: correlation });
      assert.equal(logs.length, 1);
      assert.equal(reports.length, 1);
      assert.equal((logs[0]![1] as { errorId: string }).errorId, errorId);
      assert.deepEqual(reports[0]!.options, { context: { operation: "analytics/recent-hits", attributes: { errorId } } });
      assert.match(JSON.stringify(logs), new RegExp(`private ${failure} failure`));
      assert.match(reports[0]!.error.message, new RegExp(`private ${failure} failure`));
      assert.equal(JSON.stringify(logs).includes(secret), false);
      assert.equal(reports[0]!.error.message.includes(secret), false);
      assert.doesNotMatch(JSON.stringify(response.body), new RegExp(`private|${secret}`));
    });
  }
}
