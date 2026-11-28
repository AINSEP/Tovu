import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { InMemorySettingsRepo } from "@jini-ai/core/settings";
import { createAgentDaemonCoreDeps } from "../agent-daemon-core-deps.js";
import type { ImportSiteDbDriver, SiteDbClient, SiteDbDrivers } from "#src/platform/db/client/open-site-db-client";

function fixture() {
  const calls: { operation: string; input: unknown }[] = [];
  const snapshot = { workspaceId: "ws", ownerPrincipalId: "owner", siteBinding: { dir: tmpdir(), name: "site" },
    siteStoragePaths: { contentDbPath: ":memory:", mediaUploadsDir: tmpdir(), chatAttachmentsDir: tmpdir() },
    traceCapture: "full", traceEnabled: true };
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { operation: string; input: unknown };
    calls.push(body);
    if (body.operation === "bootstrap") return Response.json({ value: snapshot });
    if (body.operation === "getEffective") return Response.json({ value: { value: "fresh instructions", sourceLayer: "workspace" } });
    return Response.json({ value: null });
  };
  return { calls, snapshot, fetcher, env: { TOVU_DB: "memory", TOVU_SITE_LISTENER_ORIGIN: "http://127.0.0.1:1234" } };
}

test("memory daemon composition does not build site route dependencies", async () => {
  const f = fixture();
  const deps = await createAgentDaemonCoreDeps({ env: f.env, token: "private" }, { fetch: f.fetcher,
    openClient: async () => assert.fail("memory must never open a database client") });
  try {
    assert.equal(deps.workspaceId, "ws");
    assert.equal(await deps.ownerPrincipalId, "owner");
    assert.ok(deps.settingsRepo instanceof InMemorySettingsRepo);
    for (const field of ["outbox", "bus", "pluginRuntime", "onPluginEnabled", "mediaRepo", "legacyPublishCredentialsReady"]) assert.equal(field in deps, false, field);
    await deps.agentSessions.setSessionId({ conversationId: "chat", agentId: "codex", sessionId: "session" });
    assert.equal(await deps.agentSessions.getSessionId({ conversationId: "chat", agentId: "codex" }), "session");
    assert.equal(await deps.agentSessions.getSessionId({ conversationId: "another", agentId: "codex" }), null);
    const key = { conversationId: "chat", principalId: "owner", connectionId: "native:ws", toolName: "page.click", fingerprint: "v1" };
    await deps.conversationToolApprovals.grant({ key: key, grantedAt: "2026-11-03" });
    assert.equal(await deps.conversationToolApprovals.has(key), true);
    assert.equal(await deps.conversationToolApprovals.has({ ...key, conversationId: "another" }), false);
    assert.equal((await deps.getEffective({ deps: { repo: deps.settingsRepo }, namespace: "core.instructions", key: "custom", scopeContext: { workspaceId: "ws" } }))?.value, "fresh instructions");
    await deps.chatRunLedger.durable.find({ runId: "accepted-at-site" }, {});
    assert.ok(f.calls.some(call => call.operation === "find"), "attempt lookup reaches the site, never a local ledger");
    deps.tracker.error({ error: new Error("daemon failure") }, { context: { operation: "test", attributes: { process: "daemon" } } });
    await deps.tracker.capture({ name: "assistant_run_started", userId: "owner" });
    await deps.close();
    await deps.close();
    assert.ok(f.calls.some(call => call.operation === "telemetryError"));
    assert.ok(f.calls.some(call => call.operation === "telemetryCapture"));
    assert.equal(f.calls.filter(call => call.operation === 'telemetryFlush').length, 1, 'idempotent close owns the telemetry drain');
  } finally { await deps.close(); }
});

