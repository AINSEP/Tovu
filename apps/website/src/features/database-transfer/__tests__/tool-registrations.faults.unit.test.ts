import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtemp, readdir, rm, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ToolExecutionOptions, ToolRegistration } from "@jini-ai/core";
import { MCP_UI_EXPIRES_AT_META_KEY, type UIResource } from "@jini-ai/ui/mcp-ui/surfaces";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { InMemoryDatabaseDestinationStore } from "../destination-store.js";
import { DatabaseTransferPlanStore } from "../plan-store.js";
import { buildDatabaseTransferRegistrations, contributeDatabaseTransferTools, databaseTransferDerivedRisk, type DatabaseTransferToolDeps } from "../tool-registrations.js";
import { openPreparedContentDb } from "../../../platform/db/sqlite/__tests__/helpers/open-prepared-content-db.js";
import { openMemorySqliteKernel } from "../../../platform/db/kernel/drivers/sqlite.js";
import type { ContentDatabase } from "../../../platform/db/content-database.generated.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


const description = { host: "fixture", port: "5432", database: "fixture", user: "owner" };
function harness(options: { allow?: boolean; ttl?: number; version?: string; canCreate?: string } = {}, overrides: Partial<DatabaseTransferToolDeps> = {}) {
  const destinations = new InMemoryDatabaseDestinationStore();
  let now = 0;
  const plans = new DatabaseTransferPlanStore({ now: () => now });
  const surfaces = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, { idleTtlMs: options.ttl ?? 100 });
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
    ...overrides,
  };
  const tools = new Map(buildDatabaseTransferRegistrations(deps, { surfaceExchanges: surfaces }).map((tool) => [tool.descriptor.id, tool]));
  const plan = plans.save({ principalId: "owner", workspaceId: "ws", content: { connectionString: "postgresql://owner@fixture/db", destination: description, replaces: "prior-copy", snapshot: Buffer.alloc(0), snapshotAt: "x", site: "ws", schema: "tovu", tableCount: 0, rowCount: 0, leftOut: [] } });
  return { tools, plan, plans, surfaces, destinations, deps, expire: () => { now = 600001; }, captures: () => captures, targetCalls: () => targetCalls };
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

