import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { resolveSiteRoot } from "#src/platform/site-dir/index";
import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import express from "express";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { installAgentPlugin, recordBundledAgentPluginDigests } from "#src/features/agent-plugins/lifecycle";
import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";
import { createRouteDeps } from "../../app.js";
import { createByokToolSurface, setExecutionCredential, type ByokToolSurface } from "#src/assistant/index";
import { registerAuthRoutes } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { startStubProviderServer } from "#src/server/__tests__/helpers/stub-provider-server";
import { BYOK_TURN_PATH, createAssistantByokModule } from "../assistant-byok.js";
import { testToolReporter } from "#src/assistant/__tests__/helpers/tool-reporter";

test("BYOK automatic preflight keeps the prompt and logs a redacted cause", async (t) => {
  const source = ts.createSourceFile("assistant-byok.ts", readFileSync(new URL("../assistant-byok.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  function find(node: ts.Node): ts.FunctionDeclaration | undefined {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "appendAutomaticPluginGuidance") return node;
    return ts.forEachChild(node, find);
  }
  const declaration = find(source); assert.ok(declaration, "the preflight handler exists");
  const code = ts.transpileModule(`return (${declaration.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const warnings = t.mock.method(console, "warn", () => undefined);
  const start = async () => { throw new Error("boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET"); };
  const append = new Function("automaticPluginRuns", "readChatAgentPluginState", "formatErrorForLog", "TOVU_ERROR_REDACTION_OPTIONS", code)(
    { start }, () => ({}), formatErrorForLog, TOVU_ERROR_REDACTION_OPTIONS,
  );
  const prompt = await append({ run: { id: "run" }, principal: { id: "owner" }, conversationId: "chat", pluginBody: {}, messages: [], pinned: [], abort: new AbortController(), res: {}, system: "existing prompt" }, { start });
  assert.equal(prompt, "existing prompt");
  assert.equal(warnings.mock.calls[0]?.arguments[0], "[agent-plugins] automatic BYOK preflight unavailable");
  assert.match(String(warnings.mock.calls[0]?.arguments[1]), /boom/);
  assert.match(String(warnings.mock.calls[0]?.arguments[1]), /assistant-byok\.inputs-pin\.test\.ts/);
  assert.doesNotMatch(String(warnings.mock.calls[0]?.arguments[1]), /SECRETSECRETSECRETSECRET/);
});

/** TW2 L136: old validation order, attachment failures and fail-soft plugin preflight. */
test("BYOK pins history, credential and attachment validation before opening SSE", async t => {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps, errors: createRouteIncidentReporter().errors });
  createAssistantByokModule({ reporter: testToolReporter(), routeDeps: deps }, { toolSurface: createByokToolSurface(Object.assign(deps, { reporter: testToolReporter() }), { installExtensions: false }) }).registerRoutes?.({ app });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const messages = [{ role: "user", content: "Hello" }];
  const byok = { protocol: "anthropic", apiKey: "fixture-key", model: "fixture-model" };
  const cases = [
    { body: {}, error: "'messages' must end with a non-empty user message" },
    { body: { messages: [{ role: "assistant", content: "Hello" }] }, error: "'messages' must end with a non-empty user message" },
    { body: { messages, attachmentIds: false }, error: /no usable BYOK credential/ },
    ...[null, false, Array(11).fill("file"), [""], [7]].map(attachmentIds => ({ body: { messages, byok, attachmentIds }, error: "Invalid message attachments" })),
    { body: { messages, byok, attachmentIds: ["missing.png"] }, error: "Attachment is unavailable. Reattach it before sending." },
  ];
  for (const entry of cases) {
    const response = await fetch(`${baseUrl}${BYOK_TURN_PATH}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(entry.body) });
    assert.equal(response.status, 400);
    const body = await response.json() as { error: string; code: string };
    assert.equal(body.code, "VALIDATION_ERROR");
    if (entry.error instanceof RegExp) assert.match(body.error, entry.error);
    else assert.equal(body.error, entry.error);
  }
});

