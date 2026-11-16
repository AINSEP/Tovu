import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import express from "express";
import { set as setLegacySetting } from "@jini-ai/core/settings";

import { setPublicAssistantSettings, setSiteAssistantCredential } from "../../assistant/index.js";
import { writeVisitorTools } from "#src/features/settings/visitor-tools-write";
import { createRouteDeps } from "../runtime/composition/app.js";
import { createSiteAssistantModule } from "../runtime/composition/modules/site-assistant.js";
import { startTestServer } from "./helpers/http-test-server.js";
import { startStubProviderServer, type StubProviderReply } from "./helpers/stub-provider-server.js";

/**
 * @file T0-4 of the AG-UI design (S0): the frames the public site chat sends today
 * (`event: text|error|end|client_directive`), pinned before the site moves to AG-UI in S5.
 *
 * Scenarios: a plain reply; an Ask-mode content tool whose directive the visitor allows; the same
 * denied; the same refused for capacity (two prompts already held from this address, so the third
 * tool is denied with no directive and the turn continues); a provider error; a visitor who leaves.
 * Lifecycle order, what is disclosed to the visitor, and each ending are the pinned properties.
 *
 * NOT pinned here (recorded in the run report): confirmation expiry, which needs the exchange
 * store's timer injected through the module, and a successful `page.navigate`, which needs an
 * attached page session. Both must be added before S5 replaces this wire.
 *
 * Regenerate with `UPDATE_GOLDEN=1` only in a commit that names the wire change it makes.
 */

const GOLDEN = fileURLToPath(new URL("./goldens/site-chat-stream.golden.json", import.meta.url));
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

async function boot({ t, respond, ask = false }: { t: TestContext; respond: (count: number, body: Record<string, unknown>) => StubProviderReply; ask?: boolean }) {
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  await setPublicAssistantSettings({ settingsRepo: deps.settingsRepo, getEffective: deps.getEffective, set: setLegacySetting,
    clock: deps.clock, ids: deps.idGen, authorize: alwaysAllow, principals: deps.principalRepo },
  { workspaceId: deps.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" });
  if (ask) await writeVisitorTools({ deps: { repo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen, authorize: alwaysAllow, principals: deps.principalRepo },
    workspaceId: deps.workspaceId, callerPrincipalId: "test-caller", value: { version: 1, tools: { list_categories: { mode: "ask" } } } });
  let siteOrigin: URL | undefined;
  deps.originRegistry.canonicalOrigin = async () => ({ scheme: "http", host: siteOrigin!.hostname, port: Number(siteOrigin!.port),
    source: "dev-capability", verifiedAt: deps.clock.nowIso() });
  const providerUrl = await startStubProviderServer(t, respond);
  await setSiteAssistantCredential({ repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
  { workspaceId: deps.workspaceId, apiKey: "test-fake-key-not-real", model: "gemini-flash-latest", baseUrl: providerUrl });
  const app = express();
  app.use(express.json());
  const logs: unknown[] = [];
  createSiteAssistantModule({ ...deps, siteAssistantErrorLog: (entry: unknown) => logs.push(entry) } as typeof deps,
    { ...process.env, GEMINI_API_KEY: "test-fake-key-not-real", TOVU_SITE_ASSISTANT_BASE_URL: providerUrl, TOVU_VISITOR_TOOLS_POLICY: "on" }).registerRoutes?.({ app });
  const baseUrl = await startTestServer(app, t);
  siteOrigin = new URL(baseUrl);
  return { baseUrl };
}

function chat(baseUrl: string, signal?: AbortSignal): Promise<Response> {
  return fetch(`${baseUrl}/api/site-assistant/chat`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "List the categories." }), ...(signal ? { signal } : {}) });
}

function confirm(baseUrl: string, challengeId: string, allow: boolean): Promise<Response> {
  return fetch(`${baseUrl}/api/site-assistant/confirm`, { method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "sec-fetch-site": "same-origin" }, body: JSON.stringify({ challengeId, allow }) });
}

/** Reads the open stream until a confirmation directive arrives; returns its challenge id. */
async function readDirective(reader: ReadableStreamDefaultReader<Uint8Array>, sink: { raw: string }): Promise<string> {
  for (;;) {
    const match = sink.raw.match(/event: client_directive\ndata: ([^\n]+)\n\n/);
    if (match) return (JSON.parse(match[1]!) as { challengeId: string }).challengeId;
    const next = await reader.read();
    assert.equal(next.done, false, "the turn must stay open while it waits for the visitor");
    sink.raw += new TextDecoder().decode(next.value);
  }
}

async function drain(reader: ReadableStreamDefaultReader<Uint8Array>, sink: { raw: string }): Promise<void> {
  for (;;) {
    const next = await reader.read();
    if (next.done) return;
    sink.raw += new TextDecoder().decode(next.value);
  }
}

/** Random per-request values are checked for shape and replaced, so every other byte stays pinned. */
function pin(raw: string): string {
  return raw
    .replace(/"challengeId":"[A-Za-z0-9_-]{22}"/g, '"challengeId":"<challenge>"')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>");
}

function pinnedHeaders(response: Response): [string, string][] {
  return [...response.headers].filter(([name]) => name !== "date" && name !== "set-cookie").sort(([a], [b]) => a.localeCompare(b));
}

const actual: Record<string, unknown> = {};

