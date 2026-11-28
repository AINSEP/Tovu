import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import express, { type Request, type Response } from "express";
import { set as setLegacySetting } from "@jini-ai/core/settings";

import { setPublicAssistantSettings, setSiteAssistantCredential } from "../../assistant/index.js";
import type { SiteAssistantErrorLogEntry } from "../../assistant/index.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { createSiteAssistantModule } from "../runtime/composition/modules/site-assistant.js";
import { beginStream } from "../runtime/composition/modules/site-assistant-turn.js";
import { startTestServer } from "./helpers/http-test-server.js";
import { startStubProviderServer, type StubProviderReply } from "./helpers/stub-provider-server.js";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";

/**
 * @file What one visitor turn does with each tool outcome the capability registry can hand back,
 * driven through the real public chat route against a loopback stand-in for the provider: a tool
 * whose store fails, a tool called with no arguments, the public site guide, a failing audit sink,
 * and an unreadable visitor-tools policy. The model's view is read from the continuation request
 * the provider receives; the site's view from the error log the module is given.
 */

type RouteDeps = ReturnType<typeof createRouteDeps>;
const alwaysAllow = async () => ({ allowed: true, reason: "test" });

function chunk(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
function functionCall(name: string, args: unknown, id: string): StubProviderReply {
  return { status: 200, body: chunk({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name, args, id } }] }, index: 0 }] }) };
}
function text(reply: string): StubProviderReply {
  return { status: 200, body: chunk({ candidates: [{ content: { role: "model", parts: [{ text: reply }] }, finishReason: "STOP", index: 0 }] }) };
}
/** The function responses the provider received on a continuation: what the model learns. */
function toolResults(request: Record<string, unknown>): unknown[] {
  const contents = (request.contents ?? []) as { parts?: { functionResponse?: { response?: unknown } }[] }[];
  return contents.flatMap((content) => (content.parts ?? []).filter((part) => part.functionResponse).map((part) => part.functionResponse!.response));
}

