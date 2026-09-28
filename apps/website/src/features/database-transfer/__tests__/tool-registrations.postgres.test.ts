import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import type { UIResource } from "#src/assistant/index";
import type { DbOpsPort, RestoreCapability } from "#src/contracts/core/gated-mutations/ports";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { connectionFor, dropDatabase, recreateDatabase, sql } from "./pg-test-db.js";
import { DatabaseTransferPlanStore } from "../plan-store.js";
import { buildDatabaseTransferRegistrations, type DatabaseTransferToolDeps } from "../tool-registrations.js";

/**
 * @file `database_transfer_plan` / `database_transfer_run` driven through the real registrations,
 * against a REAL local Postgres (see `copy-engine.postgres.test.ts`): a real `SurfaceExchangeStore`
 * answered with `deliver(...)` (the human's click), a fake `DbOpsPort` whose restore point is a
 * migrated fixture database, and the real `psql` target.
 *
 * Owns: the plan writes nothing and raises no card; the run writes nothing until Copy; the connection
 * string (with its password) never appears in any result, card or log line.
 *
 * Set `DATABASE_TRANSFER_CARD_OUT=<file.html>` to save the rendered card for a screenshot.
 */

const FIXTURE_DB = `tovu_transfer_tools_${process.pid}`;
const PASSWORD = "PW-SENTINEL-4f1c";
const CONNECTION = connectionFor(FIXTURE_DB, PASSWORD);
const WORKSPACE_ID = "ws-transfer";
const OWNER = "principal-owner";

class FakeDbOps implements DbOpsPort {
  captures = 0;
  constructor(private readonly dir: string) {}
  async getCapabilities(): Promise<{ restorePoint: RestoreCapability }> {
    return { restorePoint: { costClass: "cheap", kind: "file-snapshot" } };
  }
  async captureRestorePoint(): Promise<{ artifactRef: string; watermarkAtCapture: number }> {
    this.captures += 1;
    const artifactRef = path.join(this.dir, `restore-point-${this.captures}.db`);
    const db = openContentDb(artifactRef);
    db.$client.prepare("INSERT INTO menus (id, workspace_id, slug, title, status, doc_json, locations_json, updated_at, version) VALUES ('m1', 'ws', 'main', 'Main', 'published', '{}', '[]', '2026-09-27T00:00:00.000Z', 1)").run();
    db.$client.prepare("INSERT INTO identity_users (principal_id, workspace_id, username, password_hash) VALUES ('p1', 'ws', 'owner', 'hash')").run();
    db.$client.close();
    return { artifactRef, watermarkAtCapture: 1 };
  }
  async restoreFromArtifact(): Promise<{ restartRequired: boolean }> {
    throw new Error("a copy must never restore");
  }
}

function harness(t: test.TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-transfer-tools-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const logs: string[] = [];
  const dbOps = new FakeDbOps(dir);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deps: DatabaseTransferToolDeps = {
    authorize: async () => ({ allowed: true, reason: "test" }),
    workspaceId: WORKSPACE_ID,
    dbOps,
    siteBinding: { name: "fixture-site" },
    databaseTransferPlanStore: new DatabaseTransferPlanStore(),
    databaseTransferFailureLog: (line) => logs.push(line),
  };
  const tools = new Map(buildDatabaseTransferRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
  return { dbOps, surfaceExchanges, logs, planTool: tools.get("database_transfer_plan")!, runTool: tools.get("database_transfer_run")! };
}

function call(tool: ToolRegistration, input: unknown, emitSurface?: SurfaceEmitter): Promise<Record<string, unknown>> {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: OWNER },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
    ...(emitSurface ? { emitSurface } : {}),
  };
  return Promise.resolve(tool.handler(ctx)) as Promise<Record<string, unknown>>;
}