test("BYOK pins absent and empty attachments, malformed plugin picks, and missing pinned plugins without discarding the provider turn", async t => {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps, errors: createRouteIncidentReporter().errors });
  createAssistantByokModule({ reporter: testToolReporter(), routeDeps: deps }, { toolSurface: createByokToolSurface(Object.assign(deps, { reporter: testToolReporter() }), { installExtensions: false }) }).registerRoutes?.({ app });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  let calls = 0;
  const providerUrl = await startStubProviderServer(t, () => {
    calls++;
    return { status: 200, body: 'event: message_start\ndata: {"type":"message_start","message":{"id":"reply","role":"assistant","content":[],"model":"fixture","usage":{"input_tokens":1,"output_tokens":0}}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":0}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n' };
  });
  for (const extra of [{}, { attachmentIds: [], pluginRefIds: 7 }, { pluginRefIds: [7, "missing-plugin"], conversationId: "pin-chat", userPrompt: "Hello" }, { conversationId: "fallback-query" }]) {
    const response = await fetch(`${baseUrl}${BYOK_TURN_PATH}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({
      messages: [{ role: "user", content: "Hello" }], byok: { protocol: "anthropic", apiKey: "fixture-key", model: "fixture", baseUrl: providerUrl }, ...extra,
    }) });
    assert.equal(response.status, 200);
    const stream = await response.text();
    assert.match(stream, /event: end/);
    assert.doesNotMatch(stream, /event: error/);
    assert.equal(stream.includes("Some selected Agent Plugins could not be loaded"), Array.isArray(extra.pluginRefIds));
  }
  assert.equal(calls, 4);
});


test("BYOK repeats pinned guidance while retaining good picks around failures (reported, not fixed)", async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), "byok-pin-"));
  t.after(() => forceRemove(cwd));
  const layout = resolveAgentPluginLayout({ siteDir: resolveSiteRoot({ env: {}, cwd: cwd }) }, { env: {} });
  const deps = createRouteDeps();
  deps.agentPluginLayout = layout;
  const archive = new TextEncoder().encode("pin-plugin-fixture");
  const installed = await installAgentPlugin({ archive, expectedSha256: createHash("sha256").update(archive).digest("hex"), layout, workspaceId: deps.workspaceId,
    archiveReader: { async *entries() {
      for (const [entryPath, content] of [
        ["plugin.json", JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "pin-guidance", version: "1.0.0", keywords: ["holography"], extensions: { tovu: { id: "test/pin-guidance", displayName: "Pin Holography", provides: ["theme-authoring"] } } })],
        ["skills/pin-guidance/SKILL.md", "---\nname: pin-guidance\ndescription: Holography guidance\n---\nPreserve the unique pin guidance."],
      ] as const) {
        const bytes = new TextEncoder().encode(content);
        yield { entryPath, kind: "file" as const, declaredSize: bytes.length, async *openReadStream() { yield bytes; } };
      }
    } },
  });
  await recordBundledAgentPluginDigests({ workspaceRoot: layout.forWorkspace({ workspaceId: deps.workspaceId }).root, seeded: [{ pluginId: installed.pluginId, archiveDigest: installed.archiveDigest }] });
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps, errors: createRouteIncidentReporter().errors });
  createAssistantByokModule({ reporter: testToolReporter(), routeDeps: deps }, { toolSurface: createByokToolSurface(Object.assign(deps, { reporter: testToolReporter() }), { installExtensions: false }) }).registerRoutes?.({ app });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const prompts: string[] = [];
  const providerUrl = await startStubProviderServer(t, (_count, body) => {
    prompts.push(String(body.system));
    return { status: 200, body: 'event: message_start\ndata: {"type":"message_start","message":{"id":"reply","role":"assistant","content":[],"model":"fixture","usage":{"input_tokens":1,"output_tokens":0}}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":0}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n' };
  });
  const send = (extra: Record<string, unknown>) => fetch(`${baseUrl}${BYOK_TURN_PATH}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({
    messages: [{ role: "user", content: "Design holography" }], byok: { protocol: "anthropic", apiKey: "fixture-key", model: "fixture", baseUrl: providerUrl }, ...extra,
  }) });
  const response = await send({ pluginRefIds: [installed.pluginId, "missing-plugin", installed.pluginId] });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Some selected Agent Plugins could not be loaded/);
  assert.equal(prompts[0]?.split("Preserve the unique pin guidance.").length, 3);

  const automatic = await send({ conversationId: "automatic-pin", userPrompt: "Design holography" });
  assert.equal(automatic.status, 200);
  assert.doesNotMatch(await automatic.text(), /event: error/);
  // Why: Jini delivers a fresh query's single top match in full (3665df68, owner decision 2026-10-18), so the automatic turn carries the guidance itself, not a metadata note.
  assert.match(prompts[1]!, /<<AGENT_PLUGIN pluginId="pin-guidance">>/);
  assert.match(prompts[1]!, /Preserve the unique pin guidance\./);

  // Both explicit resolver throws and automatic preflight throws remain fail-soft.
  deps.agentPluginLayout = { ...layout, forWorkspace: () => { throw new Error("fixture plugin storage unavailable"); } };
  deps.getEffective = async () => { throw new Error("fixture automatic preflight unavailable"); };
  const failed = await send({ conversationId: "failed-pin", pluginRefIds: [installed.pluginId] });
  assert.equal(failed.status, 200);
  const stream = await failed.text();
  assert.match(stream, /Some selected Agent Plugins could not be loaded/);
  assert.doesNotMatch(stream, /event: error/);
  assert.doesNotMatch(prompts[2]!, /Preserve the unique pin guidance/);
});

