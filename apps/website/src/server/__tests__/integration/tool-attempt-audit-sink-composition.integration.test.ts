import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { createSqliteRouteDeps } from "../../runtime/composition/deps.js";
import { createAssistantByokModule } from "../../runtime/composition/modules/assistant-byok.js";
import { SEARCH_TOOLS_TOOL_ID } from "#src/assistant/tool-catalog-audit";
import { SqliteToolAttemptAuditSink } from "#src/features/tool-audit/repo.sqlite";
import type { ToolAttemptAuditSink, ToolAttemptEvent } from "#src/features/tool-audit/types";
import { agentToolAttempts } from "#src/platform/db/schema";
import { openContentDb } from "#src/platform/db/sqlite/content-db";

/**
 * @file Pins the composition seam for `RouteDeps.toolAttemptAuditSink` — the port that replaced
 * `RouteDeps.contentDbPath` on 2026-09-06 (review finding F2,
 * `ADS-memory/reports/2026-09-06-review-architecture.md`).
 *
 * The property under test: the tool-attempt audit sink is CONSTRUCTED BY A COMPOSITION ROOT and
 * injected, so `modules/assistant-byok.ts` neither reads `process.env.TOVU_DB` nor calls
 * `openContentDb` for itself. That matters beyond tidiness because `openContentDb` runs `migrate()`
 * unconditionally, so a module that opens its own handle turns "this module was constructed" into
 * "a database was migrated" — and every `createApp()` constructs this module: the serving app, every
 * export and published-page fetch (`routeDeps.createSiteApp()`), and every test that builds an app.
 *
 * Both arms are covered on purpose (the repo's documented "fix lands in one arm, siblings left
 * broken" failure mode): the real SQLite root AND `app.ts`'s hermetic in-memory root.
 */

const APPENDED_EVENT: ToolAttemptEvent = {
  attemptId: "attempt-audit-sink-composition-1",
  executionId: null,
  workspaceId: "workspace-local",
  runId: "run-audit-sink-composition-1",
  toolId: "workspace_get",
  principalId: "principal-audit-sink-composition-1",
  phase: "completed",
  at: "2026-09-06T00:00:00.000Z",
  detail: null,
};