function check(name: string, value: unknown): void {
  actual[name] = value;
  if (process.env.UPDATE_GOLDEN === "1") return;
  const golden = (JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, unknown>)[name];
  assert.deepEqual(value, golden, `site chat golden "${name}"`);
}

test("site chat golden: a plain reply", async (t) => {
  const { baseUrl } = await boot({ t, respond: () => text("Hello from the site.") });
  const response = await chat(baseUrl);
  check("plain reply", { status: response.status, headers: pinnedHeaders(response), body: pin(await response.text()) });
});

for (const allow of [true, false]) {
  test(`site chat golden: an Ask-mode content tool, visitor answers allow=${allow}`, { timeout: 8_000 }, async (t) => {
    const requests: Record<string, unknown>[] = [];
    const { baseUrl } = await boot({ t, ask: true, respond: (count, body) => {
      requests.push(body);
      return count === 1 ? functionCall("list_categories", {}, "ask-call") : text("Finished.");
    } });
    const response = await chat(baseUrl);
    const reader = response.body!.getReader();
    const sink = { raw: "" };
    const challengeId = await readDirective(reader, sink);
    assert.equal(requests.length, 1, "the model gets no continuation while its tool is held");
    assert.equal((await confirm(baseUrl, challengeId, allow)).status, 200);
    await drain(reader, sink);
    assert.equal(requests.length, 2);
    check(`ask tool, allow=${allow}`, { status: response.status, body: pin(sink.raw), toolResultSeenByModel: toolResults(requests[1]!) });
  });
}

/** The function responses the provider received on the continuation: what the model learns of the outcome. */
function toolResults(request: Record<string, unknown>): unknown[] {
  const contents = (request.contents ?? []) as { parts?: { functionResponse?: { response?: unknown } }[] }[];
  return contents.flatMap((content) => (content.parts ?? []).filter((part) => part.functionResponse).map((part) => part.functionResponse!.response));
}

test("site chat golden: an Ask-mode tool is denied without a prompt when this address already holds two", { timeout: 10_000 }, async (t) => {
  const requests: Record<string, unknown>[] = [];
  const { baseUrl } = await boot({ t, ask: true, respond: (_count, body) => {
    requests.push(body);
    return toolResults(body).length === 0 ? functionCall("list_categories", {}, "ask-call") : text("Finished.");
  } });
  const held = [];
  for (let i = 0; i < 2; i += 1) {
    const response = await chat(baseUrl);
    const reader = response.body!.getReader();
    const sink = { raw: "" };
    held.push({ reader, sink, challengeId: await readDirective(reader, sink) });
  }
  const third = await chat(baseUrl);
  const body = pin(await third.text());
  assert.doesNotMatch(body, /client_directive/, "a turn that cannot hold a prompt must not show one");
  for (const turn of held) {
    assert.equal((await confirm(baseUrl, turn.challengeId, false)).status, 200);
    await drain(turn.reader, turn.sink);
  }
  check("ask tool, no capacity", { status: third.status, body, toolResultSeenByModel: toolResults(requests.find((request) => toolResults(request).length > 0)!) });
});

test("site chat golden: a provider error", async (t) => {
  const { baseUrl } = await boot({ t, respond: () => ({ status: 500, body: JSON.stringify({ error: { message: "private upstream detail" } }) }) });
  const response = await chat(baseUrl);
  const body = pin(await response.text());
  assert.doesNotMatch(body, /private upstream detail/);
  check("provider error", { status: response.status, body });
});

test("site chat golden: a visitor who leaves cancels the provider call and gets no end frame", { timeout: 8_000 }, async (t) => {
  let accepted!: () => void;
  let cancelled!: () => void;
  const providerStarted = new Promise<void>((resolve) => { accepted = resolve; });
  const providerCancelled = new Promise<void>((resolve) => { cancelled = resolve; });
  const provider = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.on("close", cancelled);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(": provider pending\n\n");
      accepted();
    });
  });
  t.after(() => { provider.closeAllConnections(); return new Promise<void>((resolve) => provider.close(() => resolve())); });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const providerUrl = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  await setPublicAssistantSettings({ settingsRepo: deps.settingsRepo, getEffective: deps.getEffective, set: setLegacySetting,
    clock: deps.clock, ids: deps.idGen, authorize: alwaysAllow, principals: deps.principalRepo },
  { workspaceId: deps.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" });
  await setSiteAssistantCredential({ repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer,
    keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
  { workspaceId: deps.workspaceId, apiKey: "test-fake-key-not-real", model: "gemini-flash-latest", baseUrl: providerUrl });
  const app = express();
  app.use(express.json());
  createSiteAssistantModule(deps, { ...process.env, GEMINI_API_KEY: "test-fake-key-not-real", TOVU_SITE_ASSISTANT_BASE_URL: providerUrl }).registerRoutes?.({ app });
  const baseUrl = await startTestServer(app, t);
  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await chat(baseUrl, controller.signal);
  const reader = response.body!.getReader();
  const sink = { raw: "" };
  await providerStarted;
  controller.abort();
  await drain(reader, sink).catch(() => undefined);
  await providerCancelled;
  check("visitor abort", { status: response.status, bodyBeforeLeaving: pin(sink.raw) });
});

test("the site chat golden file holds exactly these scenarios", () => {
  if (process.env.UPDATE_GOLDEN === "1") writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(golden), ["plain reply", "ask tool, allow=true", "ask tool, allow=false", "ask tool, no capacity", "provider error", "visitor abort"]);
});
