import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { migrateJiniRoutines } from "@jini-ai/daemon/routines/sqlite";
import { runMigrations } from "@jini-ai/db/migrate";
import { openNativeSqlite, type NativeSqliteDatabase } from "#src/platform/db/kernel/drivers/sqlite";
import { openRoutineSidecar } from "#src/features/routines/routine-host";
import { composeAssistantRoutines, ROUTINE_ROUTE_BASE, type ComposeAssistantRoutinesRequired, type MountRoutineAdminRoute } from "../assistant-routines.js";

/**
 * @file `composeAssistantRoutines` on a real sidecar (better-sqlite3 in a temp site) with a fake
 * starter, a fake clock and a fake timer port. No Express: `mountAdminRoute` captures the specs and
 * the tests drive them the way the admin mount does (parse, then handle with the authenticated principal).
 */

const OWNER = { id: "owner-1", workspaceId: "ws-1" };
const START = Date.UTC(2026, 10, 25, 10, 0, 0);
const flush = () => new Promise((resolve) => setImmediate(resolve));
const quiet = () => {};

function fakeClock() {
  let t = START;
  const pending = new Set<{ due: number; callback: () => void }>();
  const timers = { schedule: ({ delayMs, callback }: { delayMs: number; callback: () => void }) => {
    const entry = { due: t + delayMs, callback };
    pending.add(entry);
    return () => { pending.delete(entry); };
  } };
  /** Moves virtual time forward, firing every due timer in order (re-armed ones included). */
  async function advance(ms: number) {
    const end = t + ms;
    for (;;) {
      const next = [...pending].filter((e) => e.due <= end).sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      t = next.due;
      pending.delete(next);
      next.callback();
      await flush();
    }
    t = end;
    await flush();
  }
  return { now: () => t, timers, pending, advance };
}

