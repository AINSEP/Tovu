import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { EventEmitter } from "node:events";
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

test("a stop that lands before the routines finish composing installs no wake receiver afterwards", async (t) => {
  const hadSend = Object.hasOwn(process, "send");
  const originalSend = process.send;
  process.send = (() => true) as typeof process.send;
  t.after(() => { if (hadSend) process.send = originalSend; else delete (process as { send?: unknown }).send; });
  const before = process.listenerCount("message");
  const serving = start(t, { log: () => {}, openSqlite: (file) => openNativeSqlite(file) });
  await serving.stop();
  await serving.ready;
  assert.equal(process.listenerCount("message"), before, "a stopped boot never starts listening");
});

test("a serving boot with no owning store never opens the routine database, even on an eligible desktop", async () => {
  const opened: string[] = [];
  const serving = startServingRoutines({ errors: createRouteIncidentReporter().errors, routeDeps, router: Router(), desktopEligible: true, releaseEnabled: true,
    reporter: { record: () => assert.fail("no incident is expected") } }, { composeOverrides: {
    timers: { schedule: () => () => {} }, writeBeacon: async () => {}, log: () => {},
    policy: { releaseEnabled: true, access: async () => false },
    openSqlite: (file) => { opened.push(file); return openNativeSqlite(file); } } });
  await serving.ready;
  assert.deepEqual(opened, []);
  await serving.stop();
});

test("a wake whose reconcile fails is logged as a [routines] console warning, never thrown into the IPC listener", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const channel = new EventEmitter();
  const opened: Array<ReturnType<typeof openNativeSqlite>> = [];
  const serving = startServingRoutines({ errors: createRouteIncidentReporter().errors, routeDeps, router: Router(), desktopEligible: true, releaseEnabled: true,
    reporter: { record: () => assert.fail("no incident is expected") } }, { channel, storeHooks: site(t), composeOverrides: {
    timers: { schedule: () => () => {} }, writeBeacon: async () => {}, log: () => {},
    policy: { releaseEnabled: true, access: async () => false },
    openSqlite: (file) => { const db = openNativeSqlite(file); opened.push(db); return db; } } });
  await serving.ready;
  assert.equal(channel.listenerCount("message"), 1);
  for (const db of opened) db.close();
  channel.emit("message", { type: "routines.reconcile", reason: "wake" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const wakeFailures = warn.mock.calls.map((call) => call.arguments).filter(([message]) => message === "[routines] routine-wake-reconcile-failed");
  assert.equal(wakeFailures.length, 1);
  assert.equal(wakeFailures[0]?.[1], "The database connection is not open", "the receiver logs the failure as its message text");
  await serving.stop();
  assert.equal(channel.listenerCount("message"), 0);
});

test("routines that fail to compose reject ready and are logged once as routine-compose-failed", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const broken = new Error("admin route slot unavailable");
  const router = Router();
  const serving = startServingRoutines({ errors: createRouteIncidentReporter().errors, routeDeps, router, desktopEligible: true, releaseEnabled: true,
    reporter: { record: () => assert.fail("no incident is expected") } }, { storeHooks: site(t), composeOverrides: {
    timers: { schedule: () => () => {} }, writeBeacon: async () => {}, log: () => {},
    policy: { releaseEnabled: true, access: async () => false },
    openSqlite: (file) => openNativeSqlite(file), mountAdminRoute: () => { throw broken; } } });
  await assert.rejects(serving.ready, broken);
  await new Promise((resolve) => setImmediate(resolve));
  const failures = warn.mock.calls.map((call) => call.arguments).filter(([message]) => message === "[routines] routine-compose-failed");
  assert.deepEqual(failures, [["[routines] routine-compose-failed", broken]]);
  await serving.stop();
});

test("with no injected timers the routine scheduler runs on real Node timers that never hold the process open", async (t) => {
  const realSetTimeout = globalThis.setTimeout;
  const handles: NodeJS.Timeout[] = [];
  t.mock.method(globalThis, "setTimeout", ((callback: () => void, delayMs?: number) => {
    const handle = realSetTimeout(callback, delayMs);
    handles.push(handle);
    return handle;
  }) as typeof setTimeout);
  const opened: Array<ReturnType<typeof openNativeSqlite>> = [];
  const hooks = site(t);
  const serving = startServingRoutines({ errors: createRouteIncidentReporter().errors, routeDeps, router: Router(), desktopEligible: true, releaseEnabled: true,
    reporter: { record: () => assert.fail("no incident is expected") } }, { channel: new EventEmitter(), storeHooks: hooks, composeOverrides: {
    writeBeacon: async () => {}, log: () => {}, policy: { releaseEnabled: true, access: async () => false },
    openSqlite: (file) => { const db = openNativeSqlite(file); opened.push(db); return db; } } });
  await serving.ready;
  t.mock.restoreAll();
  assert.equal(opened.length > 0, true, "the routine store opened");
  assert.equal(handles.length > 0, true, "the scheduler armed at least one real timer");
  assert.deepEqual(handles.map((handle) => handle.hasRef()), handles.map(() => false), "every routine timer is unref'd");
  await serving.stop();
});