for (const kind of ["sqlite", "pglite", "postgres"] as const) {
  test(`only the configured database driver loads: ${kind}`, async () => {
    const f = fixture();
    delete (f.env as NodeJS.ProcessEnv).TOVU_DB;
    const dir = mkdtempSync(path.join(tmpdir(), "daemon-core-driver-"));
    const dbPath = path.join(dir, "content.db");
    writeFileSync(dbPath, ""); writeFileSync(path.join(dir, "chat.db"), "");
    f.snapshot.siteStoragePaths.contentDbPath = dbPath;
    const loaded: string[] = [];
    let closes = 0;
    const kernel = { lockKey: () => "fixture", dialect: kind === "sqlite" ? "sqlite" : "postgres", transport: kind === "sqlite" ? "better-sqlite3" : kind === "postgres" ? "node-postgres" : "pglite-socket", close: async () => { closes++; } };
    const drivers = { sqlite: { openSqliteFileKernel: () => kernel }, pglite: { openPgliteSocketKernel: () => kernel },
      postgres: { openPostgresKernel: () => kernel } } as unknown as SiteDbDrivers;
    const importDriver: ImportSiteDbDriver = async ({ kind: selected }) => { loaded.push(selected); return drivers[selected]; };
    const deps = await createAgentDaemonCoreDeps({ env: { ...f.env, TOVU_PG_SOCKET: "/test/socket" }, token: "private" }, {
      fetch: f.fetcher, storage: kind === "postgres" ? { kind, secretRef: { env: "TEST_DATABASE_URL" } } : { kind },
      importDriver, resolvePostgresConnectionString: async () => "postgres://test.invalid/db",
    });
    await deps.close(); await deps.close();
    assert.deepEqual(loaded, [kind]);
    assert.equal(closes, kind === "sqlite" ? 2 : 1);
    rmSync(dir, { recursive: true, force: true });
  });
}

test("a retained resource closes on composition failure and shutdown", async () => {
  const f = fixture();
  delete (f.env as NodeJS.ProcessEnv).TOVU_DB;
  let closed = 0;
  const kernel = { lockKey: () => "fixture", dialect: "sqlite", transport: "better-sqlite3" };
  const client = { content: kernel, chat: kernel, close: async () => { closed++; } } as unknown as SiteDbClient;
  await assert.rejects(createAgentDaemonCoreDeps({ env: f.env, token: "private" }, { fetch: f.fetcher,
    openClient: async () => client, onStoreOpened: () => { throw new Error("shutdown registration failed"); } }), /shutdown registration failed/);
  assert.equal(closed, 1);
});

for (const scenario of [
  { field: "TOVU_WORKSPACE", value: "another-workspace", message: "the daemon workspace does not match its site server" },
  { field: "TOVU_SITE_DIR", value: path.join(tmpdir(), "another-site"), message: "the daemon directory does not match its site server" },
] as const) {
  test(`daemon refuses a bootstrap snapshot that disagrees with ${scenario.field} before opening storage`, async () => {
    const f = fixture();
    const opened: string[] = [];
    await assert.rejects(createAgentDaemonCoreDeps({
      env: { TOVU_SITE_LISTENER_ORIGIN: f.env.TOVU_SITE_LISTENER_ORIGIN, [scenario.field]: scenario.value },
      token: "private",
    }, { fetch: f.fetcher, openClient: async () => {
      opened.push("retained database");
      throw new Error("storage should not be reached");
    } }), error => error instanceof Error && error.message.includes(scenario.message));
    assert.deepEqual(f.calls, [{ operation: "bootstrap", input: {} }]);
    assert.deepEqual(opened, []);
  });
}

test("daemon telemetry preserves event order and bounds a slow site's queue", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  const received: string[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const warning = t.mock.method(console, "warn", () => {});
  const deps = await createAgentDaemonCoreDeps({ env: f.env, token: "private" }, { fetch: async (url, init) => {
    const request = JSON.parse(String(init?.body)) as { operation: string; input: { name?: string } };
    if (request.operation === "telemetryCapture") {
      received.push(request.input.name!);
      if (received.length === 1) await held;
    }
    return f.fetcher(url, init);
  } });
  for (let index = 0; index < 130; index++) deps.tracker.capture({ name: `event-${index}`, userId: "owner" });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(received, ["event-0"], "a slow first event must not be overtaken");
  release(); await deps.close();
  assert.deepEqual(received, Array.from({ length: 128 }, (_, index) => `event-${index}`));
  assert.equal(warning.mock.callCount(), 2, "overflow must be observable");
});

test("a slow telemetry drain cannot keep the daemon database client open", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(console, "warn", () => {});
  const f = fixture(); delete (f.env as NodeJS.ProcessEnv).TOVU_DB;
  let closed = 0;
  const kernel = { lockKey: () => "fixture", dialect: "sqlite", transport: "better-sqlite3" };
  const client = { content: kernel, chat: kernel, close: async () => { closed++; } } as unknown as SiteDbClient;
  const deps = await createAgentDaemonCoreDeps({ env: f.env, token: "private" }, { openClient: async () => client, fetch: async (url, init) => {
    const { operation } = JSON.parse(String(init?.body)) as { operation: string };
    if (operation === "telemetryCapture") return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    return f.fetcher(url, init);
  } });
  deps.tracker.capture({ name: "event", userId: "owner" });
  await new Promise<void>(resolve => setImmediate(resolve));
  const closing = deps.close();
  t.mock.timers.tick(1_000);
  await closing;
  assert.equal(closed, 1);
});