function tempSite(t: { after: (fn: () => void) => void }): string {
  const root = mkdtempSync(path.join(tmpdir(), "assistant-routines-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return path.join(root, "data.nosync", "content.db");
}

/** Seeds an enabled hourly routine straight into the sidecar, as a previous session would have. */
async function seedRoutine(contentDbPath: string) {
  const opened = await openRoutineSidecar({ contentDbPath, openSqlite: openNativeSqlite, runMigrations, migrate: migrateJiniRoutines as never,
    scope: "ws-1", holderId: "seed", now: () => START - 60_000, newId: () => "r-seed" }, { log: quiet });
  assert.ok(opened.ok);
  const routine = await opened.store.create({ name: "Daily", prompt: "Summarize", schedule: { kind: "hourly", minute: 5 }, target: { mode: "create_each_run" } }, { creatorId: "owner-1" });
  opened.close();
  return routine.id;
}

async function readRuns(contentDbPath: string, routineId: string) {
  const opened = await openRoutineSidecar({ contentDbPath, openSqlite: openNativeSqlite, runMigrations, migrate: migrateJiniRoutines as never,
    scope: "ws-1", holderId: "reader", now: () => START, newId: () => "x" }, { log: quiet });
  assert.ok(opened.ok);
  try { return (await opened.store.listRuns({ routineId })).items; } finally { opened.close(); }
}

type Spec = Parameters<MountRoutineAdminRoute>[0]["spec"];

function harness(t: { after: (fn: () => void) => void }, overrides: Partial<ComposeAssistantRoutinesRequired> = {}) {
  const clock = fakeClock();
  const routes = new Map<string, { spec: Spec; options: unknown }>();
  const starts: Array<{ trigger: string; routineId: string }> = [];
  let drain: (() => Promise<void>) | undefined;
  const registrations: Array<() => unknown> = [];
  let toggle: (enabled: boolean) => void = () => {};
  const handles: NativeSqliteDatabase[] = [];
  let id = 0;
  const required: ComposeAssistantRoutinesRequired = {
    launch: { desktopEligible: true }, workspaceId: "ws-1", contentDbPath: overrides.contentDbPath ?? tempSite(t),
    openSqlite: (file) => { const handle = openNativeSqlite(file); handles.push(handle); return handle; },
    beforeStoreClose: ({ drain: d }) => { drain = d; },
    onStoreClose: ({ registration }) => { registrations.push(registration as () => unknown); },
    assistantEnabled: true, onAssistantToggle: (listener) => { toggle = listener; return () => { toggle = () => {}; }; },
    runStarter: async ({ routine, trigger }) => {
      starts.push({ trigger, routineId: routine.id });
      return { projectId: "p-1", conversationId: "c-1", agentRunId: `a-${starts.length}`, completion: Promise.resolve({ status: "succeeded" as const }) };
    },
    approvalObserver: { observe: async () => {} },
    mountAdminRoute: ({ spec }, options) => { routes.set(`${spec.method} ${spec.path}`, { spec, options }); },
    now: clock.now, newId: () => `id-${++id}`, timers: clock.timers, log: quiet, writeBeacon: async () => ({ ok: true }),
    policy: { releaseEnabled: true, access: async ({ actor }) => actor.principalId === OWNER.id && actor.workspaceId === OWNER.workspaceId },
    ...overrides,
  };
  t.after(() => { for (const handle of handles) if (handle.open) handle.close(); });
  const call = async (key: string, { body, params = {}, query = {}, context = OWNER }: { body?: unknown; params?: Record<string, string>; query?: Record<string, unknown>; context?: unknown } = {}) => {
    const route = routes.get(key);
    assert.ok(route, `route ${key} is mounted`);
    const parsed = route.spec.parse({ body, params, query });
    if (!parsed.ok) return parsed;
    return route.spec.handle({ input: parsed.value, deps: {} as never, context: context as never });
  };
  const close = async () => { await drain?.(); for (const registration of registrations) registration(); };
  return { clock, routes, starts, required, call, close, handles, toggle: (enabled: boolean) => toggle(enabled), compose: () => composeAssistantRoutines(required, { monotonicNow: clock.now }) };
}

test("a routine fires with no admin tab open past the idle interval", async (t) => {
  const contentDbPath = tempSite(t);
  const routineId = await seedRoutine(contentDbPath);
  const h = harness(t, { contentDbPath });
  const host = await h.compose();
  assert.equal(host.availability(), "ready");
  // No route is ever called: the scheduler starts at boot, not on an admin connection.
  await h.clock.advance(2 * 60 * 60_000);
  assert.ok(h.starts.some((start) => start.trigger === "scheduled" && start.routineId === routineId), "the due slot fired with zero requests");
  await h.close();
});

test("assistant off -> no timers", async (t) => {
  const contentDbPath = tempSite(t);
  await seedRoutine(contentDbPath);
  const h = harness(t, { contentDbPath, assistantEnabled: false });
  const host = await h.compose();
  assert.equal(host.availability(), "assistant-off");
  assert.equal(h.clock.pending.size, 0, "no timer is armed on an assistant-off first boot");
  await h.clock.advance(2 * 60 * 60_000);
  assert.equal(h.starts.length, 0);
  const listed = await h.call(`get ${ROUTINE_ROUTE_BASE}`);
  assert.equal(listed.ok, false);
  if (!listed.ok) assert.equal((listed.error.details as { reason: string }).reason, "ROUTINES_ASSISTANT_OFF");
  // The injected toggle (no production producer yet) arms the scheduler.
  h.toggle(true);
  await h.clock.advance(2 * 60 * 60_000);
  assert.equal(host.availability(), "ready");
  assert.ok(h.starts.length >= 1, "enabling the assistant starts the scheduler");
  await h.close();
});

test("site withdrawal stops timers", async (t) => {
  const contentDbPath = tempSite(t);
  await seedRoutine(contentDbPath);
  const h = harness(t, { contentDbPath });
  await h.compose();
  assert.ok(h.clock.pending.size > 0, "timers are armed while the site serves");
  await h.close();
  assert.equal(h.clock.pending.size, 0, "store close fences every timer");
  await h.clock.advance(2 * 60 * 60_000);
  assert.equal(h.starts.length, 0);
});

test("request-supplied owner is ignored", async (t) => {
  const h = harness(t);
  await h.compose();
  const body = { name: "Weekly", prompt: "Post", schedule: { kind: "hourly", minute: 10 }, creatorId: "attacker", owner: "attacker",
    principalId: "attacker", workspaceId: "ws-evil", target: { mode: "reuse", projectId: "p-evil" } };
  const created = await h.call(`post ${ROUTINE_ROUTE_BASE}`, { body });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const routine = (created.value as { routine: { creatorId: string; target: unknown } }).routine;
  assert.equal(routine.creatorId, "owner-1", "creator comes from the authenticated principal");
  assert.deepEqual(routine.target, { mode: "create_each_run" }, "target comes from composition, never the body");
  const stranger = await h.call(`post ${ROUTINE_ROUTE_BASE}`, { body, context: { id: "attacker", workspaceId: "ws-1" } });
  assert.equal(stranger.ok, false);
  if (!stranger.ok) assert.equal(stranger.error.code, "FORBIDDEN");
  const anonymous = await h.call(`get ${ROUTINE_ROUTE_BASE}`, { context: null });
  assert.equal(anonymous.ok, false);
  await h.close();
});

test('web-only / standalone has no routines and the API says "Routines run only while the desktop app is open."', async (t) => {
  // Env presence of the desktop capability must not count; only the verified policy does.
  const saved = process.env.TOVU_DESKTOP_OWNER_SIGNIN;
  process.env.TOVU_DESKTOP_OWNER_SIGNIN = "a".repeat(64);
  t.after(() => { if (saved === undefined) delete process.env.TOVU_DESKTOP_OWNER_SIGNIN; else process.env.TOVU_DESKTOP_OWNER_SIGNIN = saved; });
  for (const shape of [{ launch: { desktopEligible: false } }, { policy: { releaseEnabled: false, access: async () => true } }]) {
    let opened = 0;
    const h = harness(t, { ...shape, openSqlite: () => { opened += 1; throw new Error("must not open"); } });
    const host = await h.compose();
    assert.equal(opened, 0, "no routine DB is opened");
    assert.equal(h.clock.pending.size, 0, "no timer is armed");
    assert.equal(host.availability(), "desktop-only");
    const listed = await h.call(`get ${ROUTINE_ROUTE_BASE}`);
    assert.equal(listed.ok, false);
    if (listed.ok) return;
    assert.equal(listed.error.message, "Routines run only while the desktop app is open.");
    assert.equal(listed.error.code, "SERVICE_UNAVAILABLE");
    assert.equal((listed.error.details as { reason: string }).reason, "ROUTINES_UNAVAILABLE");
  }
});

test("close marks open runs interrupted after the drain", async (t) => {
  const contentDbPath = tempSite(t);
  const routineId = await seedRoutine(contentDbPath);
  const h = harness(t, { contentDbPath, runStarter: async () => ({ projectId: "p", conversationId: "c", agentRunId: "a",
    completion: new Promise(() => {}) }) });
  await h.compose();
  await h.clock.advance(2 * 60 * 60_000);
  const sidecar = h.handles.at(-1)!;
  let closed = false;
  const closing = h.close().then(() => { closed = true; });
  // The stuck run never settles, so only the two-second drain bound lets close finish; step the clock
  // until it does (the drain timer is armed a few microtasks after close starts).
  for (let step = 0; step < 20 && !closed; step += 1) await h.clock.advance(500);
  await closing;
  assert.equal(sidecar.open, false, "the registration closed the borrowed connection");
  const runs = await readRuns(contentDbPath, routineId);
  assert.ok(runs.length >= 1);
  assert.ok(runs.every((run) => run.status === "interrupted"), `every unresolved run is interrupted, got ${runs.map((run) => run.status).join(",")}`);
});

test("store-open failure leaves the site up with availability error", async (t) => {
  const h = harness(t, { openSqlite: () => { throw new Error("SQLITE_CANTOPEN"); } });
  const host = await h.compose();
  assert.equal(host.availability(), "error");
  const listed = await h.call(`get ${ROUTINE_ROUTE_BASE}`);
  assert.equal(listed.ok, false);
  if (!listed.ok) assert.equal((listed.error.details as { reason: string }).reason, "ROUTINES_STORE_OPEN_FAILED");
});

test("every route is session-credential only and the four writes are same-origin", async (t) => {
  const h = harness(t);
  await h.compose();
  const writes = [...h.routes.values()].filter(({ spec }) => spec.method !== "get");
  assert.equal(h.routes.size, 7);
  assert.equal(writes.length, 4);
  for (const { spec } of writes) assert.equal(spec.requireSameOrigin, true, `${spec.method} ${spec.path} requires same origin`);
  for (const { options } of h.routes.values()) assert.ok((options as { sessionCredentialOnly?: unknown }).sessionCredentialOnly);
  await h.close();
});