/** A promise the test settles by hand: every race below is ordered by these, never by a timer. */
function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

const FIXTURE_REPLY = 'event: message_start\ndata: {"type":"message_start","message":{"id":"reply","role":"assistant","content":[],"model":"fixture","usage":{"input_tokens":1,"output_tokens":0}}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":0}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n';

/** Boots the BYOK route behind a probe that sees the server-side close, counts stream starts and
 *  hands back each turn's own settlement, so a test can wait for the turn instead of a clock. */
async function bootClosableTurn(deps: ReturnType<typeof createRouteDeps>, toolSurface: ByokToolSurface, t: import("node:test").TestContext, { holdUntilClosed = false } = {}) {
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps });
  const serverClosed = deferred();
  const requestReached = deferred();
  const turnStarted = deferred<{ turn: unknown }>();
  let streamStarts = 0;
  app.use(BYOK_TURN_PATH, (_req, res, next) => {
    res.once("close", () => serverClosed.resolve());
    requestReached.resolve();
    const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => typeof res;
    res.writeHead = ((...args: unknown[]) => { streamStarts++; return writeHead(...args); }) as typeof res.writeHead;
    if (holdUntilClosed) void serverClosed.promise.then(() => next());
    else next();
  });
  const recordingApp = {
    use: app.use.bind(app),
    post: (route: string, handler: (req: express.Request, res: express.Response, next: express.NextFunction) => unknown) =>
      app.post(route, (req, res, next) => { turnStarted.resolve({ turn: handler(req, res, next) }); }),
  } as unknown as express.Express;
  createAssistantByokModule({ routeDeps: deps }, { toolSurface }).registerRoutes?.({ app: recordingApp });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  let providerCalls = 0;
  const providerUrl = await startStubProviderServer(t, () => { providerCalls++; return { status: 200, body: FIXTURE_REPLY }; });
  return { baseUrl, cookie, providerUrl, serverClosed: serverClosed.promise, requestReached: requestReached.promise, turnStarted: turnStarted.promise, streamStarts: () => streamStarts, providerCalls: () => providerCalls };
}

