import assert from "node:assert/strict";
import test from "node:test";

import type { RoutineActor, RoutineAvailability, RoutineTarget } from "@tovu/contracts/routines";
import { createRoutineCommands, ROUTINE_AVAILABILITY_REFUSALS } from "../routine-commands.js";

/**
 * @file `createRoutineCommands`: the owner command gate. Proves permission is re-checked per command,
 * the creator comes only from the trusted actor, the target only from composition, scheduling moves
 * only after the store commits, and public rows never carry holder, approval ref or context.
 */

const OWNER: RoutineActor = { principalId: "owner-1", workspaceId: "ws-1" };
const SCHEDULE = { kind: "daily", time: "09:00", timezone: "UTC" } as const;

interface FakeRoutine {
  id: string; name: string; prompt: string; schedule: unknown; target: unknown; skillId: string | null;
  agentId: string | null; model: string | null; context: unknown; creatorId: string; enabled: boolean;
  nextRunAt: number | null; revision: number; createdAt: number; updatedAt: number; lastRun: unknown;
}

function makeHarness(options: { allow?: boolean; availability?: RoutineAvailability; target?: RoutineTarget; commitFails?: boolean } = {}) {
  const events: string[] = [];
  const rows = new Map<string, FakeRoutine>();
  const calls: Record<string, unknown[]> = { create: [], update: [], setEnabled: [], delete: [], listRuns: [], committed: [], logs: [] };
  const commit = async <T>(name: string, value: T): Promise<T> => {
    await Promise.resolve();
    if (options.commitFails) throw new Error("disk full");
    events.push(`commit:${name}`);
    return value;
  };
  const store = {
    list: async () => [...rows.values()],
    get: async ({ id }: { id: string }) => rows.get(id) ?? null,
    create: async (required: Record<string, unknown>, optional: Record<string, unknown> = {}) => {
      calls.create!.push({ required, optional });
      const row: FakeRoutine = { id: "r-new", name: String(required.name), prompt: String(required.prompt), schedule: required.schedule,
        target: required.target, skillId: null, agentId: null, model: null, context: optional.context ?? {},
        creatorId: String(optional.creatorId), enabled: optional.enabled !== false, nextRunAt: 5, revision: 1, createdAt: 1, updatedAt: 1, lastRun: null };
      rows.set(row.id, row);
      return commit("create", row);
    },
    update: async (args: { id: string; patch: Record<string, unknown> }, optional: Record<string, unknown> = {}) => {
      calls.update!.push({ args, optional });
      const row = rows.get(args.id);
      if (!row) return null;
      Object.assign(row, args.patch, { revision: row.revision + 1 });
      return commit("update", row);
    },
    setEnabled: async (args: { id: string; enabled: boolean }, optional: Record<string, unknown> = {}) => {
      calls.setEnabled!.push({ args, optional });
      const row = rows.get(args.id);
      if (!row) return null;
      row.enabled = args.enabled;
      return commit("setEnabled", row);
    },
    delete: async (args: { id: string }, optional: Record<string, unknown> = {}) => {
      calls.delete!.push({ args, optional });
      const existed = rows.delete(args.id);
      return existed ? commit("delete", true) : false;
    },
    listRuns: async (required: { routineId: string }, optional: Record<string, unknown> = {}) => {
      calls.listRuns!.push({ required, optional });
      return { items: [{ id: "run-1", routineId: required.routineId, trigger: "manual", status: "running", projectId: "p", conversationId: "c",
        agentRunId: "a", startedAt: 1, completedAt: null, summary: null, error: null, errorCode: null, holderId: "boot-x",
        approvalState: "waiting", approvalRef: "exchange-secret", approvalSince: 2 }], nextCursor: "next" };
    },
  };
  const service = {
    rescheduleOne: ({ routineId }: { routineId: string }) => { events.push(`reschedule:${routineId}`); },
    unschedule: ({ routineId }: { routineId: string }) => { events.push(`unschedule:${routineId}`); },
    runNow: async ({ routineId }: { routineId: string }) => {
      events.push(`runNow:${routineId}`);
      return { projectId: "p", conversationId: "c", agentRunId: "a", completion: new Promise(() => {}) };
    },
  };
  const accessCalls: unknown[] = [];
  const commands = createRoutineCommands({
    store: store as never,
    service: service as never,
    access: async (required) => { accessCalls.push(required); return options.allow ?? true; },
    onCommandCommitted: (required) => { calls.committed!.push(required); events.push("committed"); },
    availability: () => options.availability ?? "ready",
    target: options.target ?? { mode: "create_each_run" },
  }, { log: (entry) => { calls.logs!.push(entry); } });
  const seed = (overrides: Partial<FakeRoutine> = {}) => {
    const row: FakeRoutine = { id: "r1", name: "Daily", prompt: "p", schedule: SCHEDULE, target: { mode: "create_each_run" }, skillId: null,
      agentId: null, model: null, context: { skillIds: ["secret-skill"] }, creatorId: "owner-1", enabled: true, nextRunAt: 9,
      revision: 3, createdAt: 1, updatedAt: 1, lastRun: { runId: "run-0", status: "succeeded", approvalRef: "x", holderId: "h" }, ...overrides };
    rows.set(row.id, row);
    return row;
  };
  return { commands, events, calls, accessCalls, seed, rows };
}