test("the callback origin wins over the listener origin, a trace sink exists only when tracing is enabled, and no origin at all refuses before any request", async () => {
  for (const [env, expected, tracing] of [
    [{ TOVU_DB: "memory", TOVU_SITE_CALLBACK_ORIGIN: "http://127.0.0.1:4321", TOVU_SITE_LISTENER_ORIGIN: "http://127.0.0.1:1234" }, "http://127.0.0.1:4321/", true],
    [{ TOVU_DB: "memory", TOVU_SITE_LISTENER_ORIGIN: "http://127.0.0.1:1234" }, "http://127.0.0.1:1234/", false],
  ] as const) {
    const f = fixture(), urls: string[] = [];
    f.snapshot.traceEnabled = tracing;
    const deps = await createAgentDaemonCoreDeps({ env: { ...env }, token: "private" }, { fetch: async (url, init) => { urls.push(String(url)); return f.fetcher(url, init); } });
    try {
      assert.ok(urls.length > 0);
      assert.ok(urls.every(url => url.startsWith(expected)), `${expected}: ${urls.join(", ")}`);
      assert.equal(deps.aiTraceSink !== undefined, tracing);
    } finally { await deps.close(); }
  }
  const unreached: string[] = [];
  await assert.rejects(createAgentDaemonCoreDeps({ env: { TOVU_DB: "memory" }, token: "private" }, { fetch: async url => { unreached.push(String(url)); return Response.json({ value: null }); } }), /Invalid URL/);
  assert.deepEqual(unreached, []);
});

test("a composition failure whose cleanup also fails logs the cleanup error and rethrows the composition error", async t => {
  const f = fixture();
  delete (f.env as NodeJS.ProcessEnv).TOVU_DB;
  const kernel = { lockKey: () => "fixture", dialect: "sqlite", transport: "better-sqlite3" };
  const client = { content: kernel, chat: kernel, close: async () => { throw new RangeError("client close refused"); } } as unknown as SiteDbClient;
  const logged = t.mock.method(console, "error", () => {});
  await assert.rejects(createAgentDaemonCoreDeps({ env: f.env, token: "private" }, { fetch: f.fetcher,
    openClient: async () => client, onStoreOpened: () => { throw new Error("shutdown registration failed"); } }), /shutdown registration failed/);
  assert.equal(logged.mock.callCount(), 1);
  assert.equal(logged.mock.calls[0]!.arguments[0], "[agent-daemon] Could not close the failed composition");
  assert.match(String(logged.mock.calls[0]!.arguments[1]), /^RangeError/, "the cleanup failure, not the composition error, is described");
});

test("without an injected resolver, the database client resolves a Postgres secret reference from the daemon's env", async () => {
  const f = fixture();
  let resolver: ((input: { storage: { kind: "postgres"; secretRef: { env: string } }; siteDir: string }) => Promise<string>) | undefined;
  const env = { TOVU_SITE_LISTENER_ORIGIN: "http://127.0.0.1:1234", TEST_DAEMON_DATABASE_URL: "postgres://daemon.invalid/content" };
  const deps = await createAgentDaemonCoreDeps({ env, token: "private" }, { fetch: f.fetcher, openClient: async (input) => {
    resolver = input.resolvePostgresConnectionString;
    const kernel = { lockKey: () => "fixture", dialect: "sqlite", transport: "better-sqlite3" };
    return { content: kernel, chat: kernel, close: async () => {} } as unknown as SiteDbClient;
  } });
  try {
    assert.ok(resolver);
    assert.equal(await resolver({ storage: { kind: "postgres", secretRef: { env: "TEST_DAEMON_DATABASE_URL" } }, siteDir: tmpdir() }), "postgres://daemon.invalid/content");
    await assert.rejects(resolver({ storage: { kind: "postgres", secretRef: { env: "UNSET_DAEMON_DATABASE_URL" } }, siteDir: tmpdir() }), /UNSET_DAEMON_DATABASE_URL, which is not set/);
  } finally { await deps.close(); }
});
