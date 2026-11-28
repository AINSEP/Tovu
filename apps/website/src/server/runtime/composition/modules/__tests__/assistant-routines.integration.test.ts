import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { RoutineService } from "@jini-ai/daemon";
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
    mountAdminRoute: ({ spec }, options) => { routes.set(`${spec.method} ${spec.path}`, { spec, options }); },
    now: clock.now, newId: () => `id-${++id}`, timers: clock.timers, log: quiet, writeBeacon: async () => ({ ok: true }),
    policy: { releaseEnabled: true, access: async ({ actor }) => actor.principalId === OWNER.id && actor.workspaceId === OWNER.workspaceId },
    reporter: { record: () => assert.fail("no incident is expected") },
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

test("store-open failure answers the plain unavailable refusal with the admin ERR- id it logged the open error under", async (t) => {
  const reported: Array<{ error: unknown; operation: string }> = [];
  const reporter = { record: (args: { error: unknown; operation: string }) => { reported.push({ error: args.error, operation: args.operation }); return { errorId: "ERR-AAAA-BBBB-CCCC-DDDD" }; } };
  const h = harness(t, { openSqlite: () => { throw new Error("SQLITE_CANTOPEN"); }, reporter });
  const host = await composeAssistantRoutines(h.required, { monotonicNow: h.clock.now });
  assert.equal(host.availability(), "error");
  assert.equal(reported.length, 1, "the open failure is reported once, at boot");
  assert.equal(reported[0]!.operation, "routines:store-open");
  assert.match(String((reported[0]!.error as Error).message), /SQLITE_CANTOPEN/);
  for (const [key, body] of [[`get ${ROUTINE_ROUTE_BASE}`, undefined], [`post ${ROUTINE_ROUTE_BASE}`, { name: "Daily", prompt: "Sum", schedule: { kind: "hourly", minute: 5 } }]] as const) {
    const refused = await h.call(key, { body });
    assert.equal(refused.ok, false, key);
    if (refused.ok) continue;
    assert.equal(refused.error.message, "Routines are unavailable because their data file could not be opened.");
    assert.deepEqual(refused.error.details, { reason: "ROUTINES_STORE_OPEN_FAILED", availability: "error", errorId: "ERR-AAAA-BBBB-CCCC-DDDD" }, key);
  }
  const stranger = await h.call(`get ${ROUTINE_ROUTE_BASE}`, { context: { id: "attacker", workspaceId: "ws-1" } });
  assert.equal(stranger.ok, false);
  if (!stranger.ok) assert.equal((stranger.error.details as { errorId?: string } | undefined)?.errorId, undefined, "a non-owner never sees the incident id");
});

