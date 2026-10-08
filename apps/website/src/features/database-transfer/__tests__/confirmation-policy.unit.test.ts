import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { openPreparedContentDb } from "../../../platform/db/sqlite/__tests__/helpers/open-prepared-content-db.js";
import { DatabaseTransferPlanStore } from "../plan-store.js";
import { InMemoryDatabaseDestinationStore } from "../destination-store.js";
import { buildDatabaseTransferRegistrations, type DatabaseTransferToolDeps } from "../tool-registrations.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


async function harness(t: test.TestContext, options: { replaces?: string; allowed?: boolean; targetExists?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "n06-transfer-"));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const db = await openPreparedContentDb(path.join(dir, "content.db"));
  db.$client.pragma("journal_mode = DELETE");
  const snapshot = db.$client.serialize();
  db.$client.close();
  const destination = {host: "fixture", port: "5432", database: "fixture", user: "owner"};
  const plans = new DatabaseTransferPlanStore();
  const plan = plans.save({principalId: "owner", workspaceId: "ws", content: {
    connectionString: "postgresql://owner@fixture/db", destination, snapshot, snapshotAt: "2026-10-01T00:00:00.000Z",
    replaces: options.replaces ?? null, site: "ws", schema: "tovu", tableCount: 0, rowCount: 0, leftOut: [],
  }});
  const scripts: string[] = [];
  const surfaces = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, { idleTtlMs: 20 });
  const deps: DatabaseTransferToolDeps = {
    workspaceId: "ws", authorize: async () => ({allowed: options.allowed ?? true, reason: "test"}),
    dbOps: {} as DatabaseTransferToolDeps["dbOps"], databaseTransferPlanStore: plans,
    databaseTransferDestinationStore: new InMemoryDatabaseDestinationStore(), databaseTransferFailureLog: () => undefined,
    databaseTransferTarget: () => ({describe: () => destination,
      query: async sql => {
        assert.match(sql, /SELECT unvalidated/);
        return {ok: true, value: [["[]"]]};
      },
      runScript: async chunks => {
        const sql = [...chunks].join("");
        scripts.push(sql);
        if (options.targetExists) return {ok: false, error: 'schema "tovu" already exists'};
        return {ok: true, value: null};
      },
    }),
  };
  const registration = buildDatabaseTransferRegistrations(deps, {surfaceExchanges: surfaces}).find(tool => tool.descriptor.id === "database_transfer_run")!;
  const ctx = {executionId: "exec", run: {id: "run"}, principal: {id: "owner"}, input: {planId: plan.planId}, signal: new AbortController().signal};
  return {registration, ctx, scripts, surfaces};
}

test("n06: a first database copy runs headlessly without deleting an existing destination", async t => {
  const h = await harness(t);
  const result = await h.registration.handler(h.ctx) as {copied: boolean; area: string};
  assert.equal(result.copied, true);
  assert.equal(result.area, "tovu");
  assert.equal(h.surfaces.size(), 0);
  assert.equal(h.scripts.length, 1);
  assert.match(h.scripts[0]!, /^BEGIN;/);
  assert.match(h.scripts[0]!, /CREATE SCHEMA "tovu";/);
  assert.doesNotMatch(h.scripts[0]!, /DROP SCHEMA/);
});

test("n06: replacing a prior copy still requires a confirmation channel", async t => {
  const h = await harness(t, {replaces: "2026-09-30T00:00:00.000Z"});
  await assert.rejects(h.registration.handler(h.ctx), /no interactive confirmation channel/);
  assert.deepEqual(h.scripts, []);
});

test("n06: replacement without an answer writes nothing", async t => {
  const h = await harness(t, {replaces: "2026-09-30T00:00:00.000Z"});
  const result = await h.registration.handler(h.ctx, {emitSurface: async () => undefined});
  assert.deepEqual(result, {copied: false, cancelled: false, reason: "expired"});
  assert.deepEqual(h.scripts, []);
});

test("n06: an unconfirmed first copy cannot replace a destination created since planning", async t => {
  const h = await harness(t, {targetExists: true});
  const result = await h.registration.handler(h.ctx) as {copied: boolean; code: string};
  assert.equal(result.copied, false);
  assert.equal(result.code, "COPY_FAILED");
  assert.equal(h.scripts.length, 1);
  assert.doesNotMatch(h.scripts[0]!, /DROP SCHEMA/);
});

test("n06: a first copy still enforces permission before any destination write", async t => {
  const h = await harness(t, {allowed: false});
  await assert.rejects(h.registration.handler(h.ctx), /DATABASE_TRANSFER_FORBIDDEN/);
  assert.deepEqual(h.scripts, []);
  assert.equal(h.surfaces.size(), 0);
});