/** Mirrors `create-sqlite-route-deps-overrides.integration.test.ts`'s identical helper. */
function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("createSqliteRouteDeps composes the SQLite audit sink itself, over the SAME content.db it opened", async () => {
  const dir = mkTempDir("tovu-audit-sink-sqlite-");
  const dbPath = path.join(dir, "content.db");
  let deps: ReturnType<typeof createSqliteRouteDeps> | undefined;
  try {
    deps = createSqliteRouteDeps(dbPath);

    assert.ok(
      deps.toolAttemptAuditSink instanceof SqliteToolAttemptAuditSink,
      "the real composition root must construct the SQLite sink itself, not hand a path to a consumer",
    );

    await deps.toolAttemptAuditSink.append(APPENDED_EVENT);

    const rows = openContentDb(dbPath).select().from(agentToolAttempts).all();
    assert.equal(rows.length, 1, "the appended attempt must land in the database this root opened");
    assert.equal(rows[0]?.attemptId, APPENDED_EVENT.attemptId);
    assert.equal(rows[0]?.toolId, "workspace_get");

  } finally {
    // This root's data-module installs are fire-and-forget `*Ready` promises; deleting the temp dir
    // out from under one in flight makes it log a real failure ("unable to open database file")
    // that has nothing to do with what this test asserts. Let them settle first.
    if (deps) {
      await Promise.allSettled(
        Object.entries(deps)
          .filter(([key, value]) => key.endsWith("Ready") && value instanceof Promise)
          .map(([, value]) => value as Promise<unknown>),
      );
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the SQLite audit sink follows the root's OWN ContentDb HANDLE, not its dbPath — the install-dir `serve` shape", async () => {
  const dir = mkTempDir("tovu-audit-sink-handle-");
  const handleDbPath = path.join(dir, "handle.db");
  const neverOpenedDbPath = path.join(dir, "never-opened.db");
  let deps: ReturnType<typeof createSqliteRouteDeps> | undefined;
  try {
    // `overrides.db` is `cli/commands/serve.ts`'s real install-dir path (`boot-site-dir.ts` has
    // already opened and migrated the handle), and in that branch `dbPath` is never opened at all.
    // So a sink built from `openContentDb(dbPath)` instead of from the handle would write to — and
    // create — a DIFFERENT file. That is what distinguishes injecting the port from threading a path.
    const handle = openContentDb(handleDbPath);
    deps = createSqliteRouteDeps(neverOpenedDbPath, { db: handle, workspaceId: "workspace-local" });

    await deps.toolAttemptAuditSink.append(APPENDED_EVENT);

    const rows = handle.select().from(agentToolAttempts).all();
    assert.equal(rows.length, 1, "the appended attempt must land in the handle the root was given");
    assert.equal(rows[0]?.attemptId, APPENDED_EVENT.attemptId);
    assert.equal(
      fs.existsSync(neverOpenedDbPath),
      false,
      "nothing may open the dbPath in this branch — a sink built from the path rather than the handle would create it",
    );
  } finally {
    if (deps) {
      await Promise.allSettled(
        Object.entries(deps)
          .filter(([key, value]) => key.endsWith("Ready") && value instanceof Promise)
          .map(([, value]) => value as Promise<unknown>),
      );
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("app.ts's hermetic root composes the in-memory audit sink — it owns no content.db to write to", () => {
  const deps = createRouteDeps();
  const sink = deps.toolAttemptAuditSink as ToolAttemptAuditSink & { events?: readonly ToolAttemptEvent[] };

  assert.ok(sink, "the hermetic composition root must supply a sink of its own");
  assert.ok(
    Array.isArray(sink.events),
    "the hermetic root must get `createInMemoryToolAttemptAuditSink()` (its `events` read surface), not a SQLite sink",
  );
  assert.ok(
    !(deps.toolAttemptAuditSink instanceof SqliteToolAttemptAuditSink),
    "the hermetic root has no real content.db, so it must never compose the SQLite sink",
  );
});

test("createAssistantByokModule logs meta-tool attempts through the INJECTED sink and opens no database of its own", async () => {
  const dir = mkTempDir("tovu-audit-sink-byok-");
  const decoyDbPath = path.join(dir, "content.db");
  const originalContentDb = process.env.TOVU_CONTENT_DB;
  const originalTovuDb = process.env.TOVU_DB;

  // Not "memory": the branch this module used to take on `process.env.TOVU_DB` is the one that
  // opened a real handle. `TOVU_CONTENT_DB` is where that handle used to land (it is what
  // `defaultContentDbPath()` returns, and what the deleted `RouteDeps.contentDbPath` carried), so
  // a file appearing at `decoyDbPath` is direct evidence the module opened a database itself.
  process.env.TOVU_CONTENT_DB = decoyDbPath;
  delete process.env.TOVU_DB;

  try {
    const recorded: ToolAttemptEvent[] = [];
    const deps = createRouteDeps();
    (deps as { toolAttemptAuditSink: ToolAttemptAuditSink }).toolAttemptAuditSink = {
      append: async (event: ToolAttemptEvent) => {
        recorded.push(event);
      },
    };

    const module = createAssistantByokModule(deps);
    const result = await module.toolSurface.executeMetaTool(
      { id: "principal-byok-audit-1" },
      { id: "run-byok-audit-1" },
      { name: "search_tools", input: { query: "workspace" } },
    );
    assert.equal(result.isError, undefined, `search_tools must succeed; got: ${result.content}`);

    // `appendToolCatalogAttempt` fires the append without awaiting it (`void sink.append(...)`), so
    // yield once before asserting rather than racing the microtask that pushes the row.
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(recorded.length, 1, "the module must log the meta-tool attempt through routeDeps.toolAttemptAuditSink");
    assert.equal(recorded[0]?.toolId, SEARCH_TOOLS_TOOL_ID);
    assert.equal(recorded[0]?.principalId, "principal-byok-audit-1");
    assert.equal(recorded[0]?.runId, "run-byok-audit-1");

    assert.equal(
      fs.existsSync(decoyDbPath),
      false,
      "the module must not resolve TOVU_DB/TOVU_CONTENT_DB and open its own ContentDb — openContentDb migrates unconditionally",
    );
  } finally {
    if (originalContentDb === undefined) delete process.env.TOVU_CONTENT_DB;
    else process.env.TOVU_CONTENT_DB = originalContentDb;
    if (originalTovuDb === undefined) delete process.env.TOVU_DB;
    else process.env.TOVU_DB = originalTovuDb;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