test("store-open failure mints the admin ERR- id by default", async (t) => {
  const h = harness(t, { openSqlite: () => { throw new Error("SQLITE_CANTOPEN"); } });
  await h.compose();
  const listed = await h.call(`get ${ROUTINE_ROUTE_BASE}`);
  assert.equal(listed.ok, false);
  if (!listed.ok) assert.match((listed.error.details as { errorId: string }).errorId, /^ERR-[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
});

test("create needs no body target: the admin form sends none and composition supplies it", async (t) => {
  const h = harness(t);
  await h.compose();
  const created = await h.call(`post ${ROUTINE_ROUTE_BASE}`, { body: { name: "Daily", prompt: "Summarize", schedule: { kind: "hourly", minute: 5 } } });
  assert.equal(created.ok, true, created.ok ? "" : JSON.stringify(created.error));
  if (created.ok) assert.deepEqual((created.value as { routine: { target: unknown } }).routine.target, { mode: "create_each_run" });
  const malformed = await h.call(`post ${ROUTINE_ROUTE_BASE}`, { body: { name: "Daily", prompt: "Summarize", schedule: { kind: "hourly", minute: 5 }, target: "garbage" } });
  assert.equal(malformed.ok, true, "a body target is never read, so it cannot fail the create either");
  await h.close();
});

test("passive profile: a second window never runs a routine slot while the owner holds the lease, even past a due slot", async (t) => {
  const contentDbPath = tempSite(t);
  const routineId = await seedRoutine(contentDbPath);
  const owner = harness(t, { contentDbPath });
  const ownerHost = await composeAssistantRoutines(owner.required, { monotonicNow: owner.clock.now, holderId: "window-owner" });
  assert.equal(ownerHost.availability(), "ready");
  // Same site file, the SAME virtual clock and timer set (one machine, one time), its own starter and lease holder.
  const passive = harness(t, { contentDbPath, now: owner.clock.now, timers: owner.clock.timers });
  const passiveHost = await composeAssistantRoutines(passive.required, { monotonicNow: owner.clock.now, holderId: "window-passive" });
  assert.equal(passiveHost.availability(), "other-window");
  // Two hours crosses the due slot (:05) and several lease retries: the owner heartbeat keeps renewing.
  await owner.clock.advance(2 * 60 * 60_000);
  assert.ok(owner.starts.some((start) => start.routineId === routineId), "the owner's window ran the due slot");
  assert.deepEqual(passive.starts, [], "the other window never called runStarter");
  assert.equal(passiveHost.availability(), "other-window");
  await passive.close();
  await owner.close();
});

test("the routines route refuses a missing id and pages persisted runs without exposing private fields", async (t) => {
  const contentDbPath = tempSite(t);
  const routineId = await seedRoutine(contentDbPath);
  const h = harness(t, { contentDbPath });
  try {
    await h.compose();
    const missing = await h.call(`get ${ROUTINE_ROUTE_BASE}/:id`, { params: { id: "missing-routine" } });
    assert.equal(missing.ok, false);
    if (missing.ok) assert.fail("a missing id must have an error");
    assert.equal(missing.error.code, "NOT_FOUND");

    await h.clock.advance(2 * 60 * 60_000);
    const saved = await readRuns(contentDbPath, routineId);
    assert.equal(saved.length, 2);
    const first = await h.call(`get ${ROUTINE_ROUTE_BASE}/:id/runs`, { params: { id: routineId }, query: { limit: "1" } });
    if (!first.ok) assert.fail(JSON.stringify(first.error));
    const page = first.value as { runs: Array<{ runId: string; status: string }>; nextCursor: string | null };
    assert.equal(typeof page.nextCursor, "string");
    assert.deepEqual(page.runs.map(({ runId, status }) => [runId, status]), [[saved[0]!.id, "succeeded"]]);
    assert.doesNotMatch(JSON.stringify(page.runs), /holderId|exchangeId|approvalExchangeRef/);

    const second = await h.call(`get ${ROUTINE_ROUTE_BASE}/:id/runs`, {
      params: { id: routineId }, query: { limit: "1", cursor: page.nextCursor },
    });
    if (!second.ok) assert.fail(JSON.stringify(second.error));
    const next = second.value as typeof page;
    assert.equal(next.nextCursor, null);
    assert.deepEqual(next.runs.map(({ runId, status }) => [runId, status]), [[saved[1]!.id, "succeeded"]]);
  } finally { await h.close(); }
});

test("update, run-now and delete reach the owner command gate; a missing routine answers the factory's own 404", async (t) => {
  const h = harness(t);
  try {
    await h.compose();
    const created = await h.call(`post ${ROUTINE_ROUTE_BASE}`, { body: { name: "Daily", prompt: "Summarize", schedule: { kind: "hourly", minute: 5 } } });
    if (!created.ok) assert.fail(JSON.stringify(created.error));
    const routine = (created.value as { routine: { id: string; revision: number } }).routine;

    const updated = await h.call(`patch ${ROUTINE_ROUTE_BASE}/:id`, { params: { id: routine.id }, body: { name: "Renamed", expectedRevision: routine.revision } });
    if (!updated.ok) assert.fail(JSON.stringify(updated.error));
    const renamed = (updated.value as { routine: { id: string; name: string; revision: number } }).routine;
    assert.deepEqual([renamed.id, renamed.name], [routine.id, "Renamed"]);
    assert.ok(renamed.revision > routine.revision, "the update committed a new revision");
    const missingUpdate = await h.call(`patch ${ROUTINE_ROUTE_BASE}/:id`, { params: { id: "missing-routine" }, body: { name: "Other" } });
    if (missingUpdate.ok) assert.fail("updating a missing routine must refuse");
    assert.equal(missingUpdate.error.code, "NOT_FOUND");

    const ran = await h.call(`post ${ROUTINE_ROUTE_BASE}/:id/run`, { params: { id: routine.id } });
    if (!ran.ok) assert.fail(JSON.stringify(ran.error));
    const started = ran.value as { projectId: string; conversationId: string; agentRunId: string; run: { trigger: string } | null; routine: { name: string } | null };
    assert.deepEqual([started.projectId, started.conversationId, started.agentRunId], ["p-1", "c-1", "a-1"], "the starter's own run ids come back");
    assert.deepEqual(h.starts, [{ trigger: "manual", routineId: routine.id }]);
    assert.deepEqual([started.run?.trigger, started.routine?.name], ["manual", "Renamed"], "the latest persisted run and the routine are read back");

    const removed = await h.call(`delete ${ROUTINE_ROUTE_BASE}/:id`, { params: { id: routine.id } });
    if (!removed.ok) assert.fail(JSON.stringify(removed.error));
    assert.deepEqual(removed.value, { ok: true });
    const listed = await h.call(`get ${ROUTINE_ROUTE_BASE}`);
    if (!listed.ok) assert.fail(JSON.stringify(listed.error));
    assert.deepEqual((listed.value as { routines: unknown[] }).routines, [], "the deleted routine is gone from the list");
    const missingDelete = await h.call(`delete ${ROUTINE_ROUTE_BASE}/:id`, { params: { id: routine.id } });
    if (missingDelete.ok) assert.fail("deleting a missing routine must refuse");
    assert.equal(missingDelete.error.code, "NOT_FOUND");
  } finally { await h.close(); }
});

test("turning the assistant off drains, disarms every timer and releases the lease; the beacon then counts no live routine", async (t) => {
  const contentDbPath = tempSite(t);
  await seedRoutine(contentDbPath);
  const beacons: number[] = [];
  const h = harness(t, { contentDbPath, writeBeacon: async ({ enabled }) => { beacons.push(enabled); return { ok: true }; } });
  try {
    const host = await h.compose();
    assert.equal(host.availability(), "ready");
    assert.equal(host.bootInterruption.isLeaseOwner(), true);
    assert.ok(h.clock.pending.size > 0, "timers are armed while the assistant is on");
    assert.deepEqual(beacons, [1]);
    h.toggle(false);
    await h.clock.advance(5_000);
    assert.equal(host.availability(), "assistant-off");
    assert.equal(h.clock.pending.size, 0, "the stop fences every scheduler and lease timer");
    assert.deepEqual(beacons, [1, 0]);
    // A second window can now take the lease the first one released.
    const other = harness(t, { contentDbPath, now: h.clock.now, timers: h.clock.timers });
    const otherHost = await composeAssistantRoutines(other.required, { monotonicNow: h.clock.now, holderId: "window-2" });
    assert.equal(otherHost.availability(), "ready");
    await other.close();
  } finally { await h.close(); }
});

test("a failing beacon write is logged and never fails boot or a command", async (t) => {
  const logged: Array<{ event: string; error: unknown }> = [];
  const failure = new Error("beacon disk full");
  const h = harness(t, { writeBeacon: async () => { throw failure; }, log: (entry) => { logged.push(entry); } });
  try {
    const host = await h.compose();
    assert.equal(host.availability(), "ready");
    const created = await h.call(`post ${ROUTINE_ROUTE_BASE}`, { body: { name: "Daily", prompt: "Summarize", schedule: { kind: "hourly", minute: 5 } } });
    assert.equal(created.ok, true);
    await flush();
    const beaconFailures = logged.filter(({ event }) => event === "routine-beacon-failed");
    assert.equal(beaconFailures.length, 2, "boot and the committed create each tried the beacon once");
    assert.ok(beaconFailures.every(({ error }) => error === failure));
  } finally { await h.close(); }
});

test("the refusal host and a closed host expose inert boot, wake and approval ports", async (t) => {
  const refused = harness(t, { launch: { desktopEligible: false } });
  const refusalHost = await refused.compose();
  assert.equal(refusalHost.bootInterruption.isLeaseOwner(), false);
  assert.equal(await refusalHost.bootInterruption.whenInterrupted(), undefined);
  assert.equal(await refusalHost.reconcile({ reason: "wake" }), undefined);
  assert.equal(refusalHost.approvalBindingFor({ runId: "run-1" } as never), undefined);

  const h = harness(t);
  const host = await h.compose();
  assert.equal(host.bootInterruption.isLeaseOwner(), true);
  assert.equal(await host.bootInterruption.whenInterrupted(), undefined, "boot repair finished");
  // From the first synchronous step of the drain, before the lease is released, the host stops claiming it.
  const closing = h.close();
  assert.equal(host.availability(), "error");
  assert.equal(host.bootInterruption.isLeaseOwner(), false, "a closing host never claims the lease");
  await closing;
  assert.equal(await host.reconcile({ reason: "wake" }), undefined);
});

test("a signed-in non-owner is refused FORBIDDEN with its reason, a non-object create body reaches the factory's 400, and a repeated toggle is a no-op", async (t) => {
  const beacons: number[] = [];
  const h = harness(t, { writeBeacon: async ({ enabled }) => { beacons.push(enabled); return { ok: true }; } });
  try {
    await h.compose();
    const denied = await h.call(`get ${ROUTINE_ROUTE_BASE}`, { context: { id: "someone-else", workspaceId: "ws-1" } });
    if (denied.ok) assert.fail("a non-owner must be refused");
    assert.equal(denied.error.code, "FORBIDDEN");
    assert.equal((denied.error.details as { reason: string }).reason, "ROUTINES_FORBIDDEN");
    const arrayBody = await h.call(`post ${ROUTINE_ROUTE_BASE}`, { body: [{ name: "Daily" }] });
    if (arrayBody.ok) assert.fail("an array body is not a routine draft");
    assert.deepEqual([arrayBody.error.code, arrayBody.error.message], ["BAD_REQUEST", "body must be a JSON object"], "the body is passed through untouched, not spread into an object");
    const before = beacons.length;
    h.toggle(true);
    await flush();
    assert.equal(beacons.length, before, "re-announcing the current state neither restarts the host nor rewrites the beacon");
  } finally { await h.close(); }
});

test("a toggle after close is ignored and re-enabling during the drain keeps the lease", async (t) => {
  const beacons: number[] = [];
  const logged: string[] = [];
  let listener: (enabled: boolean) => void = () => {};
  const h = harness(t, { writeBeacon: async ({ enabled }) => { beacons.push(enabled); return { ok: true }; }, log: ({ event }) => { logged.push(event); },
    onAssistantToggle: (next) => { listener = next; return () => {}; } });
  const host = await h.compose();
  // Off then on before the drain settles: the host must not stop or release the lease.
  listener(false);
  listener(true);
  await h.clock.advance(5_000);
  assert.equal(host.availability(), "ready");
  assert.equal(host.bootInterruption.isLeaseOwner(), true, "the re-enabled host kept its lease");
  assert.ok(h.clock.pending.size > 0, "the re-enabled host kept its timers");

  listener(false);
  await h.clock.advance(5_000);
  assert.equal(host.availability(), "assistant-off");
  assert.equal(h.clock.pending.size, 0);

  await h.close();
  const written = beacons.length;
  const events = logged.length;
  listener(true);
  await flush();
  assert.equal(host.availability(), "error", "a closed host stays closed");
  assert.equal(beacons.length, written, "a toggle after close neither restarts nor rewrites the beacon");
  assert.deepEqual(logged.slice(events), [], "a toggle after close never touches the closed service or store");
});

test("a failing assistant-off drain is logged as a toggle failure and the beacon is still written", async (t) => {
  const logged: Array<{ event: string; error: unknown }> = [];
  const beacons: number[] = [];
  const failure = new Error("drain failed");
  const h = harness(t, { log: (entry) => { logged.push(entry); }, writeBeacon: async ({ enabled }) => { beacons.push(enabled); return { ok: true }; } });
  let id = 0;
  const host = await composeAssistantRoutines(h.required, {
    createService: ({ persistence, holderId }) => Object.assign(new RoutineService({ persistence }, {
      now: h.clock.now, monotonicNow: h.clock.now, newId: () => `svc-${++id}`, timers: h.clock.timers, holderId, log: quiet,
    }), { drainActive: async () => { throw failure; } }),
  });
  try {
    h.toggle(false);
    await h.clock.advance(5_000);
    assert.deepEqual(logged.filter(({ event }) => event === "routine-toggle-failed").map(({ error }) => error), [failure]);
    assert.equal(host.availability(), "assistant-off");
    assert.deepEqual(beacons, [0, 0], "boot and the failed toggle each wrote the beacon");
  } finally { await h.close(); }
});

test("an injected run handler builder wins over the composed starter", async (t) => {
  const handled: string[] = [];
  const h = harness(t);
  const host = await composeAssistantRoutines(h.required, {
    createRunHandler: ({ approvals }) => {
      assert.equal(typeof approvals.track, "function");
      return async ({ routine, trigger }) => {
        handled.push(`${trigger}:${routine.id}`);
        return { projectId: "p-2", conversationId: "c-2", agentRunId: "a-own", completion: Promise.resolve({ status: "succeeded" as const }) };
      };
    },
  });
  try {
    assert.equal(host.availability(), "ready");
    const created = await h.call(`post ${ROUTINE_ROUTE_BASE}`, { body: { name: "Daily", prompt: "Summarize", schedule: { kind: "hourly", minute: 5 } } });
    if (!created.ok) assert.fail(JSON.stringify(created.error));
    const routineId = (created.value as { routine: { id: string } }).routine.id;
    const ran = await h.call(`post ${ROUTINE_ROUTE_BASE}/:id/run`, { params: { id: routineId } });
    if (!ran.ok) assert.fail(JSON.stringify(ran.error));
    assert.equal((ran.value as { agentRunId: string }).agentRunId, "a-own");
    assert.deepEqual(handled, [`manual:${routineId}`]);
    assert.deepEqual(h.starts, [], "the composed starter is not used when a handler builder is injected");
  } finally { await h.close(); }
});
