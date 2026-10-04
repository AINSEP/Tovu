
// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "../../activation-effects.js";
const { readAgentPluginActivations, setAgentPluginActivation } = agentPluginActivations;
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/platform/http/index";
import type { MailAdapterModule, MailerPort, MailerSendOptions, OutboundEmail } from "#src/platform/mail/index";

import { forceRemove } from "../fixtures/force-remove.js";

import { packAgentPluginDirectory } from "../../bundled-source-archive.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { MAIL_ADAPTERS_FILENAME, loadMailAdapterRegistry, loadMailAdapterRegistryFromSource } from "../../mail-adapter-registry.js";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { parseAgentPluginMcpConfig } from "../../mcp-metadata.js";
import { seedBundledAgentPlugins } from "../../seed-bundled.js";

/**
 * @file The bundled `resend` Agent Plugin: a valid package, seeded ENABLED so a site that already
 * sends through Resend keeps sending after upgrade, and its adapter behaving exactly as the core
 * `HttpApiMailerAdapter` it replaced (these cases are that adapter's own unit tests, moved). Every
 * send goes to a fake `HttpClientPort`, never the network.
 */

const CONTENT_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
const PACKAGE_ROOT = path.join(CONTENT_ROOT, "resend");
const WORKSPACE_ID = "workspace-local";

async function readPackageJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(PACKAGE_ROOT, relativePath), "utf8"));
}

test("plugin.json parses under the Agent Plugins v1.0.0 validator with no warnings", async () => {
  const parsed = parseAgentPluginManifest({ value: await readPackageJson("plugin.json") });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "resend");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
});

test("mcp.json declares ZERO servers — the adapter runs in-process through the mail-adapter registry", async () => {
  const parsed = parseAgentPluginMcpConfig({ value: await readPackageJson("mcp.json") });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok ? parsed.config.serverIds : ["unreachable"], []);
});

test("the credential label is byte-identical to the one sites already saved (no re-entry on upgrade)", async () => {
  const registry = await loadMailAdapterRegistryFromSource({ pluginId: "resend", packageRoot: PACKAGE_ROOT });
  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(
    registry.list().map((adapter) => [adapter.descriptor.id, adapter.descriptor.credentialLabel]),
    [["resend", "Tovu Mail — Resend API"]],
  );
});

test("the package packs through the real packer with its descriptor, module and skill", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);
  for (const file of ["plugin.json", "mcp.json", MAIL_ADAPTERS_FILENAME, "adapters/resend.mjs", "skills/resend/SKILL.md"]) {
    assert.ok(packed.files.includes(file), `${file} must survive packing`);
  }
});

async function withAgentPluginsDir<T>(fn: (layout: ReturnType<typeof resolveAgentPluginLayout>) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-resend-plugin-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn(resolveAgentPluginLayout());
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

test("seeded by the real seeder, resend is ENABLED with no user action and the registry loads it from the installed digest", async () => {
  await withAgentPluginsDir(async (layout) => {
    const seeded = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal(seeded.outcomes.find((outcome) => outcome.pluginId === "resend")?.status, "seeded");

    const activations = await readAgentPluginActivations({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root });
    assert.equal(activations.plugins.resend?.enabled, true, "a site configured for Resend must keep sending with zero user action");

    const registry = await loadMailAdapterRegistry({ workspaceId: WORKSPACE_ID });
    assert.deepEqual(registry.refusals, []);
    assert.equal(registry.list()[0]?.pluginId, "resend");
    assert.equal(typeof registry.list()[0]?.module.create, "function");
  });
});

test("an operator who switched resend off stays switched off across boots, and the registry then has no adapter", async () => {
  await withAgentPluginsDir(async (layout) => {
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "resend", enabled: false, actor: "test:operator" });

    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal((await readAgentPluginActivations({ workspaceRoot: workspaceRoot })).plugins.resend?.enabled, false);
    assert.deepEqual((await loadMailAdapterRegistry({ workspaceId: WORKSPACE_ID })).list(), []);
  });
});

