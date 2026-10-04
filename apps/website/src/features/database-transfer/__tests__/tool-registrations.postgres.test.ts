import Database from "better-sqlite3";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import type { UIResource } from "#src/assistant/index";
import type { DbOpsPort, RestoreCapability } from "#src/contracts/core/gated-mutations/ports";
import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import type { ContentDb } from "#src/platform/db/sqlite/content-db";
import { connectionFor, dropDatabase, recreateDatabase, sql } from "./pg-test-db.js";
import { InMemoryDatabaseDestinationStore } from "../destination-store.js";
import { DatabaseTransferPlanStore } from "../plan-store.js";
import { buildDatabaseTransferRegistrations, type DatabaseTransferToolDeps } from "../tool-registrations.js";
import { openPreparedContentDb } from "../../../platform/db/sqlite/__tests__/helpers/open-prepared-content-db.js";

/**
 * @file `database_transfer_plan` / `database_transfer_run` driven through the real registrations,
 * against a REAL local Postgres (see `copy-engine.postgres.test.ts`): a real `SurfaceExchangeStore`
 * answered with `deliver(...)` (the human's click), a fake `DbOpsPort` whose restore point is a
 * migrated fixture database, and the real `psql` target.
 *
 * Owns: the destination is typed by the human into a private form, never passed by the model; the
 * plan writes nothing and raises no card; a first run copies directly; replacement writes nothing until Copy; the connection string
 * (with its password) never appears in any result, card or log line.
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
    const db = await openPreparedContentDb(artifactRef);
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
    databaseTransferChatSnapshot: async () => {
      const chat = new Database(":memory:");
      try {
        chat.exec("CREATE TABLE ai_chats (id TEXT PRIMARY KEY); CREATE TABLE ai_chat_messages (id TEXT PRIMARY KEY, conversation_id TEXT REFERENCES ai_chats(id)); CREATE TABLE assistant_agent_sessions (id TEXT PRIMARY KEY); CREATE TABLE tovu_chat_migrations (id TEXT PRIMARY KEY)");
        return chat.serialize();
      } finally { chat.close(); }
    },
    databaseTransferPlanStore: new DatabaseTransferPlanStore(),
    databaseTransferDestinationStore: new InMemoryDatabaseDestinationStore(),
    databaseTransferFailureLog: (line) => logs.push(line),
  };
  const registrations = buildDatabaseTransferRegistrations(deps, { surfaceExchanges });
  const tools = new Map(registrations.map((r) => [r.descriptor.id, r]));
  return {
    dbOps,
    surfaceExchanges,
    logs,
    registrations,
    planTool: tools.get("database_transfer_plan")!,
    runTool: tools.get("database_transfer_run")!,
    destinationTool: tools.get("database_transfer_set_destination")!,
    statusTool: tools.get("database_transfer_status")!,
  };
}

/** The human pastes `address` into the private form `database_transfer_set_destination` raises. */
async function typeDestination(h: ReturnType<typeof harness>, params: Record<string, unknown>) {
  const emitted: { payload: { resource: UIResource } }[] = [];
  const pending = call(h.destinationTool, {}, async (s) => void emitted.push(s as { payload: { resource: UIResource } }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the tool must raise exactly one form before it waits");
  const form = emitted[0]!.payload.resource.resource.text;
  const exchangeId = new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`).exec(form)![1]!;
  h.surfaceExchanges.deliver({ exchangeId, toolId: "database_transfer_set_destination", principalId: OWNER, params });
  const result = await pending;
  const outcome = emitted[1]?.payload.resource.resource.text ?? "";
  return { result, form, outcome };
}

function call(tool: ToolRegistration, input: unknown, emitSurface?: SurfaceEmitter): Promise<Record<string, unknown>> {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: OWNER },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
  // Like the daemon's ToolExecutor: emitSurface is the handler's optional second argument, spread in only when supplied.
  return Promise.resolve(tool.handler(ctx, emitSurface ? { emitSurface } : {})) as Promise<Record<string, unknown>>;
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

function cardAction(html: string, action: "confirm" | "cancel") {
  const match = html.match(/var PLAN = (.+);/);
  assert.ok(match, "the card must carry its actual button actions");
  const rendered = JSON.parse(match[1]!)[action];
  assert.equal(rendered.toolName, "database_transfer_run");
  return rendered.params as Record<string, unknown>;
}

async function tovuExists(): Promise<boolean> {
  return (await sql(FIXTURE_DB, "SELECT to_regnamespace('tovu') IS NOT NULL")) === "t";
}

test.before(() => recreateDatabase(FIXTURE_DB));
test.after(() => dropDatabase(FIXTURE_DB));

test("first copy runs headlessly; replacement waits for Copy; the password never shows", async (t) => {
  const h = harness(t);
  await typeDestination(h, { address: CONNECTION });
  const plan = await call(h.planTool, {}, async () => assert.fail("the plan must never raise a card"));
  assert.equal(plan.planned, true, JSON.stringify(plan));
  assert.deepEqual(plan.destination, { host: "localhost", port: "5432", database: FIXTURE_DB, user: process.env.PGUSER ?? "la" });
  assert.equal(plan.replaces, null);
  assert.equal(plan.area, "tovu", "the first site in a database gets the default private schema");
  assert.equal(plan.rowCount, 2, "menus + the database_write_watermark row; identity_users is left out");
  assert.deepEqual(plan.leftOut, [{ table: "identity_users", rows: 1, reason: "logins (password hashes, sessions and sign-in links) are not copied" }]);
  assert.equal(await tovuExists(), false, "the plan must write nothing");

  const result = await call(h.runTool, { planId: plan.planId });
  assert.equal(result.copied, true, JSON.stringify(result));
  assert.equal(result.rowCount, 2);
  assert.equal(await sql(FIXTURE_DB, "SELECT count(*) FROM tovu.menus"), "1");
  assert.equal(await sql(FIXTURE_DB, "SELECT site FROM tovu._tovu_transfer"), "fixture-site");
  assert.equal(h.surfaceExchanges.size(), 0);

  const again = await call(h.planTool, {});
  assert.equal(again.replaces, plan.snapshotAt, "a second plan says which copy it replaces");
  const { pending, html, exchangeId } = await raiseCard(h, again.planId as string);
  if (process.env.DATABASE_TRANSFER_CARD_OUT) writeFileSync(process.env.DATABASE_TRANSFER_CARD_OUT, html);
  assert.match(html, /Copy this site/);
  assert.match(html, /keeps running on its built-in storage/);
  assert.match(html, /A private area named (&quot;|")tovu(&quot;|")/);
  assert.equal(await sql(FIXTURE_DB, "SELECT snapshot_at FROM tovu._tovu_transfer"), plan.snapshotAt, "the original copy stays intact before consent");
  h.surfaceExchanges.deliver({ exchangeId, toolId: "database_transfer_run", principalId: OWNER, params: cardAction(html, "confirm") });
  const replaced = await pending;
  assert.equal(replaced.copied, true);
  assert.equal(replaced.rowCount, 2);
  assert.equal(await sql(FIXTURE_DB, "SELECT snapshot_at FROM tovu._tovu_transfer"), again.snapshotAt);
  for (const text of [JSON.stringify(plan), JSON.stringify(result), JSON.stringify(replaced), html, ...h.logs]) assert.doesNotMatch(text, new RegExp(PASSWORD));
});

test("Cancel writes nothing, and a used planId is gone", async (t) => {
  await sql(FIXTURE_DB, "DROP SCHEMA IF EXISTS tovu CASCADE");
  const h = harness(t);
  await typeDestination(h, { address: CONNECTION });
  const first = await call(h.planTool, {});
  assert.equal((await call(h.runTool, { planId: first.planId })).copied, true);
  const plan = await call(h.planTool, {});
  const { pending, exchangeId, html } = await raiseCard(h, plan.planId as string);
  h.surfaceExchanges.deliver({ exchangeId, toolId: "database_transfer_run", principalId: OWNER, params: cardAction(html, "cancel") });
  assert.deepEqual(await pending, { copied: false, cancelled: true });
  assert.equal(await tovuExists(), true);
  assert.equal(await sql(FIXTURE_DB, "SELECT snapshot_at FROM tovu._tovu_transfer"), first.snapshotAt);
  const reused = await call(h.runTool, { planId: plan.planId }, async () => undefined);
  assert.equal(reused.code, "PLAN_NOT_FOUND");
});

test("the model never passes a connection string: no tool takes one, and the plan asks for the private form first", async (t) => {
  const h = harness(t);
  for (const registration of h.registrations) {
    assert.doesNotMatch(JSON.stringify(registration.descriptor.inputSchema ?? {}), /connection|address|password/i, registration.descriptor.id);
  }
  assert.deepEqual(await call(h.planTool, {}), {
    planned: false,
    code: "NO_DESTINATION",
    message: "no destination database is saved for this site yet",
    nextStep: "Call database_transfer_set_destination. It shows the human a private form for the database address; you never see it.",
  });
  assert.equal(h.dbOps.captures, 0, "no destination costs no snapshot");
});

test("the private form saves a reachable destination, and neither the form, its result nor the log shows the password", async (t) => {
  await sql(FIXTURE_DB, "DROP SCHEMA IF EXISTS tovu CASCADE");
  const h = harness(t);
  const { result, form, outcome } = await typeDestination(h, { address: CONNECTION });
  assert.deepEqual(result, { saved: true, destination: { host: "localhost", port: "5432", database: FIXTURE_DB, user: process.env.PGUSER ?? "la" }, replaces: null });
  assert.match(form, /<input class="mcpui-input" type="password" id="mcpui-field-address" name="address"/, "the address field is masked");
  assert.match(outcome, /Destination saved/);
  for (const text of [JSON.stringify(result), form, outcome, ...h.logs]) assert.doesNotMatch(text, new RegExp(PASSWORD));
  assert.equal((await call(h.planTool, {})).planned, true);
});

test("a malformed or unreachable address is refused in the form, nothing is saved, and the password is never quoted", async (t) => {
  const h = harness(t);
  const malformed = await typeDestination(h, { address: `mysql://root:${PASSWORD}@x/db` });
  assert.deepEqual(malformed.result, { saved: false, code: "INVALID_CONNECTION_STRING", message: "the connection string must start with postgres:// or postgresql://" });
  assert.match(malformed.outcome, /must start with postgres:\/\//);

  const unreachable = await typeDestination(h, { address: `postgresql://la:${PASSWORD}@127.0.0.1:1/nowhere` });
  assert.equal(unreachable.result.saved, false);
  assert.equal(unreachable.result.code, "UNREACHABLE");

  const cancelled = await typeDestination(h, { [SURFACE_DISMISSED_PARAM]: true });
  assert.deepEqual(cancelled.result, { saved: false, reason: "cancelled" });

  for (const text of [JSON.stringify([malformed, unreachable, cancelled]), ...h.logs]) assert.doesNotMatch(text, new RegExp(PASSWORD));
  assert.equal((await call(h.planTool, {})).code, "NO_DESTINATION", "a refused address is never saved");
  assert.equal(h.dbOps.captures, 0);
});

test("database_transfer_status reports the saved destination, this process's last run and the copy found there", async (t) => {
  await sql(FIXTURE_DB, "DROP SCHEMA IF EXISTS tovu CASCADE");
  const h = harness(t);
  assert.deepEqual(await call(h.statusTool, {}), { destination: null, lastRun: null, copyOnDestination: null });

  await typeDestination(h, { address: CONNECTION });
  const plan = await call(h.planTool, {});
  assert.equal((await call(h.runTool, { planId: plan.planId })).copied, true);

  const status = await call(h.statusTool, {});
  assert.deepEqual(status.destination, { host: "localhost", port: "5432", database: FIXTURE_DB, user: process.env.PGUSER ?? "la" });
  assert.deepEqual(status.lastRun, { copied: true, snapshotAt: plan.snapshotAt, tableCount: plan.tableCount, rowCount: 2 });
  assert.deepEqual(status.copyOnDestination, { site: "fixture-site", snapshotAt: plan.snapshotAt });
  assert.doesNotMatch(JSON.stringify(status), new RegExp(PASSWORD));
});
