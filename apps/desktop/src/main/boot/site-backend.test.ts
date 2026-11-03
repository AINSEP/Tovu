/**
 * @file Behaviour of the shared site-open steps (`site-backend.ts`) through their ports: spawn vs
 * attach, the race-lost fallback, crash-registry bookkeeping, session seeding and the desktop-tools
 * announce. Replaces the source-text and cut-out-eval checks in `main-auth-wiring.test.ts`,
 * `main-mcp-announce-wiring.test.ts` and `main-theme-preview-wiring.test.ts` for these functions.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createSiteBackend, type SiteBackendPorts, type SiteBackendServer } from "./site-backend.ts";

interface FakeServer extends SiteBackendServer { label: string; exitListeners: (() => void)[] }

function fakeServer(overrides: Partial<FakeServer> = {}): FakeServer {
  const exitListeners: (() => void)[] = [];
  return {
    label: "spawned", adminUrl: "http://127.0.0.1:4100/admin/", port: 4100, workspaceId: "ws-own", pid: 77,
    bootToken: "token-1", exitListeners, onExit: (listener) => { exitListeners.push(listener); }, ...overrides,
  };
}

function harness(overrides: Partial<SiteBackendPorts<FakeServer>> = {}) {
  const calls: string[] = [];
  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];
  const starts: unknown[] = [];
  const rows: unknown[] = [];
  const arms: unknown[] = [];
  const openSites = new Map<string, { server: FakeServer; siteDir?: string }>();
  let bridgeClosed = 0;
  const spawned = fakeServer();
  const ports: SiteBackendPorts<FakeServer> = {
    partitionFor: ({ siteDir }) => `persist:${siteDir}`,
    attachRunning: () => null,
    rememberOpen: ({ siteDir }) => { calls.push(`remember:${siteDir}`); },
    resolveAdminDevProxyUrl: async () => { calls.push("proxy"); return "https://localhost:5173"; },
    startCaptureBridge: async () => { calls.push("bridge"); return { env: { TOVU_CAPTURE: "bridge", TOVU_RUNNING_APP: "Bridge" }, close: () => { bridgeClosed++; } }; },
    startServer: async (input) => { calls.push("start"); starts.push(input); return spawned; },
    baseToolchainEnv: { TOVU_NODE_TOOLCHAIN_DIR: "/tc", TOVU_CAPTURE: "toolchain" },
    recordSiteOpened: (input) => { calls.push("record"); rows.push(input); },
    now: () => 1234,
    armOwnerSignIn: (input) => { calls.push("arm"); arms.push(input); },
    ensureSession: async ({ redeem }) => { calls.push("ensure"); return redeem(); },
    redeemBootSession: async () => { calls.push("redeem"); return { ok: true }; },
    log: (message) => logs.push(message),
    warn: (message) => warns.push(message),
    error: (message) => errors.push(message),
    openSites: { get: (dir) => openSites.get(dir), set: (dir, entry) => openSites.set(dir, entry) },
    schedulePreview: ({ siteDir }) => { calls.push(`preview:${siteDir}`); },
    syncThemePreview: ({ siteDir }) => { calls.push(`theme:${siteDir}`); },
    ...overrides,
  };
  return {
    backend: createSiteBackend({ ports }), ports, calls, logs, warns, errors, starts, rows, arms,
    openSites, spawned, bridgeClosed: () => bridgeClosed,
  };
}

const ctx = { cliMode: "source" as const, registryPath: "/user-data/registry" };

test("a spawned site: boot token always emitted, toolchain env merged, then record and session in order", async () => {
  const h = harness();
  const result = await h.backend.startSiteBackend({ siteDir: "/sites/a", ctx }, { port: 4100 });
  assert.equal(result.server, h.spawned);
  assert.equal(result.partition, "persist:/sites/a");
  assert.deepEqual(h.starts, [{
    siteDir: "/sites/a", cliMode: "source", port: 4100, emitBootToken: true, adminDevProxyUrl: "https://localhost:5173",
    // The capture bridge's keys win over the toolchain's; TOVU_RUNNING_APP is always "Desktop".
    nodeToolchainEnv: { TOVU_NODE_TOOLCHAIN_DIR: "/tc", TOVU_CAPTURE: "bridge", TOVU_RUNNING_APP: "Desktop" },
  }]);
  assert.deepEqual(h.calls, ["proxy", "bridge", "start", "remember:/sites/a", "record", "ensure", "redeem"]);
  assert.deepEqual(h.rows, [{ registryPath: "/user-data/registry", row: { siteDir: "/sites/a", port: 4100, workspaceId: "ws-own", pid: 77, updatedAt: 1234 } }]);
  assert.deepEqual(h.arms, [], "no capability, no owner sign-in arm");
});

test("an unpinned start passes port undefined and a missing toolchain env still yields the Desktop marker", async () => {
  const h = harness({ baseToolchainEnv: undefined, startCaptureBridge: async () => ({ env: {}, close: () => {} }) });
  await h.backend.startSiteBackend({ siteDir: "/sites/a", ctx });
  const start = h.starts[0] as { port: unknown; nodeToolchainEnv: unknown };
  assert.equal(start.port, undefined);
  assert.deepEqual(start.nodeToolchainEnv, { TOVU_RUNNING_APP: "Desktop" });
});

test("the capture bridge closes when the spawned child exits, not before", async () => {
  const h = harness();
  await h.backend.startSiteBackend({ siteDir: "/sites/a", ctx });
  assert.equal(h.bridgeClosed(), 0);
  assert.equal(h.spawned.exitListeners.length, 1);
  h.spawned.exitListeners[0]!();
  assert.equal(h.bridgeClosed(), 1);
});

test("an owner sign-in capability arms the partition's session before the session is ensured", async () => {
  const h = harness();
  h.spawned.ownerSignInCapability = "a".repeat(64);
  await h.backend.startSiteBackend({ siteDir: "/sites/a", ctx });
  assert.deepEqual(h.arms, [{ partition: "persist:/sites/a", adminUrl: h.spawned.adminUrl, capability: "a".repeat(64) }]);
  assert.ok(h.calls.indexOf("arm") < h.calls.indexOf("ensure"));
});

test("a site another app already runs is attached: no spawn, no registry row, no session work", async () => {
  const external = fakeServer({ label: "external" });
  const h = harness({ attachRunning: () => external });
  const result = await h.backend.startSiteBackend({ siteDir: "/sites/dev", ctx });
  assert.equal(result.server, external);
  assert.equal(result.partition, "persist:/sites/dev");
  assert.deepEqual(h.calls, ["remember:/sites/dev"]);
});

test("a site opened after losing the spawn race still appears in Open Recent", async () => {
  const winner = fakeServer({ label: "winner" });
  let attachCalls = 0;
  const h = harness({
    attachRunning: () => (attachCalls++ === 0 ? null : winner),
    startServer: async () => { throw new Error("database claimed"); },
  });
  const result = await h.backend.startSiteBackend({ siteDir: "/sites/a", ctx });
  assert.equal(result.server, winner);
  assert.equal(h.bridgeClosed(), 1, "the unused capture bridge is closed");
  assert.deepEqual(h.calls, ["proxy", "bridge", "remember:/sites/a"], "remember the open without claiming or authenticating a foreign child");
});

test("a failed spawn with no winner to attach closes the bridge and rethrows the spawn error", async () => {
  const h = harness({ startServer: async () => { throw new Error("SITE_NEWER_THAN_RUNTIME"); } });
  await assert.rejects(h.backend.startSiteBackend({ siteDir: "/sites/a", ctx }), /SITE_NEWER_THAN_RUNTIME/);
  assert.equal(h.bridgeClosed(), 1);
  assert.deepEqual(h.rows, []);
});

test("authenticate: a child with no boot token logs and never redeems", async () => {
  for (const bootToken of [null, ""]) {
    const h = harness({ redeemBootSession: async () => assert.fail("must not redeem") });
    assert.equal(await h.backend.authenticateSiteSession({ siteDir: "/sites/a", server: fakeServer({ bootToken }), partition: "p" }), false);
    assert.match(h.logs[0]!, /\/sites\/a reported no boot token/);
  }
});

test("authenticate: redeems this site's token on its own partition and admin URL", async () => {
  const seen: unknown[] = [];
  const h = harness({ redeemBootSession: async (input) => { seen.push(input); return { ok: true }; } });
  assert.equal(await h.backend.authenticateSiteSession({ siteDir: "/sites/a", server: fakeServer(), partition: "persist:a" }), true);
  assert.deepEqual(seen, [{ partition: "persist:a", adminUrl: "http://127.0.0.1:4100/admin/", bootToken: "token-1" }]);
  assert.deepEqual(h.logs, []);
});

test("authenticate: a refused redeem logs its reason and reports false", async () => {
  const h = harness({ redeemBootSession: async () => ({ ok: false, reason: "token spent" }) });
  assert.equal(await h.backend.authenticateSiteSession({ siteDir: "/sites/a", server: fakeServer(), partition: "p" }), false);
  assert.match(h.logs[0]!, /did not apply to \/sites\/a \(token spent\)/);
});

test("authenticate: a rejecting redeem (non-loopback wiring bug) is loud on error and reports false", async () => {
  const h = harness({ redeemBootSession: async () => { throw new Error("not a loopback origin"); } });
  assert.equal(await h.backend.authenticateSiteSession({ siteDir: "/sites/a", server: fakeServer(), partition: "p" }), false);
  assert.deepEqual(h.errors, ["tovu desktop: desktop sign-in refused for /sites/a: not a loopback origin"]);
});

test("a start whose session is still valid never redeems a boot token", async () => {
  const h = harness({ ensureSession: async () => ({ authenticated: true, redeemed: false }) });
  await h.backend.startSiteBackend({ siteDir: "/sites/a", ctx });
  assert.equal(h.calls.includes("redeem"), false);
});

test("only freshly spawned servers receive the main's automatic capability recovery", async () => {
  const delivered: FakeServer[] = [];
  const h = harness({ connectDesktopMcp: server => { delivered.push(server); } });
  await h.backend.startSiteBackend({ siteDir: "/sites/a", ctx });
  assert.deepEqual(delivered, [h.spawned]);
  const attached = harness({ attachRunning: () => fakeServer(), connectDesktopMcp: () => assert.fail("foreign main must retain ownership") });
  await attached.backend.startSiteBackend({ siteDir: "/sites/b", ctx });
});

test("openSiteServer: a site already open returns its server without any start", async () => {
  const live = fakeServer({ label: "live" });
  const h = harness({ resolveAdminDevProxyUrl: async () => assert.fail("must not start") });
  h.openSites.set("/sites/a", { server: live });
  assert.equal(await h.backend.openSiteServer({ siteDir: "/sites/a", ctx }), live);
  assert.deepEqual(h.calls, []);
});

test("openSiteServer: a new site is published to openSites, then its previews are scheduled", async () => {
  const h = harness();
  const server = await h.backend.openSiteServer({ siteDir: "/sites/b", ctx }, { port: 4200 });
  assert.equal(server, h.spawned);
  assert.deepEqual(h.openSites.get("/sites/b"), { server: h.spawned, siteDir: "/sites/b" });
  assert.equal((h.starts[0] as { port: number }).port, 4200);
  assert.deepEqual(h.calls.slice(-2), ["preview:/sites/b", "theme:/sites/b"]);
});

test("openSiteServer: a failed start publishes nothing and schedules no preview", async () => {
  const h = harness({ startServer: async () => { throw new Error("boom"); } });
  await assert.rejects(h.backend.openSiteServer({ siteDir: "/sites/c", ctx }), /boom/);
  assert.equal(h.openSites.has("/sites/c"), false);
  assert.equal(h.calls.some((call) => call.startsWith("preview:")), false);
});

test("spawn receives runtime capability without registration or launcher", async () => {
  const capabilityEnv = { TOVU_DESKTOP_MCP_URL: "http://127.0.0.1:4199/mcp", TOVU_DESKTOP_MCP_TOKEN: "a".repeat(64) };
  const h = harness({ desktopMcpEnv: async () => capabilityEnv,
  });
  await h.backend.startSiteBackend({ siteDir: "/sites/a", ctx });
  assert.deepEqual((h.starts[0] as { desktopMcpEnv: unknown }).desktopMcpEnv, capabilityEnv);
});

test("attached server retains its spawning instance", async () => {
  const owner = fakeServer({ label: "another-main" });
  const h = harness({ attachRunning: () => owner,
    desktopMcpEnv: async () => assert.fail("attaching must not replace the spawning main's capability"),
  });
  assert.equal((await h.backend.startSiteBackend({ siteDir: "/sites/a", ctx })).server, owner);
  assert.deepEqual(h.starts, []);
});

test("listener failure leaves site hosting available without falling back to a launcher", async () => {
  const h = harness({ desktopMcpEnv: async () => { throw new Error("bind failed"); },
  });
  assert.equal((await h.backend.startSiteBackend({ siteDir: "/sites/a", ctx })).server, h.spawned);
  assert.equal(h.warns.length, 1);
  assert.match(h.warns[0]!, /desktop tools.*retry/i);
});
