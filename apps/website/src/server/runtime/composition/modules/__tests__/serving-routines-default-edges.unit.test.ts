import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { Router } from "express";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { startServingRoutines } from "../serving-routines.js";
import type { SiteStoreHooks } from "../../site-deps/store-close-hooks.js";
import type { StoreCloseRegistration } from "../../site-deps/open-store.js";

/**
 * @file The edges startServingRoutines picks itself when the host injects none: the routine log
 * (a console warning naming the event) and the parent IPC channel (the process itself, only when
 * the desktop spawned this child with an `ipc` slot).
 */

const routeDeps = { workspaceId: "ws-1", adminAssistantEnabled: true, authorize: async () => {} } as never;

function site(t: TestContext): SiteStoreHooks {
  const root = mkdtempSync(path.join(tmpdir(), "serving-routines-edges-"));
  const drains: Array<() => Promise<void>> = [];
  const registrations: StoreCloseRegistration[] = [];
  t.after(async () => { for (const drain of drains) await drain(); for (const registration of registrations) await (await registration)(); rmSync(root, { recursive: true, force: true }); });
  return { dbPath: path.join(root, "content.db"), beforeStoreClose: ({ drain }) => { drains.push(drain); },
    onStoreClose: ({ registration }) => { registrations.push(registration); } };
}

function start(t: TestContext, composeOverrides: NonNullable<Parameters<typeof startServingRoutines>[1]>["composeOverrides"]) {
  return startServingRoutines({ errors: createRouteIncidentReporter().errors, routeDeps, router: Router(), desktopEligible: true, releaseEnabled: true,
    reporter: { record: () => assert.fail("no incident is expected") } }, { storeHooks: site(t), composeOverrides: {
    timers: { schedule: () => () => {} }, writeBeacon: async () => {},
    policy: { releaseEnabled: true, access: async () => false }, ...composeOverrides } });
}

test("a routine store that cannot be opened is logged as a [routines] console warning naming the failure", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const broken = new Error("routine db unavailable");
  const serving = start(t, { openSqlite: () => { throw broken; } });
  await serving.ready;
  const calls = warn.mock.calls.map((call) => call.arguments);
  assert.ok(calls.some(([message, error]) => message === "[routines] routine-sidecar-open-failed" && error === broken),
    `expected the open failure, got ${calls.map(([message]) => String(message)).join(" | ")}`);
  for (const [message] of calls) assert.match(String(message), /^\[routines\] /);
  await serving.stop();
});

test("with a parent IPC slot and no injected channel, the wake receiver listens on the process and stop removes it", async (t) => {
  const hadSend = Object.hasOwn(process, "send");
  const originalSend = process.send;
  process.send = (() => true) as typeof process.send;
  t.after(() => { if (hadSend) process.send = originalSend; else delete (process as { send?: unknown }).send; });
  const before = process.listenerCount("message");
  const serving = start(t, { log: () => {}, openSqlite: (file) => openNativeSqlite(file) });
  await serving.ready;
  assert.equal(process.listenerCount("message"), before + 1, "the receiver is on the process's own IPC channel");
  await serving.stop();
  assert.equal(process.listenerCount("message"), before);
});

test("without a parent IPC slot and no injected channel, no receiver is installed on the process", async (t) => {
  assert.equal(typeof process.send, "undefined", "the test runner child has no IPC slot of its own here");
  const before = process.listenerCount("message");
  const serving = start(t, { log: () => {}, openSqlite: (file) => openNativeSqlite(file) });
  await serving.ready;
  assert.equal(process.listenerCount("message"), before);
  await serving.stop();
});