// ---------------------------------------------------------------------------------------------
// The adapter itself (moved from `platform/mail/adapters/__tests__/http-api.resend.unit.test.ts`).
// ---------------------------------------------------------------------------------------------

type ScriptedResponse = HttpResponse | (() => HttpResponse);

class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  private readonly responses: readonly ScriptedResponse[];
  private cursor = 0;

  constructor(responses: readonly ScriptedResponse[] = [{ status: 200, headers: {}, bodyText: '{"id":"resend-id-1"}' }]) {
    this.responses = responses;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    const entry = this.responses[Math.min(this.cursor, this.responses.length - 1)];
    this.cursor += 1;
    if (typeof entry === "function") return entry();
    return entry;
  }
}

const SEND_OPTIONS: MailerSendOptions = {
  idempotencyKey: "idem-1",
  workspaceId: "ws-1",
  sourceContext: { module: "members" },
};

function makeMessage(overrides: Partial<OutboundEmail> = {}): OutboundEmail {
  return {
    workspaceId: "ws-1",
    to: { email: "member@example.com" },
    from: { email: "no-reply@tovu.local", name: "Tovu" },
    subject: "Your sign-in link",
    text: "short body",
    ...overrides,
  };
}

let adapterModule: Promise<MailAdapterModule> | undefined;

async function makeAdapter(http: HttpClientPort, credential: { token: string; baseUrl?: string } = { token: "re_test" }): Promise<MailerPort> {
  adapterModule ??= loadMailAdapterRegistryFromSource({ pluginId: "resend", packageRoot: PACKAGE_ROOT }).then((registry) => {
    const loaded = registry.list()[0];
    assert.ok(loaded, `resend adapter did not load: ${registry.refusals.join("; ")}`);
    return loaded.module;
  });
  return (await adapterModule).create({ credential, kit: { httpClient: http } });
}

test("capabilities reports the resend driver shape", async () => {
  const adapter = await makeAdapter(new FakeHttpClient());
  assert.deepEqual(adapter.capabilities(), {
    driver: "resend",
    supportsIdempotencyKey: true,
    supportsWebhookFeedback: true,
    maxBatchSize: 1,
    supportsAttachments: true,
  });
});

test("send() POSTs to /emails with bearer auth, JSON body, and the idempotency key header", async () => {
  const http = new FakeHttpClient();
  const adapter = await makeAdapter(http, { token: "re_test_key" });
  const result = await adapter.send(makeMessage(), SEND_OPTIONS);

  assert.equal(http.calls.length, 1);
  const req = http.calls[0]!;
  assert.equal(req.method, "POST");
  assert.equal(req.url, "https://api.resend.com/emails");
  assert.equal(req.headers.Authorization, "Bearer re_test_key");
  assert.equal(req.headers["content-type"], "application/json");
  assert.equal(req.headers["Idempotency-Key"], "idem-1");
  assert.equal(req.timeoutMs, 10_000);

  const body = JSON.parse(req.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.from, "Tovu <no-reply@tovu.local>");
  assert.equal(body.to, "member@example.com");
  assert.equal(body.subject, "Your sign-in link");
  assert.equal(body.text, "short body");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.providerMessageId, "resend-id-1");
});

test("send() uses the saved credential's baseUrl", async () => {
  const http = new FakeHttpClient();
  const adapter = await makeAdapter(http, { token: "re_test", baseUrl: "https://mail.example.internal" });
  await adapter.send(makeMessage(), SEND_OPTIONS);
  assert.equal(http.calls[0]!.url, "https://mail.example.internal/emails");
});

test("send() forwards attachments using Resend's snake_case field shape", async () => {
  const http = new FakeHttpClient();
  const adapter = await makeAdapter(http);
  await adapter.send(makeMessage({ attachments: [{ filename: "invoice.pdf", contentType: "application/pdf", contentBase64: "QUFB" }] }), SEND_OPTIONS);
  const body = JSON.parse(http.calls[0]!.body ?? "{}") as { attachments?: unknown[] };
  assert.deepEqual(body.attachments, [{ filename: "invoice.pdf", content: "QUFB", content_type: "application/pdf" }]);
});

