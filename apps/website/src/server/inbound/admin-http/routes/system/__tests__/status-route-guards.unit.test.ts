import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import { assertIncidentDiagnostics, createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { ServerLogEntry } from "@jini-ai/core/contracts/site/platform-server-logs";
import type { PositionalMailer as MailerPort } from "@jini-ai/platform/mail";
import { registerAdminAssistantDaemonRoutes } from "#src/server/runtime/composition/http-app/mount-admin-system";
import { registerAdminMailStatusRoute } from "#src/server/runtime/composition/modules/system-mail";
import { registerAdminModuleStatusRoute } from "#src/server/runtime/composition/http-app/mount-admin-system";
import { registerAdminObservabilityStatusRoute } from "#src/server/runtime/composition/http-app/mount-admin-system";
import { registerAdminServerLogsRoute } from "#src/server/runtime/composition/http-app/mount-admin-system";
import { registerAdminDockerfileSourceRoute } from "../dockerfile-source.js";
import { registerAdminDeploymentOverviewRoute } from "#src/server/runtime/composition/modules/system-deploy";
import { createRouteDeps } from "#src/server/runtime/composition/app";

/**
 * @file The two guards every small `system/*` status route shares that the HTTP suites under
 * `server/__tests__/routes/` cannot reach: the `:workspaceId` `?? ""` fallback (Express always fills
 * a matched param, so it is driven with a hand-built `req`, the narrow technique
 * `extractRouteHandler` documents), and the catch-all 500, which those suites never trigger because
 * the real authorizer does not throw. Each 500 case uses an authorizer that rejects with an error
 * carrying a path, and asserts the body stays the fixed envelope while the cause is only logged.
 * Neither case reaches the Dockerfile on disk or the site-key material: both stop before them.
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

type Register = (app: express.Express, deps: { workspaceId: string; authorize: typeof allow | typeof reject }, errors: RouteErrorPorts) => void;

const ROUTES: ReadonlyArray<{ name: string; method: "get" | "post" | "put"; path: string; register: Register; logPrefix: string }> = [
  { name: "mail-status", method: "get", path: "/api/admin/v1/workspaces/:workspaceId/system/mail-status",
    register: (app, deps, errors) => registerAdminMailStatusRoute({ errors: errors, app, deps: { ...deps, mailer: untouchedMailer } }), logPrefix: "[routes/system/mail-status]" },
  { name: "module-status", method: "get", path: "/api/admin/v1/workspaces/:workspaceId/system/module-status",
    register: (app, deps, errors) => registerAdminModuleStatusRoute({ errors: errors, app, deps }), logPrefix: "[routes/system/module-status]" },
  { name: "observability-status", method: "get", path: "/api/admin/v1/workspaces/:workspaceId/system/observability-status",
    register: (app, deps, errors) => registerAdminObservabilityStatusRoute({ errors: errors, app, deps: { ...createRouteDeps(), ...deps } }), logPrefix: "[routes/system/observability-status]" },
  { name: "server-logs", method: "get", path: "/api/admin/v1/workspaces/:workspaceId/system/server-logs",
    register: (app, deps, errors) => registerAdminServerLogsRoute({ errors: errors, app, deps }), logPrefix: "[routes/system/server-logs]" },
  { name: "assistant-daemon restart", method: "post", path: "/api/admin/v1/workspaces/:workspaceId/system/assistant-daemon/restart",
    register: (app, deps, errors) => registerAdminAssistantDaemonRoutes({ errors: errors, app, deps: { ...deps, restartAssistantDaemon: () => { throw new Error("must not restart"); } } }),
    logPrefix: "[routes/system/assistant-daemon]" },
  { name: "dockerfile GET", method: "get", path: "/api/admin/v1/workspaces/:workspaceId/system/dockerfile",
    register: (app, deps, errors) => registerAdminDockerfileSourceRoute({ errors: errors, app, deps }), logPrefix: "[routes/system/dockerfile-source]" },
  { name: "dockerfile PUT", method: "put", path: "/api/admin/v1/workspaces/:workspaceId/system/dockerfile",
    register: (app, deps, errors) => registerAdminDockerfileSourceRoute({ errors: errors, app, deps }), logPrefix: "[routes/system/dockerfile-source]" },
  { name: "deployment-overview", method: "get", path: "/api/admin/v1/workspaces/:workspaceId/system/deployment-overview",
    register: (app, deps, errors) => registerAdminDeploymentOverviewRoute({ errors: errors, app, deps: { ...createRouteDeps(), ...deps } }), logPrefix: "[routes/system/deployment-overview]" },
];

function handlerFor(route: (typeof ROUTES)[number], authorize: typeof allow | typeof reject, errors: RouteErrorPorts = createRouteIncidentReporter().errors) {
  const app = express();
  route.register(app, { workspaceId: WS, authorize }, errors);
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

  test(`${route.name}: an unexpected failure is a fixed 500 that never echoes the cause, which is only logged`, async () => {
    const incidents = createRouteIncidentReporter();
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "owner" };
    await handlerFor(route, reject, incidents.errors)({ params: { workspaceId: WS }, query: {} }, res);
    assertAdminResponse({ actual: capture, expected: { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } } }, { failure: {"message":"The system setting operation could not be completed.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"system setting operation"} });
    assertIncidentDiagnostics({ incidents, step: route.logPrefix.slice(1, -1), diagnostics: [/authorizer exploded at \/private\/var\/tovu.db/] });
    assert.equal(incidents.reports.length, 1);
  });
}

test("server-logs: a repeated query param (?level=error&level=debug) is filtered by its FIRST value only", async () => {
  const entry = (seq: number, level: ServerLogEntry["level"]): ServerLogEntry => ({ seq, at: "2026-10-21T00:00:00.000Z", level, source: "server", message: `line ${seq}` });
  const entries = [entry(1, "debug"), entry(2, "info"), entry(3, "error")];
  const app = express();
  registerAdminServerLogsRoute({ errors: createRouteIncidentReporter().errors, app, deps: { workspaceId: WS, authorize: allow } }, { logs: { read: () => ({ entries, capturing: true }) } });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "owner" };
  await extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/system/server-logs")(
    { params: { workspaceId: WS }, query: { level: ["error", "debug"], contains: "line" } }, res);
  assert.equal(capture.statusCode, 200);
  assert.deepEqual(capture.jsonBody, { entries: [entries[2]], matched: 1, buffered: 3, truncated: false, capturing: true });
});

test("dockerfile PUT: a JSON body that is not an object is a 400 before any write", async () => {
  const app = express();
  registerAdminDockerfileSourceRoute({ errors: createRouteIncidentReporter().errors, app, deps: { workspaceId: WS, authorize: allow } });
  for (const body of [["contents"], null]) {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "owner" };
    await extractRouteHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/system/dockerfile")(
      { params: { workspaceId: WS }, body, headers: { "if-match": "\"etag-1\"" } }, res);
    assert.deepEqual(capture, { statusCode: 400, jsonBody: { error: "request body must be a JSON object" } });
  }
});

test("server-logs: an invalid filter is a 400 naming the filter rule; a log-source fault is not mistaken for one", async () => {
  const route = "/api/admin/v1/workspaces/:workspaceId/system/server-logs";
  const filterApp = express();
  let reads = 0;
  registerAdminServerLogsRoute({ errors: createRouteIncidentReporter().errors, app: filterApp, deps: { workspaceId: WS, authorize: allow } },
    { logs: { read: () => { reads++; return { entries: [], capturing: true }; } } });
  const invalid = createCapturingResponse();
  invalid.res.locals.principal = { id: "owner" };
  await extractRouteHandler(filterApp, "get", route)({ params: { workspaceId: WS }, query: { level: "loud" } }, invalid.res);
  assert.equal(invalid.capture.statusCode, 400);
  assert.deepEqual(invalid.capture.jsonBody, { error: "level must be one of debug, info, warn, error", code: "VALIDATION_ERROR" });
  assert.equal(reads, 0);

  const incidents = createRouteIncidentReporter();
  const faultApp = express();
  registerAdminServerLogsRoute({ errors: incidents.errors, app: faultApp, deps: { workspaceId: WS, authorize: allow } },
    { logs: { read: () => { throw new Error("log buffer is detached"); } } });
  const fault = createCapturingResponse();
  fault.res.locals.principal = { id: "owner" };
  await extractRouteHandler(faultApp, "get", route)({ params: { workspaceId: WS }, query: {} }, fault.res);
  assert.equal(fault.capture.statusCode, 500);
  assert.equal((fault.capture.jsonBody as { code: string }).code, "INTERNAL_ERROR");
  assert.equal(incidents.reports.length, 1);
});
