/** j03: disposable fixtures only. Drive the real host snapshot adapter through the tool ports. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import type { ToolExecutionContext } from "@jini-ai/core";
import { openPreparedContentDb } from "../../../platform/db/sqlite/__tests__/helpers/open-prepared-content-db.js";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { buildDatabaseTransferRegistrations, type DatabaseTransferToolDeps } from "../tool-registrations.js";
import { DatabaseTransferPlanStore } from "../plan-store.js";
import { InMemoryDatabaseDestinationStore } from "../destination-store.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


const ctx = (input: unknown = {}): ToolExecutionContext => ({ input, executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, signal: new AbortController().signal });

test("planning backs up chat.db read-only, discloses its rows, and running uses the captured bytes after source changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "transfer-snapshots-"));
  const content = await openPreparedContentDb(join(dir, "content.db"));
  const chatPath = join(dir, "chat.db");
  const chat = new Database(chatPath);
  const previousChatPath = process.env.TOVU_CHAT_DB;
  process.env.TOVU_CHAT_DB = chatPath; // Never inherit a live-site path, even when the owner has one configured.
  try {
    chat.exec(`CREATE TABLE ai_chats (id TEXT PRIMARY KEY);
      CREATE TABLE ai_chat_messages (id TEXT PRIMARY KEY, conversation_id TEXT REFERENCES ai_chats(id));
      CREATE TABLE assistant_agent_sessions (id TEXT PRIMARY KEY);
      CREATE TABLE tovu_chat_migrations (id TEXT PRIMARY KEY);
      INSERT INTO ai_chats VALUES ('captured-parent');
      INSERT INTO ai_chat_messages VALUES ('captured-message', 'captured-parent');
      INSERT INTO assistant_agent_sessions VALUES ('captured-session');`);
    const before = await readFile(chatPath);
    const destination = new InMemoryDatabaseDestinationStore();
    const description = { host: "fixture", database: "fixture", port: "5432", user: "owner" };
    await destination.save("ws", { connectionString: "postgresql://owner@fixture/db", description, savedAt: "fixed" });
    const plans = new DatabaseTransferPlanStore();
    let script = "";
    const deps: DatabaseTransferToolDeps = {
      workspaceId: "ws", db: content, authorize: async () => ({ allowed: true, reason: "test" }),
      databaseTransferDestinationStore: destination, databaseTransferPlanStore: plans,
      databaseTransferFailureLog: () => {},
      dbOps: {
        getCapabilities: async () => ({ restorePoint: { costClass: "cheap", kind: "file-snapshot" } }),
        captureRestorePoint: async () => {
          const artifactRef = join(dir, "content-snapshot.db");
          await content.$client.backup(artifactRef);
          return { artifactRef, watermarkAtCapture: 0 };
        },
        restoreFromArtifact: async () => { assert.fail("copy cannot restore"); },
      },
      databaseTransferTarget: () => ({ describe: () => description,
        query: async sql => ({ ok: true, value: sql.includes("current_setting") ? [["140000", "t"]] : sql.includes("SELECT unvalidated") ? [["[]"]] : [] }),
        runScript: async chunks => { script = [...chunks].join(""); return { ok: true, value: null }; },
      }),
    };
    const tools = new Map(buildDatabaseTransferRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) }).map(tool => [tool.descriptor.id, tool]));
    const planned = await tools.get("database_transfer_plan")!.handler(ctx()) as { planned: boolean; planId: string; rowCount: number };
    assert.equal(planned.planned, true);
    assert.ok(planned.rowCount >= 3);
    assert.deepEqual(await readFile(chatPath), before, "read-only backup must not migrate/configure/write its source");
    chat.exec("INSERT INTO ai_chats VALUES ('after-plan-parent'); INSERT INTO assistant_agent_sessions VALUES ('after-plan-session')");
    const result = await tools.get("database_transfer_run")!.handler(ctx({ planId: planned.planId })) as { copied: boolean; tables: { name: string; rows: number }[] };
    assert.equal(result.copied, true);
    for (const table of ["ai_chats", "ai_chat_messages", "assistant_agent_sessions"]) assert.deepEqual(result.tables.find(t => t.name === table), { name: table, rows: 1 });
    assert.match(script, /captured-message/);
    assert.doesNotMatch(script, /after-plan-parent|after-plan-session|CREATE TABLE "tovu"\."tovu_chat_migrations"/);
    assert.equal(plans.take({ planId: planned.planId, principalId: "owner", workspaceId: "ws" }).ok, false);
  } finally {
    if (previousChatPath === undefined) delete process.env.TOVU_CHAT_DB; else process.env.TOVU_CHAT_DB = previousChatPath;
    content.$client.close(); chat.close(); await rm(dir, { recursive: true, force: true });
  }
});