test("closing during federation startup never starts a paid BYOK call", async t => {
  const deps = createRouteDeps();
  const surface = createByokToolSurface(deps, { installExtensions: false });
  const federationEntered = deferred();
  const federationGate = deferred();
  let federationCalls = 0;
  const toolSurface: ByokToolSurface = { ...surface, awaitFederation: async (required, optional) => {
    federationCalls++;
    federationEntered.resolve();
    await federationGate.promise;
    return surface.awaitFederation(required, optional);
  } };
  const probe = await bootClosableTurn(deps, toolSurface, t);
  const client = new AbortController();
  const response = fetch(`${probe.baseUrl}${BYOK_TURN_PATH}`, { method: "POST", signal: client.signal, headers: { cookie: probe.cookie, "content-type": "application/json" }, body: JSON.stringify({
    messages: [{ role: "user", content: "Hello" }], byok: { protocol: "anthropic", apiKey: "fixture-key", model: "fixture", baseUrl: probe.providerUrl },
  }) });
  await federationEntered.promise;
  client.abort();
  await assert.rejects(response, { name: "AbortError" });
  await probe.serverClosed;
  federationGate.resolve();
  const { turn } = await probe.turnStarted;
  assert.ok(turn instanceof Promise, "the route hands back the turn it started");
  await turn;
  assert.equal(federationCalls, 1, "the shared federation wait still ran for this turn");
  assert.equal(probe.providerCalls(), 0, "a disconnected user must not leave paid work running");
  assert.equal(probe.streamStarts(), 0);
});

test("closing during credential resolution never starts a BYOK stream", async t => {
  const deps = createRouteDeps();
  const storedRepo = deps.adminExecutionCredentialRepo;
  const lookupEntered = deferred<{ workspaceId: string; principalId: string }>();
  const lookupGate = deferred();
  // The credential read goes through the repo's vault singleton lookup; hold exactly that call.
  const storedVault = (storedRepo as unknown as { vault: { findOne: (input: { workspaceId: string; principalId: string }, options?: unknown) => Promise<unknown> } }).vault;
  const heldVault = Object.create(storedVault, { findOne: { value: async (input: { workspaceId: string; principalId: string }, options?: unknown) => {
    lookupEntered.resolve(input);
    await lookupGate.promise;
    return storedVault.findOne(input, options);
  } } });
  deps.adminExecutionCredentialRepo = Object.create(storedRepo, { vault: { value: heldVault } });
  const probe = await bootClosableTurn(deps, createByokToolSurface(deps, { installExtensions: false }), t);
  const client = new AbortController();
  const response = fetch(`${probe.baseUrl}${BYOK_TURN_PATH}`, { method: "POST", signal: client.signal, headers: { cookie: probe.cookie, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }) });
  const scope = await lookupEntered.promise;
  // The saved key becomes usable only now, so the turn would have a provider to call once released.
  await setExecutionCredential({ repo: storedRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
    { workspaceId: scope.workspaceId, principalId: scope.principalId, apiKey: "fixture-key", protocol: "anthropic", model: "fixture", baseUrl: probe.providerUrl });
  client.abort();
  await assert.rejects(response, { name: "AbortError" });
  await probe.serverClosed;
  lookupGate.resolve();
  const { turn } = await probe.turnStarted;
  assert.ok(turn instanceof Promise, "the route hands back the turn it started");
  await turn;
  assert.equal(probe.providerCalls(), 0, "a disconnected user must not leave paid work running");
  assert.equal(probe.streamStarts(), 0);
});

test("a response closed before the turn begins never starts a paid BYOK call", async t => {
  const deps = createRouteDeps();
  const probe = await bootClosableTurn(deps, createByokToolSurface(deps, { installExtensions: false }), t, { holdUntilClosed: true });
  const client = new AbortController();
  const response = fetch(`${probe.baseUrl}${BYOK_TURN_PATH}`, { method: "POST", signal: client.signal, headers: { cookie: probe.cookie, "content-type": "application/json" }, body: JSON.stringify({
    messages: [{ role: "user", content: "Hello" }], byok: { protocol: "anthropic", apiKey: "fixture-key", model: "fixture", baseUrl: probe.providerUrl },
  }) });
  await probe.requestReached;
  client.abort();
  await assert.rejects(response, { name: "AbortError" });
  // The probe releases the request to the route only after the close, which emits no second `close`.
  const { turn } = await probe.turnStarted;
  assert.ok(turn instanceof Promise, "the route hands back the turn it started");
  await turn;
  assert.equal(probe.providerCalls(), 0, "a disconnected user must not leave paid work running");
  assert.equal(probe.streamStarts(), 0);
});
