import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionOptions, ToolRegistration } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryDatabaseDestinationStore } from "../destination-store.js";
import { DatabaseTransferPlanStore } from "../plan-store.js";
import { buildDatabaseTransferRegistrations, type DatabaseTransferToolDeps } from "../tool-registrations.js";

const description = { host: "fixture", port: "5432", database: "fixture", user: "owner" };
function harness(options: { allow?: boolean; ttl?: number; version?: string; canCreate?: string } = {}) {
  const destinations = new InMemoryDatabaseDestinationStore();
  let now = 0;
  const plans = new DatabaseTransferPlanStore({ now: () => now });
  const surfaces = createSurfaceExchangeStore({ idleTtlMs: options.ttl ?? 100 });
  let captures = 0;
  let targetCalls = 0;
  const deps: DatabaseTransferToolDeps = {
    workspaceId: "ws",
    authorize: async () => ({ allowed: options.allow ?? true, reason: "test" }),
    databaseTransferPlanStore: plans,
    databaseTransferDestinationStore: destinations,
    databaseTransferFailureLog: () => undefined,
    dbOps: {
      getCapabilities: async () => ({ restorePoint: { costClass: "cheap", kind: "file-snapshot" } }),
      captureRestorePoint: async () => { captures++; throw new Error("snapshot unavailable"); },
      restoreFromArtifact: async () => { throw new Error("must never restore"); },
    },
    databaseTransferTarget: () => {
      targetCalls++;
      return {
        describe: () => description,
        query: async (sql) => {
          if (sql.includes("current_setting")) return { ok: true, value: [[options.version ?? "140000", options.canCreate ?? "t"]] };
          if (sql.includes("pg_class") || sql.includes("pg_namespace")) return { ok: true, value: [] };
          assert.fail(`unexpected query: ${sql}`);
        },
        runScript: async () => { assert.fail("must not write a destination"); },
      };
    },
  };
  const tools = new Map(buildDatabaseTransferRegistrations(deps, { surfaceExchanges: surfaces }).map((tool) => [tool.descriptor.id, tool]));
  const plan = plans.save({ principalId: "owner", workspaceId: "ws", content: { connectionString: "postgresql://owner@fixture/db", destination: description, replaces: "prior-copy", snapshot: Buffer.alloc(0), snapshotAt: "x", site: "ws", schema: "tovu", tableCount: 0, rowCount: 0, leftOut: [] } });
  return { tools, plan, plans, surfaces, destinations, expire: () => { now = 600001; }, captures: () => captures, targetCalls: () => targetCalls };
}
// Like the daemon's ToolExecutor: emitSurface is the handler's optional second argument, not a ctx field.
function call(tool: ToolRegistration, input: unknown, signal = new AbortController().signal, emitSurface: NonNullable<ToolExecutionOptions["emitSurface"]> = async () => undefined) {
  return tool.handler({ executionId: "exec", run: { id: "run" }, principal: { id: "owner" }, input, signal }, { emitSurface });
}

test("every registration refuses denied permission before snapshots, forms, plan consumption or destination access", async () => {
  const h = harness({ allow: false });
  for (const [id, tool] of h.tools) {
    await assert.rejects(async () => call(tool, id === "database_transfer_run" ? { planId: h.plan.planId } : {}, undefined, async () => assert.fail("a denied call must not emit")), /DATABASE_TRANSFER_FORBIDDEN/);
  }
  assert.equal(h.captures(), 0);
  assert.equal(h.targetCalls(), 0);
  assert.equal(h.surfaces.size(), 0);
  assert.equal((await h.destinations.get("ws")), null);
  assert.equal(h.plans.take({ planId: h.plan.planId, principalId: "owner", workspaceId: "ws" }).ok, true);
});

for (const id of ["database_transfer_run", "database_transfer_set_destination"]) {
  test(`${id}: an already-aborted execution emits nothing and abandons without a write`, async () => {
    const h = harness();
    const controller = new AbortController();
    controller.abort();
    const emitted: unknown[] = [];
    const result = await call(h.tools.get(id)!, id === "database_transfer_run" ? { planId: h.plan.planId } : {}, controller.signal, async (surface) => { emitted.push(surface); });
    assert.deepEqual(result, id === "database_transfer_run" ? { copied: false, cancelled: false, reason: "abandoned" } : { saved: false, reason: "abandoned" });
    assert.deepEqual(emitted, []);
    assert.equal(h.surfaces.size(), 0);
    assert.equal(h.targetCalls(), 0);
    assert.equal(await h.destinations.get("ws"), null);
  });
  test(`${id}: abort after opening abandons the exchange without a write`, async () => {
    const h = harness();
    const controller = new AbortController();
    const result = await call(h.tools.get(id)!, id === "database_transfer_run" ? { planId: h.plan.planId } : {}, controller.signal, async () => { controller.abort(); });
    assert.deepEqual(result, id === "database_transfer_run" ? { copied: false, cancelled: false, reason: "abandoned" } : { saved: false, reason: "abandoned" });
    assert.equal(h.surfaces.size(), 0);
    assert.equal(h.targetCalls(), 0);
  });
  test(`${id}: an unanswered exchange expires without a write`, async () => {
    const h = harness({ ttl: 20 });
    const result = await call(h.tools.get(id)!, id === "database_transfer_run" ? { planId: h.plan.planId } : {});
    assert.deepEqual(result, id === "database_transfer_run" ? { copied: false, cancelled: false, reason: "expired" } : { saved: false, reason: "expired" });
    assert.equal(h.targetCalls(), 0);
  });
}

test("an expired plan is refused before emitting a card", async () => {
  const h = harness();
  h.expire();
  const result = await call(h.tools.get("database_transfer_run")!, { planId: h.plan.planId }, undefined, async () => assert.fail("must not emit"));
  assert.equal((result as { code: string }).code, "PLAN_EXPIRED");
  assert.equal(h.targetCalls(), 0);
});

for (const [options, code, captures] of [
  [{ version: "130000" }, "SERVER_TOO_OLD", 0],
  [{ canCreate: "f" }, "NO_CREATE_PERMISSION", 0],
  [{}, "DATABASE_SNAPSHOT_FAILED", 1],
] as const) {
  test(`plan refuses ${code} without saving a plan or writing`, async () => {
    const h = harness(options);
    await h.destinations.save("ws", { connectionString: "postgresql://owner@fixture/db", description, savedAt: "x" });
    const result = await call(h.tools.get("database_transfer_plan")!, {});
    assert.equal((result as { code: string }).code, code);
    assert.equal(h.captures(), captures);
    assert.equal(h.surfaces.size(), 0);
  });
}