test("send() maps a 422 validation_error to a non-retryable failure with the provider's error name", async () => {
  const http = new FakeHttpClient([
    { status: 422, headers: {}, bodyText: JSON.stringify({ statusCode: 422, name: "validation_error", message: "Invalid `to` field" }) },
  ]);
  const result = await (await makeAdapter(http)).send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result, { ok: false, retryable: false, errorCode: "validation_error", message: "Invalid `to` field" });
});

test("send() maps a 429 rate_limit_exceeded to a retryable failure", async () => {
  const http = new FakeHttpClient([
    { status: 429, headers: {}, bodyText: JSON.stringify({ statusCode: 429, name: "rate_limit_exceeded", message: "Too many requests" }) },
  ]);
  const result = await (await makeAdapter(http)).send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result, { ok: false, retryable: true, errorCode: "rate_limit_exceeded", message: "Too many requests" });
});

test("send() maps a 500 to a retryable failure, and a 401 to a non-retryable one", async () => {
  const http500 = new FakeHttpClient([{ status: 500, headers: {}, bodyText: '{"name":"application_error","message":"oops"}' }]);
  const result500 = await (await makeAdapter(http500)).send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result500, { ok: false, retryable: true, errorCode: "application_error", message: "oops" });

  const http401 = new FakeHttpClient([{ status: 401, headers: {}, bodyText: '{"name":"missing_api_key","message":"no key"}' }]);
  const result401 = await (await makeAdapter(http401, { token: "" })).send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result401, { ok: false, retryable: false, errorCode: "missing_api_key", message: "no key" });
});

test("send() handles a non-JSON error body without throwing", async () => {
  const http = new FakeHttpClient([{ status: 503, headers: {}, bodyText: "<html>Service Unavailable</html>" }]);
  const result = await (await makeAdapter(http)).send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result, { ok: false, retryable: true, errorCode: "HTTP_503", message: "<html>Service Unavailable</html>" });
});

for (const bodyText of ["", "<html>Accepted</html>"]) {
  test(`send() preserves HTTP acceptance for an undecodable success body ${JSON.stringify(bodyText)}`, async () => {
    const http = new FakeHttpClient([{ status: 202, headers: {}, bodyText }]);
    const result = await (await makeAdapter(http)).send(makeMessage(), SEND_OPTIONS);
    assert.equal(result.ok, true);
    if (!result.ok) assert.fail(JSON.stringify(result));
    assert.equal(result.providerMessageId, "idem-1");
    assert.match(result.acceptedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(http.calls.length, 1);
  });
}

test("sendBatch() keeps every per-message result after empty and malformed successful replies", async () => {
  const http = new FakeHttpClient([
    { status: 204, headers: {}, bodyText: "" },
    { status: 200, headers: {}, bodyText: "not JSON" },
    { status: 422, headers: {}, bodyText: '{"name":"validation_error","message":"bad address"}' },
    { status: 200, headers: {}, bodyText: '{"id":"last-accepted"}' },
  ]);
  const results = await (await makeAdapter(http)).sendBatch(
    ["one", "two", "three", "four"].map((name) => makeMessage({ to: { email: `${name}@example.com` } })), SEND_OPTIONS,
  );
  assert.deepEqual(results.map((result) => result.ok ? result.providerMessageId : result.errorCode),
    ["idem-1:0", "idem-1:1", "validation_error", "last-accepted"]);
  assert.deepEqual(http.calls.map((call) => JSON.parse(call.body!).to),
    ["one@example.com", "two@example.com", "three@example.com", "four@example.com"]);
});

test("send() maps a thrown transport error (network failure/EgressPolicy refusal) to a retryable TRANSPORT_ERROR, never throws", async () => {
  const http = new FakeHttpClient([
    () => {
      throw new Error("egress to 'api.resend.com' rejected: resolved address is private");
    },
  ]);
  const result = await (await makeAdapter(http)).send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result, {
    ok: false,
    retryable: true,
    errorCode: "TRANSPORT_ERROR",
    message: "egress to 'api.resend.com' rejected: resolved address is private",
  });
});