test("create stamps the creator from the trusted actor and ignores any owner in the body", async () => {
  const h = makeHarness();
  const result = await h.commands.create({ actor: OWNER, draft: { name: "N", prompt: "P", schedule: SCHEDULE,
    creatorId: "attacker", owner: "attacker", target: { mode: "reuse", projectId: "theirs" } } as never });
  assert.equal(result.ok, true);
  const { required, optional } = h.calls.create![0] as { required: Record<string, unknown>; optional: Record<string, unknown> };
  assert.equal(optional.creatorId, "owner-1");
  assert.equal("creatorId" in required, false);
  assert.equal("owner" in required, false);
  assert.deepEqual(required.target, { mode: "create_each_run" });
});

test("create uses the composition target even when the body names another project", async () => {
  const h = makeHarness({ target: { mode: "reuse", projectId: "host-project" } });
  await h.commands.create({ actor: OWNER, draft: { name: "N", prompt: "P", schedule: SCHEDULE, target: { mode: "create_each_run" } } as never });
  assert.deepEqual((h.calls.create![0] as { required: { target: unknown } }).required.target, { mode: "reuse", projectId: "host-project" });
});

test("every command re-checks access with the actor and a denial is a plain refusal that touches nothing", async () => {
  const h = makeHarness({ allow: false });
  h.seed();
  const results = [
    await h.commands.list({ actor: OWNER }),
    await h.commands.get({ actor: OWNER, id: "r1" }),
    await h.commands.create({ actor: OWNER, draft: { name: "N", prompt: "P", schedule: SCHEDULE } }),
    await h.commands.update({ actor: OWNER, id: "r1", patch: { name: "X" } }, { expectedRevision: 3 }),
    await h.commands.setEnabled({ actor: OWNER, id: "r1", enabled: false }, { expectedRevision: 3 }),
    await h.commands.delete({ actor: OWNER, id: "r1" }, { expectedRevision: 3 }),
    await h.commands.runNow({ actor: OWNER, id: "r1" }),
    await h.commands.listRuns({ actor: OWNER, id: "r1" }, {}),
  ];
  assert.equal(h.accessCalls.length, 8);
  for (const call of h.accessCalls) assert.deepEqual(call, { actor: OWNER });
  for (const result of results) {
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "ROUTINES_FORBIDDEN");
      assert.equal(result.message, "Only the site owner can manage routines.");
    }
  }
  assert.deepEqual(h.events, []);
  assert.equal(h.calls.create!.length + h.calls.update!.length + h.calls.delete!.length, 0);
});

test("non-ready availability refuses with the stable reason and plain sentence", async () => {
  const expected: Array<[RoutineAvailability, string, string]> = [
    ["starting", "ROUTINES_STARTING", "Routines are still starting. Try again in a moment."],
    ["desktop-only", "ROUTINES_UNAVAILABLE", "Routines run only while the desktop app is open."],
    ["assistant-off", "ROUTINES_ASSISTANT_OFF", "Turn on the AI assistant to run routines."],
    ["other-window", "ROUTINES_LEASE_HELD", "Routines for this site are running in another Tovu window."],
    ["error", "ROUTINES_STORE_OPEN_FAILED", "Routines are unavailable because their data file could not be opened."],
  ];
  for (const [availability, reason, message] of expected) {
    assert.deepEqual(ROUTINE_AVAILABILITY_REFUSALS[availability as Exclude<RoutineAvailability, "ready">], { reason, message });
    const h = makeHarness({ availability });
    const result = await h.commands.list({ actor: OWNER });
    assert.deepEqual(result, { ok: false, status: 503, reason, message, availability });
    assert.equal(h.calls.create!.length, 0);
  }
});

