import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { migrateJiniRoutines } from "@jini-ai/daemon/routines/sqlite";
import { runMigrations } from "@jini-ai/db/migrate";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { openRoutineSidecar } from "#src/features/routines/routine-host";
import { composeAssistantRoutines, ROUTINE_ROUTE_BASE, type MountRoutineAdminRoute } from "../assistant-routines.js";

const OWNER = { id: "owner", workspaceId: "ws" };
const NOW = Date.UTC(2026, 10, 25, 10);

async function seedHistory(contentDbPath: string) {
  const seed = await openRoutineSidecar({ contentDbPath, openSqlite: openNativeSqlite, runMigrations,
    migrate: migrateJiniRoutines as never, scope: OWNER.workspaceId, holderId: "seed", now: () => NOW, newId: () => "routine-a" });
  assert.ok(seed.ok);
  try {
    const routine = await seed.store.create({ name: "Daily", prompt: "Summarize", schedule: { kind: "hourly", minute: 5 },
      target: { mode: "create_each_run" } }, { creatorId: OWNER.id });
    assert.equal(seed.persistence.acquireLease({ holderId: "seed", now: NOW, ttlMs: 90_000 }, {}), true);
    for (const [id, startedAt] of [["run-a", NOW - 2000], ["run-b", NOW - 1000]] as const) {
      assert.equal(seed.persistence.insertRun({ run: { id, routineId: routine.id, trigger: "manual", status: "succeeded",
        projectId: "p", conversationId: `chat-${id}`, agentRunId: `agent-${id}`, startedAt, completedAt: startedAt + 100,
        summary: null, error: null, errorCode: null } }, { holderId: "seed", now: NOW }), true);
    }
    seed.persistence.releaseLease({ holderId: "seed" }, {});
    return routine.id;
  } finally { seed.close(); }
}

test("BUG T-B04: the routine history route honors a limit of one", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "routine-history-"));
  const contentDbPath = path.join(root, "data.nosync", "content.db");
  let drain: (() => Promise<void>) | undefined;
  let close: Parameters<Parameters<typeof composeAssistantRoutines>[0]['onStoreClose']>[0]['registration'] | undefined;
  t.after(async () => {
    try { await drain?.(); (await close)?.(); } finally { rmSync(root, { recursive: true, force: true }); }
  });
  const id = await seedHistory(contentDbPath);
  const routes = new Map<string, Parameters<MountRoutineAdminRoute>[0]['spec']>();
  let sequence = 0;
  const host = await composeAssistantRoutines({
    launch: { desktopEligible: true }, workspaceId: OWNER.workspaceId, contentDbPath, openSqlite: openNativeSqlite,
    beforeStoreClose: ({ drain: run }) => { drain = run; }, onStoreClose: ({ registration }) => { close = registration; },
    assistantEnabled: true, onAssistantToggle: () => () => {}, runStarter: async () => assert.fail("no run was requested"),
    mountAdminRoute: ({ spec }) => { routes.set(`${spec.method} ${spec.path}`, spec); },
    now: () => NOW, newId: () => `id-${++sequence}`, timers: { schedule: () => () => {} },
    log: () => {}, writeBeacon: async () => ({ ok: true }), reporter: { record: () => assert.fail("no incident is expected") },
    policy: { releaseEnabled: true, access: async ({ actor }) => actor.principalId === OWNER.id && actor.workspaceId === OWNER.workspaceId },
  }, { monotonicNow: () => NOW });
  assert.equal(host.availability(), "ready");
  const route = routes.get(`get ${ROUTINE_ROUTE_BASE}/:id/runs`);
  assert.ok(route);
  const parsed = route.parse({ body: undefined, params: { id }, query: { limit: "1" } });
  assert.ok(parsed.ok);
  const result = await route.handle({ input: parsed.value, deps: {}, context: OWNER });
  assert.ok(result.ok);
  const { runs } = result.value as { runs: { runId: string }[] };
  assert.deepEqual(runs.map(run => run.runId), ["run-b"]);
});
