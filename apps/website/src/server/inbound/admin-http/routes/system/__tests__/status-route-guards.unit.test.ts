import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { ServerLogEntry } from "#src/platform/server-logs/index";
import type { MailerPort } from "#src/platform/mail/index";
import { registerAdminAssistantDaemonRoutes } from "../assistant-daemon.js";
import { registerAdminMailStatusRoute } from "../mail-status.js";
import { registerAdminModuleStatusRoute } from "../module-status.js";
import { registerAdminObservabilityStatusRoute } from "../observability-status.js";
import { registerAdminServerLogsRoute } from "../server-logs.js";

/**
 * @file The two guards every small `system/*` status route shares that the HTTP suites under
 * `server/__tests__/routes/` cannot reach: the `:workspaceId` `?? ""` fallback (Express always fills
 * a matched param, so it is driven with a hand-built `req`, the narrow technique
 * `extractRouteHandler` documents), and the catch-all 500, which those suites never trigger because
 * the real authorizer does not throw. Each 500 case uses an authorizer that rejects with an error
 * carrying a path, and asserts the body stays the fixed envelope while the cause is only logged.
 */

const WS = "ws-status";
const allow = async () => ({ allowed: true as const, reason: "test" });
const explode = new Error("authorizer exploded at /private/var/tovu.db");
const reject = async (): Promise<never> => { throw explode; };

// Both mail-status cases stop before the mailer is consulted (404 / the authorizer throws).
const untouchedMailer: MailerPort = {
  capabilities: () => { throw new Error("mail-status must not reach the mailer here"); },
  send: async () => { throw new Error("mail-status never sends"); },
  sendBatch: async () => { throw new Error("mail-status never sends"); },
};

type Register = (app: express.Express, deps: { workspaceId: string; authorize: typeof allow | typeof reject }) => void;

const ROUTES: ReadonlyArray<{ name: string; method: "get" | "post"; path: string; register: Register; logPrefix: string }> = [
  { name: "mail-status", method: "get", path: "/api/admin/v1/workspaces/:workspaceId/system/mail-status",
    register: (app, deps) => registerAdminMailStatusRoute(app, { ...deps, mailer: untouchedMailer }), logPrefix: "[system/mail-status] unexpected error" },
  { name: "module-status", method: "get", path: "/api/admin/v1/workspaces/:workspaceId/system/module-status",
    register: (app, deps) => registerAdminModuleStatusRoute(app, deps), logPrefix: "[system/module-status] unexpected error" },
  { name: "observability-status", method: "get", path: "/api/admin/v1/workspaces/:workspaceId/system/observability-status",
    register: (app, deps) => registerAdminObservabilityStatusRoute(app, deps), logPrefix: "[system/observability-status] unexpected error" },
  { name: "server-logs", method: "get", path: "/api/admin/v1/workspaces/:workspaceId/system/server-logs",
    register: (app, deps) => registerAdminServerLogsRoute(app, deps), logPrefix: "[system/server-logs] unexpected error" },
  { name: "assistant-daemon restart", method: "post", path: "/api/admin/v1/workspaces/:workspaceId/system/assistant-daemon/restart",
    register: (app, deps) => registerAdminAssistantDaemonRoutes(app, { ...deps, restartAssistantDaemon: () => { throw new Error("must not restart"); } }),
    logPrefix: "[system/assistant-daemon] unexpected error restarting the agent daemon" },
];

function handlerFor(route: (typeof ROUTES)[number], authorize: typeof allow | typeof reject) {
  const app = express();
  route.register(app, { workspaceId: WS, authorize });
  return extractRouteHandler(app, route.method, route.path);
}

for (const route of ROUTES) {
  test(`${route.name}: a request with no :workspaceId param 404s before authorizing (direct handler call)`, async () => {
    let asked = false;
    const authorize = async () => { asked = true; return allow(); };
    const { res, capture } = createCapturingResponse();
    await handlerFor(route, authorize)({ params: {}, query: {} }, res);
    assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "workspace was not found" } });
    assert.equal(asked, false);
  });

  test(`${route.name}: an unexpected failure is a fixed 500 that never echoes the cause, which is only logged`, async (t) => {
    const logged = t.mock.method(console, "error", () => {});
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "owner" };
    await handlerFor(route, reject)({ params: { workspaceId: WS }, query: {} }, res);
    assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } });
    assert.deepEqual(logged.mock.calls.map((c) => c.arguments), [[route.logPrefix, explode]]);
  });
}

test("server-logs: a repeated query param (?level=error&level=debug) is filtered by its FIRST value only", async () => {
  const entry = (seq: number, level: ServerLogEntry["level"]): ServerLogEntry => ({ seq, at: "2026-10-21T00:00:00.000Z", level, source: "server", message: `line ${seq}` });
  const entries = [entry(1, "debug"), entry(2, "info"), entry(3, "error")];
  const app = express();
  registerAdminServerLogsRoute(app, { workspaceId: WS, authorize: allow }, { logs: { read: () => ({ entries, capturing: true }) } });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "owner" };
  await extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/system/server-logs")(
    { params: { workspaceId: WS }, query: { level: ["error", "debug"], contains: "line" } }, res);
  assert.equal(capture.statusCode, 200);
  assert.deepEqual(capture.jsonBody, { entries: [entries[2]], matched: 1, buffered: 3, truncated: false, capturing: true });
});
