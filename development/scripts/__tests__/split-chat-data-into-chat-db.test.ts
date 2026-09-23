import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { openContentDb, openContentDbReadOnly } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { openChatDb } from "../../../apps/website/src/platform/db/sqlite/chat-db.js";
import { workspaces } from "../../../apps/website/src/platform/db/schema.sqlite.js";
import { readChatSplitPlan, reportDryRun, applyChatSplit } from "../split-chat-data-into-chat-db.js";

/**
 * @file Real-database-state proof for `split-chat-data-into-chat-db.ts`. Every assertion below
 * reads a real SQLite file through an INDEPENDENT connection from the one the code under test
 * used — never the script's own log output — per this task's own instruction: three tests in this
 * repo passed all afternoon while every dry run migrated a live database, precisely because they
 * only checked logs. This is that exact bug class, guarded against directly.
 *
 * Covers the "transfer workflow" adversarial cases named for this task: retry duplication (apply
 * twice), a partial-invalid-batch/conflicting-row case (a pre-existing destination row with
 * different content under the same primary key), and the untouched-sibling-table case (a real
 * content table must survive both a dry run and an apply unchanged).
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "split-chat-data-into-chat-db.ts");

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Seeds a fresh content.db with one workspace (the "must survive untouched" content row) and one
 *  conversation carrying a message and an agent-session row across all three chat tables.
 *
 *  `openContentDb` (`fix(db): drop empty legacy chat tables from content.db on open`, 5a189cb2a)
 *  now drops `ai_chats`/`ai_chat_messages`/`assistant_agent_sessions` the moment they're empty —
 *  i.e. immediately, for any freshly created content.db — so by the time this function would
 *  `INSERT` into them they no longer exist. Reopen the same file through `openChatDb` first (byte-
 *  identical DDL to migrations 0023/0051, per that commit's own fixture fix for
 *  `duplicate-content-db.integration.test.ts`/`duplicate-site.integration.test.ts`) to recreate the
 *  three tables before seeding rows, modeling a PRE-split install whose content.db still carries
 *  real chat rows. */
