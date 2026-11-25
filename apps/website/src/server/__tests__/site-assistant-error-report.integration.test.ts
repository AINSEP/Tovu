import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import express from "express";
import { set as setLegacySetting } from "@jini-ai/core/settings";
import {
  createNoopObservabilityPort,
  type ErrorReport,
  type ObservabilityPort,
} from "@jini-ai/core/contracts/observability";
import { createTracker } from "@jini-ai/diagnostics/observability/node";

import { setPublicAssistantSettings, setSiteAssistantCredential } from "#src/assistant/index";
import type { SiteAssistantErrorLogEntry } from "#src/assistant/site/public-errors";
import { createRouteDeps } from "../runtime/composition/app.js";
import { createSiteAssistantModule } from "../runtime/composition/modules/site-assistant.js";
import { parsePublicJsonBody } from "../inbound/shared/json-body-parsers.js";
import { applyRequestTracking } from "../inbound/shared/observability-middleware.js";
import { startTestServer } from "./helpers/http-test-server.js";
import { startStubProviderServer } from "./helpers/stub-provider-server.js";

/**
 * @file Site-assistant failures reach `ObservabilityPort.reportError` (provider wave 2): a failure
 * is forwarded ONCE (the request's own 5xx report does not repeat it) with its code and public
 * error id; a visitor-caused answer (bad input) is not an incident. The visitor reply is unchanged.
 */

// Built at runtime so no secret-shaped literal sits in the repo.
const secret = ["sk", "live", "S".repeat(12) + "v".repeat(12)].join("_");

async function boot({ t }: { t: TestContext }) {
  const reports: ErrorReport[] = [];
  const logs: SiteAssistantErrorLogEntry[] = [];
  const observability: ObservabilityPort = { ...createNoopObservabilityPort({}), reportError: (report) => { reports.push(report); } };
  const tracker = createTracker({ observability });
  const deps = { ...createRouteDeps(), observability, tracker, siteAssistantErrorLog: (entry: SiteAssistantErrorLogEntry) => { logs.push(entry); } };
  await deps.siteTitleReady;
  // Public assistant ON with no credential saved: every chat is a NOT_CONFIGURED 503.
  await setPublicAssistantSettings({
    settingsRepo: deps.settingsRepo, getEffective: deps.getEffective, set: setLegacySetting,
    clock: deps.clock, ids: deps.idGen, principals: deps.principalRepo,
    authorize: async () => ({ allowed: true, reason: "test" }),
  }, { workspaceId: deps.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" });
  const app = express();
  applyRequestTracking({ app, deps: { tracker, env: { TOVU_LOG_REQUESTS: undefined, TOVU_LOG_SLOW_REQUESTS: undefined } } });
  app.use(parsePublicJsonBody);
  createSiteAssistantModule(deps, { env: {} }).registerRoutes?.({ app });
  return { reports, logs, baseUrl: await startTestServer(app, t) };
}

function post({ baseUrl, message }: { baseUrl: string; message: string }) {
  return fetch(`${baseUrl}/api/site-assistant/chat?key=${secret}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `tovu-member-session=${secret}`, authorization: `Bearer ${secret}` },
    body: JSON.stringify({ message: `${message} ${secret}` }),
  });
}

test("a failed chat is reported once with its code and public error id, never the request", async (t) => {
  const f = await boot({ t });
  const response = await post({ baseUrl: f.baseUrl, message: "Hello" });
  assert.equal(response.status, 503);
  const body = await response.json() as { code: string; errorId: string };
  assert.equal(body.code, "NOT_CONFIGURED");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.reports.length, 1, "the request's own 5xx report does not repeat it");
  assert.deepEqual(f.reports[0]!.context, { operation: "site_assistant.chat", attributes: { code: "NOT_CONFIGURED", errorId: body.errorId } });
  assert.equal((f.reports[0]!.error as Error).name, "SiteAssistantError");
  assert.ok(!JSON.stringify({ ...f.reports[0], stack: (f.reports[0]!.error as Error).stack, message: (f.reports[0]!.error as Error).message }).includes(secret));
});

test("a visitor-caused answer is logged but not reported", async (t) => {
  const f = await boot({ t });
  const response = await fetch(`${f.baseUrl}/api/site-assistant/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "" }) });
  assert.equal(response.status, 400);
  assert.equal(f.logs.length, 1);
  assert.equal(f.reports.length, 0);
});

test("AG-UI provider failure sends the public message and one incident reference", async (t) => {
  const logs: SiteAssistantErrorLogEntry[] = [];
  const deps = { ...createRouteDeps(), siteAssistantErrorLog: (entry: SiteAssistantErrorLogEntry) => { logs.push(entry); } };
  await deps.siteTitleReady;
  await setPublicAssistantSettings({
    settingsRepo: deps.settingsRepo, getEffective: deps.getEffective, set: setLegacySetting,
    clock: deps.clock, ids: deps.idGen, principals: deps.principalRepo,
    authorize: async () => ({ allowed: true, reason: "test" }),
  }, { workspaceId: deps.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" });
  const providerUrl = await startStubProviderServer(t, () => ({ status: 500, body: JSON.stringify({ error: { message: `private upstream detail ${secret}` } }) }));
  await setSiteAssistantCredential({ repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
  { workspaceId: deps.workspaceId, apiKey: "test-fake-key-not-real", model: "gemini-flash-latest", baseUrl: providerUrl });
  const app = express();
  app.use(parsePublicJsonBody);
  createSiteAssistantModule(deps, { env: { GEMINI_API_KEY: "test-fake-key-not-real", TOVU_SITE_ASSISTANT_BASE_URL: providerUrl } }).registerRoutes?.({ app });
  const baseUrl = await startTestServer(app, t);
  const response = await fetch(`${baseUrl}/api/site-assistant/chat`, { method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream; agui=1" },
    body: JSON.stringify({ threadId: "thread-1", runId: "run-1", messages: [{ id: "m1", role: "user", content: "Hello" }], forwardedProps: { turnId: "turn-failure-01" } }) });
  const body = await response.text();
  const events = [...body.matchAll(/^data: (.+)$/gm)].map((match) => JSON.parse(match[1]!) as { type: string; message?: string });
  const errors = events.filter((event) => event.type === "RUN_ERROR");
  assert.equal(errors.length, 1, "one terminal error");
  assert.equal(events.filter((event) => event.type === "RUN_FINISHED").length, 0);
  const providerLog = logs.filter((entry) => entry.code === "provider_error");
  assert.equal(providerLog.length, 1);
  assert.equal(errors[0]!.message, `The assistant couldn't answer right now. Please try again. (error ${providerLog[0]!.errorId})`);
  assert.ok(!body.includes("private upstream detail") && !body.includes(secret), "provider detail stays in the operator log");
});