async function raiseCard(h: ReturnType<typeof harness>, planId: string) {
  const emitted: unknown[] = [];
  const pending = call(h.runTool, { planId }, async (s) => void emitted.push(s));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the run must raise exactly one card before it waits");
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  const exchangeId = new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`).exec(ui.resource.text)![1]!;
  return { pending, html: ui.resource.text, exchangeId };
}

async function tovuExists(): Promise<boolean> {
  return (await sql(FIXTURE_DB, "SELECT to_regnamespace('tovu') IS NOT NULL")) === "t";
}

test.before(() => recreateDatabase(FIXTURE_DB));
test.after(() => dropDatabase(FIXTURE_DB));

test("plan counts without writing; Copy on the card copies exactly the plan; the password never shows", async (t) => {
  const h = harness(t);
  const plan = await call(h.planTool, { connectionString: CONNECTION }, async () => assert.fail("the plan must never raise a card"));
  assert.equal(plan.planned, true, JSON.stringify(plan));
  assert.deepEqual(plan.destination, { host: "localhost", port: "5432", database: FIXTURE_DB, user: process.env.PGUSER ?? "la" });
  assert.equal(plan.replaces, null);
  assert.equal(plan.rowCount, 2, "menus + the database_write_watermark row; identity_users is left out");
  assert.deepEqual(plan.leftOut, [{ table: "identity_users", rows: 1, reason: "logins (password hashes, sessions and sign-in links) are not copied" }]);
  assert.equal(await tovuExists(), false, "the plan must write nothing");

  const { pending, html, exchangeId } = await raiseCard(h, plan.planId as string);
  if (process.env.DATABASE_TRANSFER_CARD_OUT) writeFileSync(process.env.DATABASE_TRANSFER_CARD_OUT, html);
  assert.match(html, /Copy this site/);
  assert.match(html, /keeps running on its built-in storage/);
  assert.equal(await tovuExists(), false, "nothing may be written before Copy");
  h.surfaceExchanges.deliver({ exchangeId, toolId: "database_transfer_run", principalId: OWNER, params: { decision: "confirm" } });
  const result = await pending;
  assert.equal(result.copied, true, JSON.stringify(result));
  assert.equal(result.rowCount, 2);
  assert.equal((await sql(FIXTURE_DB, "SELECT count(*) FROM tovu.menus")), "1");
  assert.equal((await sql(FIXTURE_DB, "SELECT site FROM tovu._tovu_transfer")), "fixture-site");

  for (const text of [JSON.stringify(plan), JSON.stringify(result), html, ...h.logs]) assert.doesNotMatch(text, new RegExp(PASSWORD));

  const again = await call(h.planTool, { connectionString: CONNECTION });
  assert.equal(again.replaces, plan.snapshotAt, "a second plan says which copy it replaces");
});

test("Cancel writes nothing, and a used planId is gone", async (t) => {
  await sql(FIXTURE_DB, "DROP SCHEMA IF EXISTS tovu CASCADE");
  const h = harness(t);
  const plan = await call(h.planTool, { connectionString: CONNECTION });
  const { pending, exchangeId } = await raiseCard(h, plan.planId as string);
  h.surfaceExchanges.deliver({ exchangeId, toolId: "database_transfer_run", principalId: OWNER, params: { decision: "cancel" } });
  assert.deepEqual(await pending, { copied: false, cancelled: true });
  assert.equal(await tovuExists(), false);
  const reused = await call(h.runTool, { planId: plan.planId }, async () => undefined);
  assert.equal(reused.code, "PLAN_NOT_FOUND");
});

test("a malformed connection string and an unreachable server are refused without quoting the string or taking a snapshot", async (t) => {
  const h = harness(t);
  const err = await call(h.planTool, { connectionString: `mysql://root:${PASSWORD}@x/db` }).then(
    () => assert.fail("expected a refusal"),
    (e: unknown) => e
  );
  assert.ok(err instanceof ToolInputError);
  assert.match(err.message, /DATABASE_TRANSFER_INVALID_CONNECTION_STRING/);
  assert.doesNotMatch(err.message, new RegExp(PASSWORD));

  const unreachable = await call(h.planTool, { connectionString: `postgresql://la:${PASSWORD}@127.0.0.1:1/nowhere` });
  assert.equal(unreachable.planned, false);
  assert.equal(unreachable.code, "UNREACHABLE");
  assert.doesNotMatch(JSON.stringify(unreachable), new RegExp(PASSWORD));
  assert.equal(h.dbOps.captures, 0, "a refused plan costs no snapshot");
});
