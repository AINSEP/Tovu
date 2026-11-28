import assert from "node:assert/strict";
import test from "node:test";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { contentKernel } from "#src/platform/db/content-kernel";
import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { composeEventsOrigin } from "../events-origin.js";

/**
 * @file The origin `composeEventsOrigin` registers at boot, read back through the composed origin registry: a
 * configured public URL, else (local mode) a dev-capability seed from the listener origin, else (production with
 * nothing configured) no origin at all.
 */

const ENV = ["TOVU_PUBLIC_URL", "TOVU_RUNTIME_MODE", "TOVU_SITE_LISTENER_ORIGIN", "PORT"] as const;

function boot(t: test.TestContext, env: Partial<Record<(typeof ENV)[number], string>>) {
  const previous = Object.fromEntries(ENV.map(key => [key, process.env[key]]));
  for (const key of ENV) if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
  const db = openContentDb(":memory:");
  t.after(() => {
    closeSqliteConnection({ source: db });
    for (const key of ENV) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  });
  const warnings = t.mock.method(console, "warn", () => undefined);
  const composed = composeEventsOrigin({ kernel: contentKernel({ store: db }), clock: { nowMs: () => 0, nowIso: () => "2026-11-20T00:00:00.000Z" }, workspaceId: "ws-o", activeTraceparent: () => undefined });
  const origin = async () => { await composed.originReady; const { scheme, host, port, source } = await composed.originRegistry.canonicalOrigin({ workspaceId: "ws-o" }); return { scheme, host, port, source }; };
  return { composed, origin, warnings };
}

test("a configured public URL is registered as the workspace's origin", async t => {
  const { origin } = boot(t, { TOVU_PUBLIC_URL: "https://shop.example.org", TOVU_RUNTIME_MODE: "production" });
  const registered = await origin();
  assert.deepEqual([registered.scheme, registered.host], ["https", "shop.example.org"]);
  assert.notEqual(registered.source, "dev-capability");
});

test("in local mode with nothing configured, an https listener without a port seeds localhost on 443", async t => {
  const { origin } = boot(t, { TOVU_SITE_LISTENER_ORIGIN: "https://localhost" });
  assert.deepEqual(await origin(), { scheme: "https", host: "localhost", port: 443, source: "dev-capability" });
});

test("in local mode with nothing configured, an http listener without a port seeds localhost on 80, and an explicit port is kept", async t => {
  assert.deepEqual(await boot(t, { TOVU_SITE_LISTENER_ORIGIN: "http://localhost" }).origin(), { scheme: "http", host: "localhost", port: 80, source: "dev-capability" });
  assert.deepEqual(await boot(t, { TOVU_SITE_LISTENER_ORIGIN: "http://localhost:4123" }).origin(), { scheme: "http", host: "localhost", port: 4123, source: "dev-capability" });
});

test("in production with nothing configured, boot registers no origin and warns", async t => {
  const { composed, warnings } = boot(t, { TOVU_RUNTIME_MODE: "production" });
  assert.equal(await composed.originReady, undefined);
  await assert.rejects(composed.originRegistry.canonicalOrigin({ workspaceId: "ws-o" }), /no verified origin registered for workspace 'ws-o'/);
  assert.equal(warnings.mock.callCount(), 1);
});