/** Boots the module with a scripted provider; `override` swaps route deps before the module sees them. */
async function boot({ t, call, override = (deps) => deps }: { t: TestContext; call: StubProviderReply; override?: (deps: RouteDeps) => RouteDeps }) {
  const created = createRouteDeps();
  await created.siteTitleReady;
  await setPublicAssistantSettings({ settingsRepo: created.settingsRepo, getEffective: created.getEffective, set: setLegacySetting,
    clock: created.clock, ids: created.idGen, authorize: alwaysAllow, principals: created.principalRepo },
  { workspaceId: created.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" });
  const requests: Record<string, unknown>[] = [];
  const providerUrl = await startStubProviderServer(t, (count, body) => {
    requests.push(body);
    return count === 1 ? call : text("Done.");
  });
  await setSiteAssistantCredential({ repo: created.siteAssistantCredentialRepo, sealer: created.siteAssistantSecretSealer,
    keyring: created.siteAssistantSecretKeyring, clock: created.clock },
  { workspaceId: created.workspaceId, apiKey: "test-fake-key-not-real", model: "gemini-flash-latest", baseUrl: providerUrl });
  const logs: SiteAssistantErrorLogEntry[] = [];
  const deps = { ...override(created), siteAssistantErrorLog: (entry: SiteAssistantErrorLogEntry) => { logs.push(entry); } };
  const app = express();
  app.use(express.json());
  createSiteAssistantModule({ deps, reporter: createRouteIncidentReporter().reporter },
    { env: { ...process.env, GEMINI_API_KEY: "test-fake-key-not-real", TOVU_SITE_ASSISTANT_BASE_URL: providerUrl, TOVU_VISITOR_TOOLS_POLICY: "on" } }).registerRoutes?.({ app });
  const baseUrl = await startTestServer(app, t);
  const response = await fetch(`${baseUrl}/api/site-assistant/chat`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Help me." }) });
  const body = await response.text();
  return { requests, logs, status: response.status, body };
}

test("a tool whose store fails is answered to the model with the public error, and the failure is logged as unavailable", async (t) => {
  const offline = new Error("taxonomy store offline");
  const failing = new Proxy({}, { get: () => async () => { throw offline; } });
  const turn = await boot({ t, call: functionCall("list_categories", {}, "cat-call"),
    override: (deps) => ({ ...deps, taxonomyRepo: failing as RouteDeps["taxonomyRepo"], termRepo: failing as RouteDeps["termRepo"] }) });
  assert.equal(turn.status, 200);
  assert.equal(turn.requests.length, 2, "a failed tool does not end the turn: the model is asked to continue");
  const unavailable = turn.logs.filter((entry) => entry.code === "unavailable");
  assert.equal(unavailable.length, 1);
  assert.match(String(unavailable[0]!.diagnostic), /taxonomy store offline/);
  const [result] = toolResults(turn.requests[1]!) as { content?: unknown; error?: unknown }[];
  const seen = JSON.stringify(result);
  assert.match(seen, new RegExp(`error ${unavailable[0]!.errorId}`), "the model sees the public message carrying the logged error id");
  assert.doesNotMatch(seen, /taxonomy store offline/, "the store's own message never reaches the model");
  assert.match(turn.body, /Done\./);
});

test("the model's site_guide call runs the public guide and returns only public topics", async (t) => {
  const turn = await boot({ t, call: functionCall("site_guide", { operation: "overview" }, "guide-call") });
  assert.equal(turn.requests.length, 2);
  const seen = JSON.stringify(toolResults(turn.requests[1]!));
  assert.match(seen, /\\"id\\":\\"content\\"|"id":"content"/);
  assert.doesNotMatch(seen, /plugins/);
  assert.deepEqual(turn.logs, []);
});

test("an audit sink that fails is reported as visitor_tools_audit and the tool still answers", async (t) => {
  const sinkDown = new Error("audit sink down");
  const turn = await boot({ t, call: functionCall("list_categories", {}, "cat-call"),
    override: (deps) => ({ ...deps, toolAttemptAuditSink: { append: async () => { throw sinkDown; } } as unknown as RouteDeps["toolAttemptAuditSink"] }) });
  assert.equal(turn.requests.length, 2);
  const audit = turn.logs.filter((entry) => entry.code === "visitor_tools_audit");
  assert.ok(audit.length >= 1, "every failed audit append is reported");
  assert.match(String(audit[0]!.diagnostic), /audit sink down/);
});

test("an unreadable visitor-tools policy is reported as visitor_tools_policy", async (t) => {
  const turn = await boot({ t, call: text("No tools needed."),
    override: (deps) => {
      const repo = deps.settingsRepo;
      const settingsRepo = new Proxy(repo, { get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver) as unknown;
        if (property !== "findActiveDefinition" || typeof value !== "function") return typeof value === "function" ? value.bind(target) : value;
        return async (required: { namespace: string; key: string }) => {
          if (required.namespace === "site.assistant" && required.key === "visitor_tools") throw new Error("policy row unreadable");
          return value.call(target, required) as unknown;
        };
      } });
      return { ...deps, settingsRepo };
    } });
  assert.equal(turn.status, 200);
  const policy = turn.logs.filter((entry) => entry.code === "visitor_tools_policy");
  assert.ok(policy.length >= 1);
  assert.match(String(policy[0]!.diagnostic), /policy row unreadable/);
  assert.match(turn.body, /No tools needed\./);
});

/** A response that records what beginStream sets, with or without the optional `flushHeaders`. */
function recordingResponse({ flush }: { flush: boolean }) {
  const seen: { status?: number; headers?: Record<string, string>; flushed: number } = { flushed: 0 };
  const res = {
    status(code: number) { seen.status = code; return res; },
    set(headers: Record<string, string>) { seen.headers = headers; return res; },
    ...(flush ? { flushHeaders() { seen.flushed += 1; } } : {}),
  };
  return { res: res as unknown as Response, seen };
}

test("beginStream sends no connection header on HTTP/2 and tolerates a response without flushHeaders", () => {
  const { res, seen } = recordingResponse({ flush: false });
  beginStream({ httpVersionMajor: 2 } as Request, res);
  assert.equal(seen.status, 200);
  assert.deepEqual(seen.headers, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" });
  assert.equal(seen.flushed, 0);
});

test("beginStream keeps keep-alive on HTTP/1.1 and flushes the headers at once", () => {
  const { res, seen } = recordingResponse({ flush: true });
  beginStream({ httpVersionMajor: 1 } as Request, res);
  assert.deepEqual(seen.headers, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
  assert.equal(seen.flushed, 1);
});