test("send() handles a non-Error thrown during transport", async () => {
  const http = new FakeHttpClient([
    () => {
      throw "string exception";
    },
  ]);
  const result = await (await makeAdapter(http)).send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(result, { ok: false, retryable: true, errorCode: "TRANSPORT_ERROR", message: "string exception" });
});

test("sendBatch() loops send() once per message, preserving result[i] <-> messages[i] ordering under partial failure", async () => {
  const http = new FakeHttpClient([
    { status: 200, headers: {}, bodyText: '{"id":"ok-1"}' },
    { status: 422, headers: {}, bodyText: '{"name":"validation_error","message":"bad address"}' },
    { status: 200, headers: {}, bodyText: '{"id":"ok-3"}' },
  ]);
  const messages = [
    makeMessage({ to: { email: "one@example.com" } }),
    makeMessage({ to: { email: "two@example.com" } }),
    makeMessage({ to: { email: "three@example.com" } }),
  ];
  const results = await (await makeAdapter(http)).sendBatch(messages, SEND_OPTIONS);

  assert.deepEqual(
    results.map((result) => (result.ok ? result.providerMessageId : result.errorCode)),
    ["ok-1", "validation_error", "ok-3"],
  );
  assert.deepEqual(
    http.calls.map((call) => (JSON.parse(call.body ?? "{}") as { to: string }).to),
    ["one@example.com", "two@example.com", "three@example.com"],
  );
});

test("sendBatch() gives each message its own Idempotency-Key, deterministically derived so a redelivery of the same batch reproduces the same keys", async () => {
  const messages = [makeMessage(), makeMessage(), makeMessage()];
  const http = new FakeHttpClient();
  await (await makeAdapter(http)).sendBatch(messages, { ...SEND_OPTIONS, idempotencyKey: "batch-1" });
  const keys = http.calls.map((call) => call.headers["Idempotency-Key"]);
  assert.deepEqual(keys, ["batch-1:0", "batch-1:1", "batch-1:2"]);

  const httpRetry = new FakeHttpClient();
  await (await makeAdapter(httpRetry)).sendBatch(messages, { ...SEND_OPTIONS, idempotencyKey: "batch-1" });
  assert.deepEqual(httpRetry.calls.map((call) => call.headers["Idempotency-Key"]), keys);
});

test("send() forwards replyTo, html, and custom headers when provided", async () => {
  const http = new FakeHttpClient();
  await (await makeAdapter(http)).send(
    makeMessage({ replyTo: { email: "support@example.com", name: "Support" }, html: "<p>Hello</p>", headers: { "X-Custom": "val" } }),
    SEND_OPTIONS,
  );
  const body = JSON.parse(http.calls[0]!.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.reply_to, "Support <support@example.com>");
  assert.equal(body.html, "<p>Hello</p>");
  assert.deepEqual(body.headers, { "X-Custom": "val" });
});

test("send() falls back to opts.idempotencyKey if response JSON does not have string id", async () => {
  const http = new FakeHttpClient([{ status: 200, headers: {}, bodyText: "{}" }]);
  const res = await (await makeAdapter(http)).send(makeMessage(), { ...SEND_OPTIONS, idempotencyKey: "fallback-key" });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.providerMessageId, "fallback-key");
});

test("send() handles 409 conflict as retryable, and empty bodyText falls back to HTTP status message", async () => {
  const http409 = new FakeHttpClient([{ status: 409, headers: {}, bodyText: "" }]);
  const res = await (await makeAdapter(http409)).send(makeMessage(), SEND_OPTIONS);
  assert.deepEqual(res, { ok: false, retryable: true, errorCode: "HTTP_409", message: "Resend responded with HTTP 409" });
});

test("send() uses timeoutMs from options when specified", async () => {
  const http = new FakeHttpClient();
  await (await makeAdapter(http)).send(makeMessage(), { ...SEND_OPTIONS, timeoutMs: 2500 });
  assert.equal(http.calls[0]!.timeoutMs, 2500);
});
