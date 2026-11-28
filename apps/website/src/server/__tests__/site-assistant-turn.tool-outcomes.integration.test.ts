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
async function boot({ t, call, override = (deps) => deps, provider = { model: "gemini-flash-latest" }, done = text("Done.") }: {
  t: TestContext; call: StubProviderReply; override?: (deps: RouteDeps) => RouteDeps; provider?: { provider?: string; model: string }; done?: StubProviderReply;
}) {
  const created = createRouteDeps();
  await created.siteTitleReady;
  await setPublicAssistantSettings({ settingsRepo: created.settingsRepo, getEffective: created.getEffective, set: setLegacySetting,
    clock: created.clock, ids: created.idGen, authorize: alwaysAllow, principals: created.principalRepo },
  { workspaceId: created.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" });
  const requests: Record<string, unknown>[] = [];
  const providerUrl = await startStubProviderServer(t, (count, body) => {
    requests.push(body);
    return count === 1 ? call : done;
  });
  await setSiteAssistantCredential({ repo: created.siteAssistantCredentialRepo, sealer: created.siteAssistantSecretSealer,
    keyring: created.siteAssistantSecretKeyring, clock: created.clock },
  { workspaceId: created.workspaceId, apiKey: "test-fake-key-not-real", ...provider, baseUrl: providerUrl });
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

type Captured = { tracker: string; name: string; userId?: string; properties?: Record<string, unknown> };
/** Consented-visitor analytics around one list_categories call; every tracker records what it was handed. */
function analytics({ captured, visitorTracker, delivery, committed }: { captured: Captured[]; visitorTracker: boolean;
  delivery: "allowed" | "refused" | "absent"; committed: "yes" | "append-only" }) {
  // The composed tracker is frozen: a recording copy, not a patched one.
  const recorder = (base: RouteDeps["tracker"], tracker: string): RouteDeps["tracker"] => ({ ...base,
    capture: (event: { name: string; userId?: string }, options: { properties?: Record<string, unknown> } = {}) => {
      captured.push({ tracker, name: event.name, userId: event.userId, properties: options.properties });
    } });
  return (deps: RouteDeps): RouteDeps => ({ ...deps, tracker: recorder(deps.tracker, "site"),
    ...(visitorTracker ? { visitorTracker: recorder(deps.tracker, "visitor") } : {}),
    visitorAnalyticsProof: async () => ({ kind: "fake-consent-proof" }) as never,
    visitorAnalyticsDeliveryAllowed: delivery === "absent" ? undefined : async () => delivery === "allowed",
    toolAttemptAuditSink: (committed === "yes"
      ? { append: async () => assert.fail("a committing sink is written through appendCommitted"), appendCommitted: async () => true }
      : { append: async () => {} }) as unknown as RouteDeps["toolAttemptAuditSink"] });
}
const toolUses = (captured: Captured[]) => captured.filter((entry) => entry.name === "assistant_tool_used");

test("a consented visitor's committed tool attempt is captured on the visitor tracker, without its 'requested' phase", async (t) => {
  const captured: Captured[] = [];
  const turn = await boot({ t, call: functionCall("list_categories", {}, "cat-call"),
    override: analytics({ captured, visitorTracker: true, delivery: "allowed", committed: "yes" }) });
  assert.equal(turn.requests.length, 2);
  const uses = toolUses(captured);
  assert.deepEqual(uses.map((entry) => [entry.tracker, entry.properties?.toolId, entry.properties?.outcome, entry.properties?.chatSurface]),
    [["visitor", "list_categories", "completed", "public"]]);
  assert.match(String(uses[0]?.userId), /^visitor:/);
  assert.equal(uses[0]?.properties?.eventId, `assistant-tool:${String(uses[0]?.properties?.attemptId)}`);
});

test("without a visitor tracker a committed tool attempt is captured on the site tracker", async (t) => {
  const captured: Captured[] = [];
  await boot({ t, call: functionCall("list_categories", {}, "cat-call"),
    override: analytics({ captured, visitorTracker: false, delivery: "allowed", committed: "yes" }) });
  assert.deepEqual(toolUses(captured).map((entry) => [entry.tracker, entry.properties?.outcome]), [["site", "completed"]]);
});

test("an append-only audit sink, a refused delivery, or a site with no delivery check captures no tool use", async (t) => {
  for (const [delivery, committed] of [["allowed", "append-only"], ["refused", "yes"], ["absent", "yes"]] as const) {
    const captured: Captured[] = [];
    const turn = await boot({ t, call: functionCall("list_categories", {}, "cat-call"),
      override: analytics({ captured, visitorTracker: true, delivery, committed }) });
    assert.equal(turn.requests.length, 2, `${delivery}/${committed}: the tool still answered`);
    assert.deepEqual(toolUses(captured), [], `${delivery}/${committed}`);
  }
});

/** Real OpenAI `chat/completions` streaming framing for one tool call whose arguments are `argsJson`. */
function openAiToolCall(name: string, argsJson: string, id: string): StubProviderReply {
  return { status: 200, body: chunk({ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: argsJson } }] }, finish_reason: null }] })
    + chunk({ id: "c1", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }) + "data: [DONE]\n\n" };
}
function openAiText(reply: string): StubProviderReply {
  return { status: 200, body: chunk({ id: "c2", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: reply }, finish_reason: null }] })
    + chunk({ id: "c2", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) + "data: [DONE]\n\n" };
}

test("a tool call whose arguments are JSON null is checked as a call with no arguments", async (t) => {
  const turn = await boot({ t, call: openAiToolCall("site_guide", "null", "guide-call"), provider: { provider: "openai", model: "gpt-x" }, done: openAiText("Done.") });
  assert.equal(turn.status, 200);
  assert.equal(turn.requests.length, 2, "the model is asked to continue with the tool's answer");
  const answers = ((turn.requests[1]!.messages ?? []) as { role?: string; content?: unknown }[]).filter((message) => message.role === "tool");
  assert.equal(answers.length, 1);
  const unavailable = turn.logs.filter((entry) => entry.code === "unavailable");
  assert.deepEqual(unavailable.map((entry) => entry.diagnostic), ["site_guide: operation must be overview, explain or search."],
    "checked as an empty argument object, not refused as a non-object");
  assert.match(String(answers[0]!.content), new RegExp(`error ${unavailable[0]!.errorId}`), "the model sees the logged error id");
  assert.match(turn.body, /Done\./);
});
