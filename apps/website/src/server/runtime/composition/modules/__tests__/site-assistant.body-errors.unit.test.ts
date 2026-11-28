import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../app.js";
import { createSiteAssistantModule } from "../site-assistant.js";
import { VISITOR_AG_UI_ACCEPT } from "../site-assistant-ag-ui.js";
import { VISITOR_APPROVAL_EXPIRED } from "#src/assistant/site/visitor-ag-ui-resume";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file The visitor chat route's own error edges, through real Express and the real module: the
 * body-parser failures it answers before the generic middleware (malformed JSON is the visitor's
 * 400, any other parser failure a redacted 500), and a turn that throws before its stream opened.
 * Each answer carries the id of the one incident logged for it.
 */

const CHAT = "/api/site-assistant/chat";

async function boot(t: import("node:test").TestContext, deps: RouteDeps = createRouteDeps()) {
  const logged: Array<{ errorId: string; code: string; diagnostic: string }> = [];
  const app = express();
  app.use(express.json());
  createSiteAssistantModule({ deps: { ...deps, siteAssistantErrorLog: (entry) => { logged.push(entry as never); } }, reporter: createRouteIncidentReporter().reporter },
    { env: { TOVU_VISITOR_TOOLS_POLICY: "on" } }).registerRoutes?.({ app });
  return { baseUrl: await startTestServer(app, t), logged };
}

async function post(baseUrl: string, body: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}${CHAT}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
  return { status: res.status, body: await res.json() as { error: string; errorId: string; code: string } };
}

test("a malformed JSON chat body is the visitor's 400 VALIDATION answer with its incident id", async (t) => {
  const { baseUrl, logged } = await boot(t);
  const answer = await post(baseUrl, '{"message":');
  assert.match(String(logged[0]?.diagnostic), /JSON/);
  assert.deepEqual([answer.status, answer.body.code], [400, "VALIDATION"]);
  assert.match(answer.body.errorId, /^[0-9a-f-]{36}$/);
  assert.ok(answer.body.error.includes(answer.body.errorId), answer.body.error);
  assert.deepEqual(logged.map(entry => [entry.errorId, entry.code]), [[answer.body.errorId, answer.body.code]], "one incident, the one the visitor was told about");
});

test("a body-parser failure that is neither oversized nor malformed is a redacted 500", async (t) => {
  const { baseUrl, logged } = await boot(t);
  const answer = await post(baseUrl, '{"message":"hello"}', { "content-encoding": "x-made-up" });
  assert.match(String(logged[0]?.diagnostic), /unsupported content encoding/);
  assert.deepEqual([answer.status, answer.body.code], [500, "unavailable"]);
  assert.match(answer.body.errorId, /^[0-9a-f-]{36}$/);
  assert.equal(answer.body.error.includes("x-made-up"), false, "the parser's own words never reach the visitor");
  assert.deepEqual(logged.map(entry => [entry.errorId, entry.code]), [[answer.body.errorId, answer.body.code]], "one incident, the one the visitor was told about");
});

test("a turn that throws before its stream opened answers a JSON 500 with the incident id", async (t) => {
  const deps = createRouteDeps();
  const failing: RouteDeps = { ...deps, getEffective: (() => { throw new Error("settings store offline"); }) as never };
  const { baseUrl, logged } = await boot(t, failing);
  const answer = await post(baseUrl, JSON.stringify({ message: "hello" }));
  assert.match(String(logged[0]?.diagnostic), /settings store offline/);
  assert.deepEqual([answer.status, answer.body.code], [500, "unavailable"]);
  assert.match(answer.body.errorId, /^[0-9a-f-]{36}$/);
  assert.equal(answer.body.error.includes("settings store offline"), false);
  assert.deepEqual(logged.map(entry => [entry.errorId, entry.code]), [[answer.body.errorId, answer.body.code]], "one incident, the one the visitor was told about");
});

test("an AG-UI approval answer whose resume fails before streaming is logged once and answered as the expired-request 400", async (t) => {
  const deps = createRouteDeps();
  const failing: RouteDeps = { ...deps, getEffective: (() => { throw new Error("settings store offline"); }) as never };
  const { baseUrl, logged } = await boot(t, failing);
  const res = await fetch(`${baseUrl}${CHAT}`, { method: "POST", headers: { "content-type": "application/json", accept: VISITOR_AG_UI_ACCEPT },
    body: JSON.stringify({ resume: [{ interruptId: "interrupt-1", status: "resolved", payload: { approved: true } }], messages: [] }) });
  assert.equal(res.status, 400);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { error: VISITOR_APPROVAL_EXPIRED });
  assert.deepEqual(logged.map(entry => entry.code), ["visitor_tools_confirm"]);
  assert.match(String(logged[0]?.diagnostic), /settings store offline/);
});