test("ready list returns public rows and the availability, without context, holder or approval ref", async () => {
  const h = makeHarness();
  h.seed();
  const result = await h.commands.list({ actor: OWNER });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.availability, "ready");
  const [row] = result.routines;
  assert.ok(row);
  assert.equal("context" in row, false);
  assert.deepEqual(row.lastRun, { runId: "run-0", status: "succeeded" });
  assert.equal(row.creatorId, "owner-1");
});

test("listRuns forwards cursor and limit and strips holder and approval ref", async () => {
  const h = makeHarness();
  h.seed();
  const result = await h.commands.listRuns({ actor: OWNER, id: "r1" }, { cursor: "c1", limit: 5 });
  assert.deepEqual(h.calls.listRuns![0], { required: { routineId: "r1" }, optional: { cursor: "c1", limit: 5 } });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const [run] = result.runs;
  assert.ok(run);
  assert.equal(run.runId, "run-1");
  assert.equal(run.approvalState, "waiting");
  assert.equal("approvalRef" in run, false);
  assert.equal("holderId" in run, false);
  assert.equal(result.nextCursor, "next");
});

test("update forwards expectedRevision, drops owner/target from the patch, and reschedules only after commit", async () => {
  const h = makeHarness();
  h.seed();
  const result = await h.commands.update({ actor: OWNER, id: "r1", patch: { name: "X", creatorId: "evil", target: { mode: "reuse", projectId: "q" } } as never }, { expectedRevision: 3 });
  assert.equal(result.ok, true);
  assert.deepEqual(h.calls.update![0], { args: { id: "r1", patch: { name: "X" } }, optional: { expectedRevision: 3 } });
  assert.deepEqual(h.events, ["commit:update", "reschedule:r1", "committed"]);
});

test("pause unschedules after commit and delete unschedules after commit", async () => {
  const h = makeHarness();
  h.seed();
  await h.commands.setEnabled({ actor: OWNER, id: "r1", enabled: false }, { expectedRevision: 3 });
  assert.deepEqual(h.calls.setEnabled![0], { args: { id: "r1", enabled: false }, optional: { expectedRevision: 3 } });
  await h.commands.delete({ actor: OWNER, id: "r1" }, { expectedRevision: 4 });
  assert.deepEqual(h.calls.delete![0], { args: { id: "r1" }, optional: { expectedRevision: 4 } });
  assert.deepEqual(h.events, ["commit:setEnabled", "unschedule:r1", "committed", "commit:delete", "unschedule:r1", "committed"]);
});

test("a failed commit never reschedules or reports a commit", async () => {
  const h = makeHarness({ commitFails: true });
  h.seed();
  await assert.rejects(h.commands.update({ actor: OWNER, id: "r1", patch: { name: "X" } }, { expectedRevision: 3 }), /disk full/);
  assert.deepEqual(h.events, []);
});

test("a missing routine is a plain not-found refusal", async () => {
  const h = makeHarness();
  for (const result of [
    await h.commands.get({ actor: OWNER, id: "nope" }),
    await h.commands.update({ actor: OWNER, id: "nope", patch: { name: "X" } }, {}),
    await h.commands.delete({ actor: OWNER, id: "nope" }, {}),
    await h.commands.runNow({ actor: OWNER, id: "nope" }),
  ]) {
    assert.deepEqual(result, { ok: false, status: 404, reason: "ROUTINE_NOT_FOUND", message: "That routine no longer exists." });
  }
  assert.deepEqual(h.events, []);
});

test("a failing post-commit hook is logged and never undoes the committed write", async () => {
  const h = makeHarness();
  const commands = createRoutineCommands({
    store: { create: async () => ({ id: "r9", enabled: true, revision: 1 }) } as never,
    service: { rescheduleOne: () => { throw new Error("timer boom"); } } as never,
    access: async () => true,
    onCommandCommitted: () => { throw new Error("beacon boom"); },
    availability: () => "ready",
    target: { mode: "create_each_run" },
  }, { log: (entry) => { h.calls.logs!.push(entry); } });
  const result = await commands.create({ actor: OWNER, draft: { name: "N", prompt: "P", schedule: SCHEDULE } });
  assert.equal(result.ok, true);
  assert.equal(h.calls.logs!.length, 2);
});

test("runNow starts the run and returns only the run's public ids", async () => {
  const h = makeHarness();
  h.seed();
  const result = await h.commands.runNow({ actor: OWNER, id: "r1" });
  assert.deepEqual(result, { ok: true, run: { projectId: "p", conversationId: "c", agentRunId: "a" } });
  assert.deepEqual(h.events, ["runNow:r1"]);
});