test("database_transfer_run's confirmation card carries its exchange deadline, like every requireHumanConfirm card", async () => {
  const h = harness();
  const controller = new AbortController();
  const before = Date.now();
  const emitted: unknown[] = [];
  await call(h.tools.get("database_transfer_run")!, { planId: h.plan.planId }, controller.signal, async (surface) => { emitted.push(surface); controller.abort(); });
  const resource = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource;
  assert.ok(Number(resource._meta?.[MCP_UI_EXPIRES_AT_META_KEY]) >= before + 100, "the card must carry its countdown deadline");
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

test("the contributor exposes the same transfer builder and declared risks", () => {
  const contributor = contributeDatabaseTransferTools();
  assert.equal(contributor.domain, "database-transfer");
  assert.equal(contributor.build, buildDatabaseTransferRegistrations);
  assert.equal(contributor.risk, databaseTransferDerivedRisk);
});

/** Real migrated content is shared with the real snapshot reader; only the destination is a fake. */
async function snapshotHarness(t: test.TestContext, overrides: Partial<DatabaseTransferToolDeps> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "tovu-transfer-adapter-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const content = await openPreparedContentDb(join(dir, "content.db"));
  const bytes = content.$client.serialize();
  content.$client.close();
  const logs: string[] = [];
  let captures = 0;
  const h = harness({}, {
    databaseTransferFailureLog: line => { logs.push(line); },
    dbOps: {
      getCapabilities: async () => ({ restorePoint: { costClass: "cheap", kind: "file-snapshot" } }),
      captureRestorePoint: async () => {
        const artifactRef = join(dir, `snapshot-${++captures}.db`);
        await writeFile(artifactRef, bytes);
        return { artifactRef, watermarkAtCapture: 1 };
      },
      restoreFromArtifact: async () => { throw new Error("copy must never restore"); },
    },
    ...overrides,
  });
  await h.destinations.save("ws", { connectionString: "postgresql://owner@fixture/db", description, savedAt: "x" });
  return { ...h, dir, logs };
}

function chatBytes() {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE ai_chats (id TEXT PRIMARY KEY); INSERT INTO ai_chats VALUES ('chat-one')");
    return db.serialize();
  } finally { db.close(); }
}

test("planning combines the real content catalog with the injected chat snapshot", async t => {
  const h = await snapshotHarness(t, { databaseTransferChatSnapshot: async () => chatBytes(), siteBinding: { name: "Named site" } });
  const result = await call(h.tools.get("database_transfer_plan")!, {}) as Record<string, unknown>;
  assert.equal(result.planned, true, JSON.stringify(result));
  assert.equal(result.rowCount, 2, "one watermark row and one conversation row are copied");
  assert.deepEqual(result.leftOut, []);
  const taken = h.plans.take({ planId: result.planId as string, principalId: "owner", workspaceId: "ws" });
  assert.equal(taken.ok, true);
  if (!taken.ok) assert.fail("a successful plan must be consumable");
  assert.equal(taken.plan.site, "Named site");
  assert.deepEqual(taken.plan.chatSnapshot, chatBytes());
  await assert.rejects(access(join(h.dir, "snapshot-1.db")), /ENOENT/);
  assert.deepEqual(h.logs, []);
});

test("a missing chat source is refused before a plan is stored", async t => {
  const h = await snapshotHarness(t);
  const result = await call(h.tools.get("database_transfer_plan")!, {});
  assert.deepEqual(result, { planned: false, code: "DATABASE_SNAPSHOT_FAILED",
    message: "the chat database could not be snapshotted; nothing was copied" });
  assert.deepEqual(h.logs, ["[database-transfer] chat snapshot failed: Error"]);
  assert.equal(h.targetCalls(), 1);
});

test("an in-memory content kernel cannot imply a sibling chat file", async t => {
  const db = openMemorySqliteKernel<ContentDatabase>();
  t.after(() => db.close());
  const h = await snapshotHarness(t, { db });
  assert.deepEqual(await call(h.tools.get("database_transfer_plan")!, {}), {
    planned: false, code: "DATABASE_SNAPSHOT_FAILED", message: "the chat database could not be snapshotted; nothing was copied",
  });
  assert.deepEqual(h.logs, ["[database-transfer] chat snapshot failed: Error"]);
});

for (const location of ["sibling", "override", "missing", "corrupt"] as const) {
  test(`the default chat backup uses the ${location} file without creating a missing source`, async t => {
    const previous = process.env.TOVU_CHAT_DB;
    t.after(() => { if (previous === undefined) delete process.env.TOVU_CHAT_DB; else process.env.TOVU_CHAT_DB = previous; });
    delete process.env.TOVU_CHAT_DB;
    const h = await snapshotHarness(t);
    const path = join(h.dir, location === "override" ? "chosen-chat.db" : "chat.db");
    if (location === "override") process.env.TOVU_CHAT_DB = path;
    if (location === "sibling" || location === "override") await writeFile(path, chatBytes());
    if (location === "corrupt") await writeFile(path, "this is not a SQLite database");
    const content = new Database(join(h.dir, "content.db"));
    t.after(() => content.close());
    const tools = new Map(buildDatabaseTransferRegistrations({ ...h.deps, db: content }, { surfaceExchanges: h.surfaces }).map(tool => [tool.descriptor.id, tool]));
    const chatTemps = async () => (await readdir(tmpdir())).filter(name => name.startsWith("tovu-transfer-chat-")).sort();
    const tempsBefore = await chatTemps();
    const result = await call(tools.get("database_transfer_plan")!, {}) as Record<string, unknown>;
    // F6 fix wave (L7 Stryker: the `finally` cleanup survived): success or failure, the backup's temp folder is removed.
    assert.deepEqual(await chatTemps(), tempsBefore, "the chat backup's temporary folder is always removed");
    if (location === "sibling" || location === "override") {
      assert.equal(result.planned, true, JSON.stringify(result));
      assert.equal(result.rowCount, 2);
      const taken = h.plans.take({ planId: result.planId as string, principalId: "owner", workspaceId: "ws" });
      assert.equal(taken.ok, true);
      if (!taken.ok) assert.fail("a successful plan must be consumable");
      assert.equal(taken.plan.site, "ws", "the workspace names a copy when no site binding exists");
      const copiedChat = new Database(taken.plan.chatSnapshot!);
      try { assert.deepEqual(copiedChat.prepare("SELECT id FROM ai_chats").all(), [{ id: "chat-one" }]); }
      finally { copiedChat.close(); }
      assert.deepEqual(h.logs, []);
    } else {
      assert.deepEqual(result, { planned: false, code: "DATABASE_SNAPSHOT_FAILED",
        message: "the chat database could not be snapshotted; nothing was copied" });
      assert.equal(h.logs.length, 1);
      assert.match(h.logs[0]!, /^\[database-transfer\] chat snapshot failed:/);
      if (location === "missing") await assert.rejects(access(path), /ENOENT/);
    }
  });
}

test("invalid credential controls are translated before reaching the destination adapter", async () => {
  const h = harness({ ttl: 60_000 });
  const emitted: UIResource[] = [];
  const pending = call(h.tools.get("database_transfer_set_destination")!, {}, undefined, async surface => {
    emitted.push((surface.payload as { resource: UIResource }).resource);
  });
  await new Promise<void>(resolve => setImmediate(resolve));
  const exchangeId = h.surfaces.findTypedAnswerTarget({ principalId: "owner", toolId: "database_transfer_set_destination" });
  assert.ok(exchangeId);
  const username = "fixture-private-username";
  const password = "fixture-private-password";
  assert.deepEqual(h.surfaces.deliver({ exchangeId, principalId: "owner", params: { address: `postgresql://${username}:${password}\u0000@fixture/db` } }), { ok: true });
  const result = await pending;
  assert.deepEqual(result, { saved: false, code: "INVALID_CONNECTION_STRING", message: "The token contains an invalid control character." });
  assert.equal(h.targetCalls(), 0);
  assert.equal(await h.destinations.get("ws"), null);
  assert.equal(emitted.length, 2);
  // The form script contains the comment "privately, outside DOM/HTML".
  const serialized = JSON.stringify({ result, emitted });
  assert.equal(serialized.includes(username), false);
  assert.equal(serialized.includes(password), false);
});

test("the default target rejects a non-Postgres URI without launching a connection", async () => {
  const h = harness({}, { databaseTransferTarget: undefined });
  await h.destinations.save("ws", { connectionString: "mysql://owner@fixture/db", description, savedAt: "x" });
  await assert.rejects(call(h.tools.get("database_transfer_plan")!, {}), /DATABASE_TRANSFER_INVALID_CONNECTION_STRING/);
  assert.equal(h.captures(), 0);
});

test("the default failure logger reports snapshot failures through console without leaking addresses", async t => {
  const lines: string[] = [];
  t.mock.method(console, "warn", (line: string) => { lines.push(line); });
  const h = harness({}, { databaseTransferFailureLog: undefined });
  await h.destinations.save("ws", { connectionString: "postgresql://owner@fixture/db", description, savedAt: "x" });
  assert.deepEqual(await call(h.tools.get("database_transfer_plan")!, {}), {
    planned: false, code: "DATABASE_SNAPSHOT_FAILED", message: "the site database could not be snapshotted; nothing was copied",
  });
  assert.deepEqual(lines, ["[database-transfer] snapshot failed: Error"]);
});

test("compositions without explicit plan or destination stores can read their empty default inventory", async () => {
  const h = harness({}, { databaseTransferPlanStore: undefined, databaseTransferDestinationStore: undefined });
  assert.deepEqual(await call(h.tools.get("database_transfer_status")!, {}), {
    destination: null, lastRun: null, copyOnDestination: null,
  });
  assert.equal(h.targetCalls(), 0);
});
