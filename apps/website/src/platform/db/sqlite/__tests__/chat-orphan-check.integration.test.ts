import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { openChatDb } from "../chat-db.js";
import {
  checkForOrphanedChatRows,
  formatOrphanedChatRowsWarning,
  warnOnOrphanedChatRows,
} from "../chat-orphan-check.js";

/**
 * @file Integration tests for the boot-time detection of chat rows left behind in `content.db` by
 * the `content.db` -> `chat.db` split (`chat-db.ts`). Real temp-file SQLite databases throughout,
 * mirroring `chat-db.integration.test.ts`'s pattern — no fakes, no mocked `better-sqlite3`.
 *
 * The condition under test is not hypothetical: the owner's own `sites/tovu-com/content.db` held
 * 157 `ai_chats` / 562 `ai_chat_messages` / 19 `assistant_agent_sessions` rows while its `chat.db`
 * held 11 / 40 / 6, verified read-only on 2026-09-06. The assistant reads only `chat.db`, so those
 * 157 conversations were invisible with nothing anywhere saying so.
 *
 * Fixture note: the three chat tables have byte-identical DDL in `content.db` (migrations `0023`
 * and `0051`) and in `chat.db` (`chat-db.ts`'s `ensureChatHistoryTables` + `ASSISTANT_AGENT_SESSIONS_DDL`)
 * — that shared DDL is the whole reason the rows can be moved between them at all. So these tests
 * build the `content.db` fixture with `openChatDb` rather than running the full Drizzle migration
 * chain: it produces the same three tables, and the check reads nothing else.
 */

/** `deps.ts`, reached by walking up from this test's own directory (`.../platform/db/sqlite/__tests__`
 *  -> `src`) rather than guessing a repo root — a miscounted `..` would fail this test with an ENOENT
 *  that says nothing about wiring. */
const DEPS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../server/runtime/composition/deps.ts"
);

interface Fixture {
  readonly tmpDir: string;
  readonly contentDbPath: string;
  readonly chatDbPath: string;
}

function makeFixture(): Fixture {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-orphan-"));
  return {
    tmpDir,
    contentDbPath: path.join(tmpDir, "content.db"),
    chatDbPath: path.join(tmpDir, "chat.db"),
  };
}

/** Writes `count` conversations, one message each, plus one agent session per conversation. */
function seedChatRows(db: Database.Database, count: number, prefix: string): void {
  const insertChat = db.prepare(
    `INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, created_at, updated_at) VALUES (?, 'ws-1', 'user', 'user-1', 1, 1)`
  );
  const insertMessage = db.prepare(
    `INSERT INTO ai_chat_messages (id, conversation_id, role, content, position, created_at) VALUES (?, ?, 'user', 'hello', 0, 1)`
  );
  const insertSession = db.prepare(
    `INSERT INTO assistant_agent_sessions (conversation_id, agent_id, session_id, updated_at) VALUES (?, 'agent-1', ?, 1)`
  );
  for (let i = 0; i < count; i += 1) {
    const id = `${prefix}-${i}`;
    insertChat.run(id);
    insertMessage.run(`${id}-msg`, id);
    insertSession.run(id, `${id}-session`);
  }
}