function seedContentDbFixture(dbPath: string): void {
  const db = openContentDb(dbPath);
  db.insert(workspaces).values({ id: "ws-1", name: "Workspace One", slug: "workspace-one", createdAt: "2026-09-01T00:00:00.000Z" }).run();
  db.$client.close();

  const raw = openChatDb(dbPath);
  raw
    .prepare(
      `INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, title, title_source, created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run("conv-1", "ws-1", "user", "user-1", "First chat", "fallback", 1, 1, null);
  raw
    .prepare(
      `INSERT INTO ai_chat_messages
         (id, conversation_id, role, content, agent_id, agent_name, events_json, attachments_json, run_id, run_status, position, created_at, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run("msg-1", "conv-1", "user", "hello", null, null, null, null, null, null, 0, 1, null, null);
  raw
    .prepare(`INSERT INTO assistant_agent_sessions (conversation_id, agent_id, session_id, updated_at) VALUES (?, ?, ?, ?)`)
    .run("conv-1", "agent-1", "session-1", 1);
  raw.close();
}

/** Row counts across all three chat tables, via a fresh independent connection. */
function chatRowCounts(dbPath: string): { chats: number; messages: number; sessions: number } {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const count = (table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    return { chats: count("ai_chats"), messages: count("ai_chat_messages"), sessions: count("assistant_agent_sessions") };
  } finally {
    db.close();
  }
}

function workspaceRow(dbPath: string): { id: string; name: string } | undefined {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(`SELECT id, name FROM workspaces WHERE id = 'ws-1'`).get() as { id: string; name: string } | undefined;
  } finally {
    db.close();
  }
}

test("reportDryRun: reports the exact seeded counts, and touches neither content.db nor chat.db", () => {
  const dir = tmpDir("chat-split-dryrun-");
  try {
    const contentDbPath = path.join(dir, "content.db");
    const chatDbPath = path.join(dir, "chat.db");
    seedContentDbFixture(contentDbPath);
    const beforeCounts = chatRowCounts(contentDbPath);

    const readOnly = openContentDbReadOnly(contentDbPath);
    const messages: string[] = [];
    const plan = reportDryRun(readOnly.$client, (m) => messages.push(m));
    readOnly.$client.close();

    assert.equal(plan.totalRows, 3, "1 chat + 1 message + 1 session");
    assert.equal(plan.perTable.get("ai_chats")?.count, 1);
    assert.equal(plan.perTable.get("ai_chat_messages")?.count, 1);
    assert.equal(plan.perTable.get("assistant_agent_sessions")?.count, 1);
    assert.ok(messages.some((m) => m.includes("DRY RUN")), "must announce itself as a dry run");

    assert.deepEqual(chatRowCounts(contentDbPath), beforeCounts, "dry run must not change content.db's row counts");
    assert.equal(fs.existsSync(chatDbPath), false, "dry run must never open or create chat.db");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("applyChatSplit: copies all 3 tables into chat.db, empties them in content.db, and leaves a sibling content table untouched", () => {
  const dir = tmpDir("chat-split-apply-");
  try {
    const contentDbPath = path.join(dir, "content.db");
    const chatDbPath = path.join(dir, "chat.db");
    seedContentDbFixture(contentDbPath);

    const contentDb = openContentDb(contentDbPath);
    const chatDb = openChatDb(chatDbPath);
    const result = applyChatSplit({ contentDb: contentDb.$client, chatDb, log: () => {} });
    chatDb.close();
    contentDb.$client.close();

    assert.equal(result.migrated, 3);
    assert.deepEqual(
      result.perTable.map((t) => [t.table, t.sourceCount, t.deleted]),
      [
        ["ai_chats", 1, 1],
        ["ai_chat_messages", 1, 1],
        ["assistant_agent_sessions", 1, 1],
      ]
    );

    assert.deepEqual(chatRowCounts(chatDbPath), { chats: 1, messages: 1, sessions: 1 }, "chat.db must now hold the moved rows");
    assert.deepEqual(chatRowCounts(contentDbPath), { chats: 0, messages: 0, sessions: 0 }, "content.db's chat tables must now be empty");
    assert.deepEqual(workspaceRow(contentDbPath), { id: "ws-1", name: "Workspace One" }, "a real content table must survive untouched");

    const moved = new Database(chatDbPath, { readonly: true, fileMustExist: true });
    try {
      const chat = moved.prepare(`SELECT title FROM ai_chats WHERE id = 'conv-1'`).get() as { title: string };
      assert.equal(chat.title, "First chat", "row content, not just its existence, must be preserved");
    } finally {
      moved.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("applyChatSplit: re-running after a full migration is a no-op — reports nothing to migrate, does not duplicate rows", () => {
  const dir = tmpDir("chat-split-rerun-");
  try {
    const contentDbPath = path.join(dir, "content.db");
    const chatDbPath = path.join(dir, "chat.db");
    seedContentDbFixture(contentDbPath);

    const contentDb1 = openContentDb(contentDbPath);
    const chatDb1 = openChatDb(chatDbPath);
    applyChatSplit({ contentDb: contentDb1.$client, chatDb: chatDb1, log: () => {} });
    chatDb1.close();
    contentDb1.$client.close();

    const contentDb2 = openContentDb(contentDbPath);
    const chatDb2 = openChatDb(chatDbPath);
    const secondRun = applyChatSplit({ contentDb: contentDb2.$client, chatDb: chatDb2, log: () => {} });
    chatDb2.close();
    contentDb2.$client.close();

    assert.equal(secondRun.migrated, 0, "content.db already has zero chat rows to move");
    assert.deepEqual(chatRowCounts(chatDbPath), { chats: 1, messages: 1, sessions: 1 }, "no duplicate rows in chat.db");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("applyChatSplit: a conflicting pre-existing destination row aborts the ENTIRE run and deletes nothing from content.db", () => {
  const dir = tmpDir("chat-split-conflict-");
  try {
    const contentDbPath = path.join(dir, "content.db");
    const chatDbPath = path.join(dir, "chat.db");
    seedContentDbFixture(contentDbPath);

    // Pre-seed chat.db with a DIFFERENT row under the SAME primary key ("conv-1") — simulating a
    // prior manual edit or an unrelated write that now conflicts with what content.db holds.
    const chatDbPre = openChatDb(chatDbPath);
    chatDbPre
      .prepare(
        `INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, title, title_source, created_at, updated_at, expires_at)
         VALUES ('conv-1', 'ws-1', 'user', 'user-1', 'DIFFERENT TITLE', 'fallback', 1, 1, NULL)`
      )
      .run();
    chatDbPre.close();

    const contentDb = openContentDb(contentDbPath);
    const chatDb = openChatDb(chatDbPath);
    assert.throws(
      () => applyChatSplit({ contentDb: contentDb.$client, chatDb, log: () => {} }),
      /verification failed/,
      "a content mismatch must abort the run with a loud error"
    );
    chatDb.close();
    contentDb.$client.close();

    assert.deepEqual(
      chatRowCounts(contentDbPath),
      { chats: 1, messages: 1, sessions: 1 },
      "content.db must be COMPLETELY untouched when verification fails — no partial delete"
    );
    const surviving = new Database(chatDbPath, { readonly: true, fileMustExist: true });
    try {
      const row = surviving.prepare(`SELECT title FROM ai_chats WHERE id = 'conv-1'`).get() as { title: string };
      assert.equal(row.title, "DIFFERENT TITLE", "the pre-existing conflicting row must be left exactly as it was, not overwritten");
    } finally {
      surviving.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readChatSplitPlan: an empty content.db (no chat rows) reports zero across all 3 tables", () => {
  const dir = tmpDir("chat-split-empty-");
  try {
    const contentDbPath = path.join(dir, "content.db");
    const db = openContentDb(contentDbPath);
    const plan = readChatSplitPlan(db.$client);
    db.$client.close();

    assert.equal(plan.totalRows, 0);
    for (const table of ["ai_chats", "ai_chat_messages", "assistant_agent_sessions"]) {
      assert.equal(plan.perTable.get(table)?.count, 0);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: dry run then --apply against the real script binary, verified via independent connections (not log text)", () => {
  const dir = tmpDir("chat-split-cli-");
  try {
    const contentDbPath = path.join(dir, "content.db");
    const chatDbPath = path.join(dir, "chat.db");
    seedContentDbFixture(contentDbPath);

    execFileSync("node", ["--import", "tsx", SCRIPT, "--db", contentDbPath], { cwd: REPO_ROOT, encoding: "utf8" });
    assert.equal(fs.existsSync(chatDbPath), false, "CLI dry run must not create chat.db");
    assert.deepEqual(chatRowCounts(contentDbPath), { chats: 1, messages: 1, sessions: 1 }, "CLI dry run must not change content.db");

    execFileSync("node", ["--import", "tsx", SCRIPT, "--db", contentDbPath, "--apply"], { cwd: REPO_ROOT, encoding: "utf8" });
    assert.deepEqual(chatRowCounts(chatDbPath), { chats: 1, messages: 1, sessions: 1 }, "CLI --apply must populate chat.db");
    assert.deepEqual(chatRowCounts(contentDbPath), { chats: 0, messages: 0, sessions: 0 }, "CLI --apply must empty content.db's chat tables");
    assert.deepEqual(workspaceRow(contentDbPath), { id: "ws-1", name: "Workspace One" }, "CLI --apply must not touch a real content table");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: --db pointing at a nonexistent file errors loudly instead of creating an empty database", () => {
  const dir = tmpDir("chat-split-missing-");
  try {
    const missingPath = path.join(dir, "does-not-exist.db");
    assert.throws(() =>
      execFileSync("node", ["--import", "tsx", SCRIPT, "--db", missingPath], { cwd: REPO_ROOT, encoding: "utf8" })
    );
    assert.equal(fs.existsSync(missingPath), false, "a mistyped --db must never be silently created");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * The same-file guard (SEC/D-08). Every case below points BOTH databases at one physical file, in a
 * different way, and asserts the seeded rows are still there afterwards.
 *
 * Without the guard this is silent, total data loss and the script reports success: `openChatDb`'s
 * DDL is all `CREATE TABLE IF NOT EXISTS`, so it opens content.db without complaint; every
 * `INSERT OR IGNORE` then no-ops against the rows already there; verification reads those same rows
 * back and finds them byte-identical, which is exactly the "copy landed" signal it is looking for;
 * and the delete pass — trusting that verification — removes every chat row from the only file that
 * ever held them. Measured before the fix: 1/1/1 rows in, 0/0/0 rows out, exit code 0.
 */
function runCli(args: readonly string[]): { failed: boolean; output: string } {
  try {
    return { failed: false, output: execFileSync("node", ["--import", "tsx", SCRIPT, ...args], { cwd: REPO_ROOT, encoding: "utf8" }) };
  } catch (error) {
    const spawned = error as { stdout?: string; stderr?: string };
    return { failed: true, output: `${spawned.stdout ?? ""}${spawned.stderr ?? ""}` };
  }
}

/** Asserts the run was refused AND — the load-bearing half — that the chat rows survived it. */
function assertRefusedWithRowsIntact(contentDbPath: string, result: { failed: boolean; output: string }, label: string): void {
  assert.deepEqual(
    chatRowCounts(contentDbPath),
    { chats: 1, messages: 1, sessions: 1 },
    `${label}: the chat rows must survive — a database copied onto itself and then deleted from is total data loss`
  );
  assert.ok(result.failed, `${label}: the run must exit non-zero rather than reporting success`);
  assert.match(result.output, /the same file/, `${label}: the refusal must name the reason`);
}

test("CLI: --chat-db pointing at the SAME path as --db is refused, and deletes nothing", () => {
  const dir = tmpDir("chat-split-samefile-");
  try {
    const contentDbPath = path.join(dir, "content.db");
    seedContentDbFixture(contentDbPath);
    assertRefusedWithRowsIntact(
      contentDbPath,
      runCli(["--db", contentDbPath, "--chat-db", contentDbPath, "--apply"]),
      "identical path"
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: --db named chat.db collides with the DEFAULT --chat-db and is refused, and deletes nothing", () => {
  // No `--chat-db` at all here: the default is `<dirname of --db>/chat.db`, so a content database
  // that simply happens to be named `chat.db` aims both handles at one file with no operator
  // mistake visible anywhere on the command line.
  const dir = tmpDir("chat-split-defaultcollide-");
  try {
    const contentDbPath = path.join(dir, "chat.db");
    seedContentDbFixture(contentDbPath);
    assertRefusedWithRowsIntact(contentDbPath, runCli(["--db", contentDbPath, "--apply"]), "default collision");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: a --chat-db SYMLINK to content.db is refused, and deletes nothing", () => {
  // The case a plain string comparison of the two resolved paths cannot see: two different names
  // for one inode. The guard canonicalizes through `fs.realpathSync`, which is what closes it.
  const dir = tmpDir("chat-split-symlink-");
  try {
    const contentDbPath = path.join(dir, "content.db");
    const linkPath = path.join(dir, "chat.db");
    seedContentDbFixture(contentDbPath);
    fs.symlinkSync(contentDbPath, linkPath);
    assertRefusedWithRowsIntact(contentDbPath, runCli(["--db", contentDbPath, "--chat-db", linkPath, "--apply"]), "symlink");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: the same-file refusal happens on a DRY RUN too, before anything is reported", () => {
  // Fail fast rather than print a plan that `--apply` would carry out destructively: a dry run that
  // says "3 rows would be copied" about an invocation that can only ever destroy them is worse than
  // no answer at all.
  const dir = tmpDir("chat-split-samefile-dryrun-");
  try {
    const contentDbPath = path.join(dir, "content.db");
    seedContentDbFixture(contentDbPath);
    const result = runCli(["--db", contentDbPath, "--chat-db", contentDbPath]);
    assert.ok(result.failed, "a dry run pointed at one file twice must be refused, not reported on");
    assert.match(result.output, /the same file/);
    assert.doesNotMatch(result.output, /DRY RUN/, "no plan may be printed for an invocation that cannot be applied");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
