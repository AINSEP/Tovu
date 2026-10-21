/** visitorsafe, 2026-10-10: wire-level access, safe diagnostics and Gemini output budget.
 * No module mocks: real route/provider adapters, in-memory repos, injected operator-log sink.
 */
import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import express from "express";
import { set as setLegacySetting } from "@jini-ai/core/settings";
import { setPublicAssistantSettings, setSiteAssistantCredential, deleteSiteAssistantCredential } from "#src/assistant/index";
import type { SiteAssistantErrorLogEntry } from "#src/assistant/site/public-errors";
import { InMemoryPostRepo } from "#src/features/post/index";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { createRouteDeps } from "../runtime/composition/app.js";
import { createSiteAssistantModule } from "../runtime/composition/modules/site-assistant.js";
import { parsePublicJsonBody } from "../inbound/shared/json-body-parsers.js";
import { startTestServer } from "./helpers/http-test-server.js";
import { startStubProviderServer, type StubProviderReply } from "./helpers/stub-provider-server.js";

const TEST_KEY = "visitorsafe-plain-test-key";

async function boot(
  { t, reply }: { t: TestContext; reply: (count: number, body: Record<string, unknown>) => StubProviderReply },
  _options = {},
) {
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  // Imported/legacy ON state lets tests cover configuration failure without bypassing admin policy.
  await setPublicAssistantSettings({
    settingsRepo: deps.settingsRepo, getEffective: deps.getEffective, set: setLegacySetting,
    clock: deps.clock, ids: deps.idGen, principals: deps.principalRepo,
    authorize: async () => ({ allowed: true, reason: "test" }),
  }, { workspaceId: deps.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" });
  const providerUrl = await startStubProviderServer(t, reply);
  await setSiteAssistantCredential({
    repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring, clock: deps.clock,
  }, { workspaceId: deps.workspaceId, apiKey: TEST_KEY, model: "private-model", baseUrl: providerUrl });
  const logs: SiteAssistantErrorLogEntry[] = [];
  const app = express();
  app.use(parsePublicJsonBody);
  const routeDeps = { ...deps, siteAssistantErrorLog: (entry: SiteAssistantErrorLogEntry) => logs.push(entry) };
  createSiteAssistantModule(routeDeps, {}).registerRoutes?.(app);
  return { deps: routeDeps, logs, baseUrl: await startTestServer(app, t) };
}

function post({ baseUrl, message = "Hello" }: { baseUrl: string; message?: string }, _options = {}) {
  return fetch(baseUrl + "/api/site-assistant/chat", {
    method: "POST", headers: { "content-type": "application/json", cookie: "tovu-member-session=forged-member" },
    body: JSON.stringify({ message }),
  });
}

function googleReply({ parts }: { parts: unknown[] }, _options = {}): StubProviderReply {
  return { status: 200, body: "data: " + JSON.stringify({
    candidates: [{ content: { role: "model", parts }, finishReason: "STOP", index: 0 }],
  }) + "\n\n" };
}

test("visitorsafe: Gemini receives a 1024-token budget on the first request and tool continuation", async t => {
  const requests: Record<string, unknown>[] = [];
  const f = await boot({ t, reply: (count, body) => {
    requests.push(body);
    return googleReply({ parts: count === 1
      ? [{ functionCall: { name: "list_categories", args: {}, id: "read-1" } }]
      : [{ text: "Public answer" }] });
  } });
  const response = await post(f);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Public answer/);
  assert.equal(requests.length, 2);
  for (const body of requests) assert.equal((body.generationConfig as { maxOutputTokens?: number })?.maxOutputTokens, 1024);
});

test("visitorsafe: an empty Google response is a correlated provider error before end, not a silent success", async t => {
  let calls = 0;
  const f = await boot({ t, reply: () => {
    calls++;
    return { status: 200, body: 'data: {"candidates":[{"finishReason":"MAX_TOKENS"}],"usageMetadata":{"thoughtsTokenCount":1024}}\n\n' };
  } });
  const response = await post(f);
  assert.equal(response.status, 200);
  const frames = (await response.text()).trim().split("\n\n");
  assert.equal(frames.length, 2);
  assert.ok(frames[0]!.startsWith("event: error\n"));
  const error = JSON.parse(frames[0]!.slice("event: error\ndata: ".length));
  assert.equal(error.code, "provider_error");
  assert.equal(error.message, `The assistant couldn't answer right now. Please try again. (error ${error.errorId})`);
  assert.deepEqual(f.logs, [{ errorId: error.errorId, code: "provider_error",
    diagnostic: "Google returned no text or tool calls (MAX_TOKENS)" }]);
  assert.equal(frames[1], 'event: end\ndata: {"reason":"error"}');
  assert.equal(calls, 1, "an empty answer never triggers a second paid request");
});

test("visitorsafe: provider errors carry only safe text, stable code and an id matching the redacted operator log", async t => {
  const f = await boot({ t, reply: () => ({
    status: 429,
    body: JSON.stringify({ error: { message: "Gemini private-model project-secret quota exhausted; echoed " + TEST_KEY } }),
  }) });
  const response = await post(f);
  assert.equal(response.status, 200);
  const wire = await response.text();
  assert.doesNotMatch(wire, /Gemini|private-model|project-secret|quota|visitorsafe-plain-test-key/);
  const frame = wire.split("\n\n").find(frame => frame.startsWith("event: error\n"));
  assert.ok(frame, wire);
  const payload = JSON.parse(frame.slice(frame.indexOf("data: ") + 6)) as { message: string; code: string; errorId: string };
  assert.equal(payload.code, "provider_error");
  assert.ok(payload.errorId);
  assert.ok(payload.message.includes(payload.errorId));
  const log = f.logs.find(entry => entry.errorId === payload.errorId);
  assert.ok(log);
  assert.match(log.diagnostic, /Gemini private-model project-secret quota exhausted/);
  assert.doesNotMatch(log.diagnostic, /visitorsafe-plain-test-key/);
});

test("visitorsafe: preflight errors preserve 413/429 friendly text, codes, retry headers and lookup ids", async t => {
  let providerCalls = 0;
  const f = await boot({ t, reply: () => { providerCalls++; return googleReply({ parts: [{ text: "unused" }] }); } });
  const tooLong = await post({ ...f, message: "x".repeat(2001) });
  assert.equal(tooLong.status, 413);
  const lengthError = await tooLong.json();
  assert.equal(lengthError.code, "TOO_LARGE");
  assert.match(lengthError.error, /message is too long/);
  assert.ok(f.logs.some(entry => entry.errorId === lengthError.errorId));
  // A failing configuration still spends only the existing IP request slot, never provider tokens.
  await deleteSiteAssistantCredential({ repo: f.deps.siteAssistantCredentialRepo, clock: f.deps.clock }, { workspaceId: f.deps.workspaceId });
  for (let i = 0; i < 10; i++) {
    const unavailable = await post(f);
    assert.equal(unavailable.status, 503);
    const body = await unavailable.json();
    assert.match(body.error, /^The assistant couldn't answer right now/);
    assert.ok(f.logs.some(entry => entry.errorId === body.errorId));
    assert.doesNotMatch(body.error, /provider|model|key|environment/i);
  }
  const limited = await post(f);
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("retry-after"));
  const rateError = await limited.json();
  assert.equal(rateError.code, "RATE_LIMIT_EXCEEDED");
  assert.match(rateError.error, /wait before trying again/);
  assert.ok(f.logs.some(entry => entry.errorId === rateError.errorId));
  assert.equal(providerCalls, 0);
});

test("visitorsafe: real route tools never give a provider gated titles, body text or navigation targets", async t => {
  let continuation: Record<string, unknown> | undefined;
  const f = await boot({ t, reply: (count, body) => {
    if (count > 1) continuation = body;
    return googleReply({ parts: count === 1 ? [
      { functionCall: { name: "search_published_entries", args: {}, id: "search" } },
      { functionCall: { name: "get_published_entry", args: { slug: "secret" }, id: "get" } },
      { functionCall: { name: "navigate_to_entry", args: { slug: "secret" }, id: "navigate" } },
      { functionCall: { name: "scroll_to_entry", args: { slug: "secret" }, id: "scroll" } },
      { functionCall: { name: "highlight_entry", args: { slug: "secret" }, id: "highlight" } },
      { functionCall: { name: "list_categories", args: {}, id: "categories" } },
    ] : [{ text: "Public content only" }] });
  } });
  f.deps.postRepo = new InMemoryPostRepo([
    buildPostRecord({ id: "secret-id", workspaceId: f.deps.workspaceId, slug: "secret", title: "Members Private Title",
      status: "published", kind: "page", memberAccessJson: '{"visibility":"members"}', bodyJson: { text: "Members Private Body" } }),
    buildPostRecord({ id: "public-id", workspaceId: f.deps.workspaceId, slug: "open", title: "Public Control",
      status: "published", kind: "post" }),
  ]);
  const response = await post({ baseUrl: f.baseUrl, message: "take me to secret" });
  const wire = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(wire, /client_directive|Members Private Title|Members Private Body/);
  assert.ok(continuation, "provider continuation must receive the tool results");
  const body = JSON.stringify(continuation);
  assert.match(body, /Public Control/);
  assert.doesNotMatch(body, /Members Private Title|Members Private Body|secret-id/);
});

test("visitorsafe: JSON parser errors use the same safe error contract before provider execution", async t => {
  let calls = 0;
  const f = await boot({ t, reply: () => { calls++; return googleReply({ parts: [{ text: "unused" }] }); } });
  for (const [body, status, code] of [
    ["{malformed", 400, "VALIDATION"],
    [JSON.stringify({ message: "hello", history: "x".repeat(140_000) }), 413, "PAYLOAD_TOO_LARGE"],
  ] as const) {
    const response = await fetch(f.baseUrl + "/api/site-assistant/chat", {
      method: "POST", headers: { "content-type": "application/json" }, body,
    });
    assert.equal(response.status, status);
    const error = await response.json();
    assert.equal(error.code, code);
    assert.ok(error.errorId);
    assert.ok(error.error.includes(error.errorId));
    assert.ok(f.logs.some(entry => entry.errorId === error.errorId));
    assert.doesNotMatch(error.error, /malformed|SyntaxError|stack/);
  }
  assert.equal(calls, 0);
});

test("visitorsafe: an unexpected preflight exception is redacted in logs and safe in JSON", async t => {
  const f = await boot({ t, reply: () => googleReply({ parts: [{ text: "unused" }] }) });
  f.deps.siteAssistantRateLimiter = { check: async () => { throw new Error("Gemini internal-model diagnostic"); } } as typeof f.deps.siteAssistantRateLimiter;
  const response = await post(f);
  assert.equal(response.status, 500);
  const error = await response.json();
  assert.equal(error.code, "unavailable");
  assert.ok(error.errorId);
  assert.doesNotMatch(error.error, /Gemini|internal-model|diagnostic/);
  const log = f.logs.find(entry => entry.errorId === error.errorId);
  assert.ok(log);
  assert.match(log.diagnostic, /Gemini internal-model diagnostic/);
});

test("visitorsafe: credential decryption failures retain the real operator reason under the public error id", async t => {
  let calls = 0;
  const f = await boot({ t, reply: () => { calls++; return googleReply({ parts: [{ text: "unused" }] }); } });
  const originalSealer = f.deps.siteAssistantSecretSealer;
  f.deps.siteAssistantSecretSealer = {
    seal: originalSealer.seal.bind(originalSealer),
    open: async () => { throw new Error("credential authentication-tag failure with server-key context"); },
  };
  const response = await post(f);
  assert.equal(response.status, 503);
  const error = await response.json();
  assert.equal(error.code, "NOT_CONFIGURED");
  assert.ok(error.errorId);
  assert.doesNotMatch(error.error, /authentication|server-key|credential/);
  const log = f.logs.find(entry => entry.errorId === error.errorId);
  assert.ok(log);
  assert.match(log.diagnostic, /authentication-tag failure with server-key context/);
  assert.equal(calls, 0);
});

test('visitor provider policy is structurally locked even with owner Full CLI access and both env switches ON', async t => {
  const saved = { full: process.env.TOVU_AGENT_FULL_CLI_ACCESS, alias: process.env.TOVU_AGENT_NATIVE_FALLBACKS };
  process.env.TOVU_AGENT_FULL_CLI_ACCESS = '1'; process.env.TOVU_AGENT_NATIVE_FALLBACKS = '1';
  t.after(() => {
    for (const [key, value] of [['TOVU_AGENT_FULL_CLI_ACCESS', saved.full], ['TOVU_AGENT_NATIVE_FALLBACKS', saved.alias]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const requests: Record<string, unknown>[] = [];
  const forbidden = ['Bash', 'Edit', 'Write', 'Task', 'Agent', 'execute_delegated_tool', 'mcp__claude-in-chrome__read_page'];
  const f = await boot({ t, reply: (count, body) => {
    requests.push(body);
    return googleReply({ parts: count === 1 ? forbidden.map((name, index) => ({ functionCall: { name, args: {}, id: `native-${index}` } })) : [{ text: 'Public answer' }] });
  } });
  await f.deps.settingsUiTabsReady;
  await setLegacySetting({ deps: { repo: f.deps.settingsRepo, clock: f.deps.clock, ids: f.deps.idGen,
    principals: f.deps.principalRepo, authorize: async () => ({ allowed: true, reason: 'fixture' }) },
    input: { namespace: 'core.assistant-full-cli', key: 'enabled', scope: 'workspace',
      workspaceId: f.deps.workspaceId, value: true, callerPrincipalId: await f.deps.ownerPrincipalId } });
  const read = f.deps.getEffective;
  f.deps.getEffective = ((required, input) => {
    assert.notEqual(input.namespace, 'core.assistant-full-cli', 'visitor must never read owner Full CLI access');
    return read(required, input);
  }) as typeof read;
  const response = await post(f);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Public answer/);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    const tools = JSON.stringify(request.tools);
    for (const name of forbidden) assert.equal(tools.includes(`"${name}"`), false, name);
    assert.equal(tools.includes('mcp__'), false);
    assert.equal(request.cliParity, undefined);
    assert.equal(request.nativeToolAccess, undefined);
  }
  const continuation = JSON.stringify(requests[1]);
  // Each attempted native call must get a refusal, rather than silently invoking a native transport.
  for (const name of forbidden) assert.ok(continuation.includes(name), name);
  // why: Jini 9ab5ab46 (per-request tool snapshot) refuses an unpublished call as "Tool is not
  // exposed in this turn."; each forbidden call is pinned to that error response individually.
  const responses = ((requests[1] as { contents: Array<{ parts: Array<{ functionResponse?: { name: string; response: { content: string; isError: boolean } } }> }> }).contents)
    .flatMap((entry) => entry.parts).flatMap((part) => (part.functionResponse ? [part.functionResponse] : []));
  assert.deepEqual(responses.map((response) => response.name), forbidden);
  for (const response of responses) {
    assert.equal(response.response.isError, true, response.name);
    assert.match(response.response.content, /unknown|not.allowed|not.available|not.exposed|unsupported/i, response.name);
  }
});