test("checkForOrphanedChatRows reports the exact per-table counts still sitting in content.db", () => {
  const { tmpDir, contentDbPath } = makeFixture();
  const contentDb = openChatDb(contentDbPath);
  try {
    seedChatRows(contentDb, 3, "orphan");

    const check = checkForOrphanedChatRows(contentDb);

    assert.equal(check.orphaned, true, "3 conversations left in content.db must be reported as orphaned");
    assert.deepEqual(check.counts, { aiChats: 3, aiChatMessages: 3, assistantAgentSessions: 3 });
    assert.equal(check.total, 9, "total must be the sum across all three tables, not just ai_chats");
  } finally {
    contentDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("checkForOrphanedChatRows never writes: it succeeds against a strictly read-only connection", () => {
  const { tmpDir, contentDbPath } = makeFixture();
  const writable = openChatDb(contentDbPath);
  seedChatRows(writable, 2, "ro");
  writable.close();

  // A read-only handle makes the "reads only" claim enforceable by SQLite itself rather than by a
  // comment: any INSERT/UPDATE/DDL the check performed would throw SQLITE_READONLY here.
  const readOnly = new Database(contentDbPath, { readonly: true, fileMustExist: true });
  try {
    const check = checkForOrphanedChatRows(readOnly);
    assert.equal(check.total, 6);
  } finally {
    readOnly.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("warnOnOrphanedChatRows is a silent no-op when content.db holds no chat rows", () => {
  const { tmpDir, contentDbPath, chatDbPath } = makeFixture();
  const contentDb = openChatDb(contentDbPath);
  const chatDb = openChatDb(chatDbPath);
  try {
    seedChatRows(chatDb, 5, "already-migrated");
    const logged: string[] = [];

    const check = warnOnOrphanedChatRows({
      contentDb,
      contentDbPath,
      chatDbPath,
      log: (message) => logged.push(message),
    });

    assert.equal(check.orphaned, false);
    assert.equal(check.total, 0);
    assert.deepEqual(logged, [], "an already-migrated site must not print anything at boot");
  } finally {
    chatDb.close();
    contentDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("warnOnOrphanedChatRows tolerates a content.db that has no chat tables at all", () => {
  const { tmpDir, contentDbPath, chatDbPath } = makeFixture();
  const contentDb = new Database(contentDbPath);
  contentDb.exec(`CREATE TABLE posts (id TEXT PRIMARY KEY)`);
  try {
    const logged: string[] = [];

    const check = warnOnOrphanedChatRows({
      contentDb,
      contentDbPath,
      chatDbPath,
      log: (message) => logged.push(message),
    });

    assert.equal(check.total, 0, "absent tables must count as zero, not throw");
    assert.deepEqual(check.counts, { aiChats: 0, aiChatMessages: 0, assistantAgentSessions: 0 });
    assert.deepEqual(logged, []);
  } finally {
    contentDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("warnOnOrphanedChatRows names the counts, both database paths, and the exact recovery command", () => {
  const { tmpDir, contentDbPath, chatDbPath } = makeFixture();
  const contentDb = openChatDb(contentDbPath);
  try {
    seedChatRows(contentDb, 4, "loud");
    const logged: string[] = [];

    warnOnOrphanedChatRows({ contentDb, contentDbPath, chatDbPath, log: (m) => logged.push(m) });

    assert.equal(logged.length, 1, "exactly one warning per boot — not one per table, not zero");
    const warning = logged[0]!;
    assert.match(warning, /ai_chats\s+4 row/, "must name the ai_chats count");
    assert.match(warning, /ai_chat_messages\s+4 row/, "must name the ai_chat_messages count");
    assert.match(warning, /assistant_agent_sessions\s+4 row/, "must name the assistant_agent_sessions count");
    assert.ok(warning.includes(contentDbPath), "must name the content.db it read");
    assert.ok(warning.includes(chatDbPath), "must name the chat.db the rows belong in");
    assert.ok(
      warning.includes("development/scripts/split-chat-data-into-chat-db.ts"),
      "must name the script that moves the rows"
    );
    assert.ok(warning.includes("--apply"), "must show the flag that actually performs the move");
    assert.ok(
      warning.includes("--db"),
      "the script requires --db and has no default; the printed command must include it"
    );
  } finally {
    contentDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("warnOnOrphanedChatRows still reports when SOME rows were already copied into chat.db (interrupted migration)", () => {
  const { tmpDir, contentDbPath, chatDbPath } = makeFixture();
  const contentDb = openChatDb(contentDbPath);
  const chatDb = openChatDb(chatDbPath);
  try {
    seedChatRows(contentDb, 2, "both");
    seedChatRows(chatDb, 2, "both"); // same ids — a crashed run that copied but never deleted
    const logged: string[] = [];

    const check = warnOnOrphanedChatRows({ contentDb, contentDbPath, chatDbPath, log: (m) => logged.push(m) });

    assert.equal(check.orphaned, true, "rows present in chat.db do NOT excuse rows still in content.db");
    assert.equal(check.total, 6);
    assert.equal(logged.length, 1);
  } finally {
    chatDb.close();
    contentDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("warnOnOrphanedChatRows is safe to run twice: same result, and neither database changes", () => {
  const { tmpDir, contentDbPath, chatDbPath } = makeFixture();
  const contentDb = openChatDb(contentDbPath);
  const chatDb = openChatDb(chatDbPath);
  try {
    seedChatRows(contentDb, 3, "twice");
    seedChatRows(chatDb, 1, "existing");
    const countRows = (db: Database.Database, table: string): number =>
      (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    const snapshot = () => ({
      contentChats: countRows(contentDb, "ai_chats"),
      contentMessages: countRows(contentDb, "ai_chat_messages"),
      contentSessions: countRows(contentDb, "assistant_agent_sessions"),
      chatChats: countRows(chatDb, "ai_chats"),
      chatMessages: countRows(chatDb, "ai_chat_messages"),
      chatSessions: countRows(chatDb, "assistant_agent_sessions"),
    });
    const before = snapshot();
    const logged: string[] = [];

    const first = warnOnOrphanedChatRows({ contentDb, contentDbPath, chatDbPath, log: (m) => logged.push(m) });
    const second = warnOnOrphanedChatRows({ contentDb, contentDbPath, chatDbPath, log: (m) => logged.push(m) });

    assert.deepEqual(second, first, "a second run must report exactly what the first did");
    assert.deepEqual(snapshot(), before, "detection must not move, copy, or delete a single row");
    assert.equal(logged.length, 2, "each invocation warns once — the check has no hidden latch");
  } finally {
    chatDb.close();
    contentDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("formatOrphanedChatRowsWarning renders nothing-to-say state as an empty string", () => {
  const empty = formatOrphanedChatRowsWarning(
    { orphaned: false, total: 0, counts: { aiChats: 0, aiChatMessages: 0, assistantAgentSessions: 0 } },
    { contentDbPath: "/x/content.db", chatDbPath: "/x/chat.db" }
  );
  assert.equal(empty, "", "a clean site has no message; the emitter relies on this to stay silent");
});

/**
 * The dominant defect shape in this repo is a correct primitive with an unwired call site, so this
 * asserts the composition root actually invokes the check — a green unit test on
 * `warnOnOrphanedChatRows` alone would pass with `deps.ts` never calling it. Source assertion (not
 * a behavioural one) because `createSqliteRouteDeps` opens, migrates, and seeds a real content.db
 * from a `process.cwd()`-relative default; booting it inside a test risks touching a real site.
 */
test("deps.ts wires the check into createSqliteRouteDeps right where chat.db is opened", () => {
  assert.ok(fs.existsSync(DEPS_PATH), `guard: the composition root must be at ${DEPS_PATH}`);
  const source = fs.readFileSync(DEPS_PATH, "utf8");

  // Prove the pattern CAN match before trusting a zero: `openChatDb(` is known to be there today.
  assert.ok(source.includes("openChatDb("), "guard: deps.ts must still open chat.db at all");

  assert.ok(
    source.includes("warnOnOrphanedChatRows("),
    "createSqliteRouteDeps must call warnOnOrphanedChatRows; the detector is useless unwired"
  );
  const openIndex = source.indexOf("const chatDb = openChatDb(");
  const warnIndex = source.indexOf("warnOnOrphanedChatRows({");
  assert.ok(openIndex !== -1, "guard: the chatDb binding must still exist");
  assert.ok(warnIndex > openIndex, "the check must run after chat.db is opened, per its own contract");
});
