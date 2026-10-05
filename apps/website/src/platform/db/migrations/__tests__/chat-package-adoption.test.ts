/** PLAN C3: query implementation adoption cannot migrate, convert or relocate stored chat data. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { sqliteKernel } from "@jini-ai/db/kernel/sqlite";
import { createSqliteChatStore } from "@jini-ai/chat/store/sqlite";
import { chatKernel, type ChatDatabase } from "#src/platform/db/chat-kernel";
import { openSiteChatDb } from "#src/platform/db/sqlite/chat-db";
import { createChatHistoryStore } from "#src/assistant/persistence/chat-history-store";
import { hashSessionKey } from "#src/assistant/persistence/tenant-scope";
import { createChatHistoryStore as beforeAdoption } from "./chat-pre-adoption.fixture.js";
import { SQLITE_CHAT_STATEMENTS } from "./chat-pre-adoption-schema.fixture.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

const T0 = 1_790_000_000_000;
const USER = { scopeId: "ws", ownerKind: "user", ownerId: "alice" } as const;
const GUEST = { scopeId: "ws", ownerKind: "guest", ownerId: hashSessionKey("disposable-guest-cookie") } as const;
const LEDGER = [
  { id: "0000_chat_baseline", checksum: "d7673b2b2ac8af992a396b375fa38da8ffbf852285c772016dc47c82d66d17a9", applied_at: "2026-09-05T01:02:03.000Z" },
  { id: "0001_sqlite_chat_tables", checksum: "6ab892750dcd9201f17bd05df3f3f69f84a6342d54647984d6c834dd7d5d164f", applied_at: "2026-09-05T01:02:04.000Z" },
];

function seed(file: string, withLedger: boolean) {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  for (const statement of SQLITE_CHAT_STATEMENTS) db.exec(statement);
  for (const [id, scope] of [["user-chat", USER], ["guest-chat", GUEST]] as const) {
    db.prepare("INSERT INTO ai_chats VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, scope.scopeId, scope.ownerKind, scope.ownerId, "中文 café 😀\u0000title", "manual", T0, T0 + 9, id === "guest-chat" ? T0 + 999 : null);
    db.prepare("INSERT INTO ai_chat_messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      `message-${id}`, id, "assistant", "é é 中 😀\u0000\n\\text", "agent", "Agent 中",
      '[ { "kind": "text", "text": "中 😀" } ]', '[{"url":"data:text/plain;base64,AAEC","name":"binary"}]',
      "run", "succeeded", 7, T0 + 1, T0 + 2, T0 + 3,
    );
    db.prepare("INSERT INTO assistant_agent_sessions VALUES (?, ?, ?, ?)").run(id, "agent", "opaque-session", T0 + 4);
    db.prepare("INSERT INTO assistant_conversation_tool_approvals VALUES (?, ?, ?, ?, ?, ?)").run(id, "alice", "conn", "tool", "opaque-fingerprint", "2026-09-05T01:02:05.000Z");
  }
  if (withLedger) {
    db.exec("CREATE TABLE tovu_chat_migrations (id text primary key, checksum text not null, applied_at text not null)");
    for (const row of LEDGER) db.prepare("INSERT INTO tovu_chat_migrations VALUES (?, ?, ?)").run(row.id, row.checksum, row.applied_at);
  }
  db.pragma("wal_checkpoint(TRUNCATE)");
  return db;
}

function snapshot(db: Database.Database) {
  const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(r => r.name);
  return {
    schema,
    columns: Object.fromEntries(tables.map(name => [name, db.prepare(`PRAGMA table_info('${name}')`).all()])),
    foreignKeys: Object.fromEntries(tables.map(name => [name, db.prepare(`PRAGMA foreign_key_list('${name}')`).all()])),
    indexes: Object.fromEntries(tables.map(name => [name, db.prepare(`PRAGMA index_list('${name}')`).all()])),
    values: Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()])),
  };
}

async function readBoth(db: Database.Database) {
  const kernel = chatKernel(db);
  assert.equal(kernel, sqliteKernel<ChatDatabase>(db), "host and package must resolve the exact same memoized kernel");
  for (const [scope, id] of [[USER, "user-chat"], [GUEST, "guest-chat"]] as const) {
    const original = beforeAdoption(kernel, scope);
    const adopted = createChatHistoryStore(kernel, scope);
    assert.deepEqual(await adopted.list(), await original.list());
    assert.deepEqual(await adopted.get({ id }), await original.get(id));
    assert.deepEqual(await adopted.messages({ conversationId: id }), await original.messages(id));
    assert.deepEqual((await adopted.pageMessages({ conversationId: id })).items, await original.messages(id));
    assert.deepEqual((await adopted.pageConversations({})).items, await original.list());
    assert.equal((await adopted.get({ id }))?.createdAt, T0);
    assert.equal((await adopted.messages({ conversationId: id }))[0]?.content, "é é 中 😀\u0000\n\\text");
    assert.equal(await adopted.get({ id: id === "user-chat" ? "guest-chat" : "user-chat" }), null);
  }
}

test("normal bootstrap, adopted and rollback readers preserve existing schema, all values, ledgers and separate content file through reopen", async () => {
  const dir = mkdtempSync(join(tmpdir(), "chat-adoption-existing-"));
  let db: Database.Database | undefined;
  try {
    const chatFile = join(dir, "chat.db"), contentFile = join(dir, "content.db");
    const content = new Database(contentFile);
    content.exec("CREATE TABLE marker (payload BLOB)");
    content.prepare("INSERT INTO marker VALUES (?)").run(Buffer.from([0, 255, 1, 128, 10]));
    content.close();
    const contentBytes = readFileSync(contentFile);
    db = seed(chatFile, true);
    const initial = snapshot(db);
    db.close(); db = undefined;
    for (let i = 0; i < 2; i++) {
      db = await openSiteChatDb(chatFile);
      assert.equal(db.name, chatFile, "the host opens the original physical database");
      assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
      assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
      assert.equal(db.pragma("busy_timeout", { simple: true }), 5000);
      await readBoth(db);
      assert.deepEqual(snapshot(db), initial);
      assert.deepEqual(db.prepare("SELECT * FROM tovu_chat_migrations ORDER BY id").all(), LEDGER);
      assert.deepEqual(readFileSync(contentFile), contentBytes);
      db.close(); db = undefined;
    }
  } finally { db?.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("constructing and reading the package adapter alone leaves checkpointed main-file bytes unchanged", async () => {
  const dir = mkdtempSync(join(tmpdir(), "chat-adoption-bytes-"));
  let db: Database.Database | undefined;
  try {
    const file = join(dir, "chat.db");
    db = seed(file, true); db.close(); db = undefined;
    const initial = readFileSync(file);
    db = new Database(file, { readonly: true, fileMustExist: true });
    const history = createSqliteChatStore({ kernel: sqliteKernel<ChatDatabase>(db), scope: USER });
    assert.equal((await history.list())[0]?.id, "user-chat");
    assert.equal((await history.messages({ conversationId: "user-chat" }))[0]?.createdAt, T0 + 1);
    await history.pageConversations({}); await history.pageMessages({ conversationId: "user-chat" });
    db.close(); db = undefined;
    assert.deepEqual(readFileSync(file), initial, "read-only adoption must not write SQLite pages");
  } finally { db?.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("a pre-ledger fixture retains every chat value while adopting only its first existing migration ledger", async () => {
  const dir = mkdtempSync(join(tmpdir(), "chat-adoption-pre-ledger-"));
  let db: Database.Database | undefined;
  try {
    const file = join(dir, "chat.db"); db = seed(file, false);
    const initial = snapshot(db); db.close(); db = undefined;
    db = await openSiteChatDb(file);
    const adopted = snapshot(db);
    for (const name of Object.keys(initial.values)) assert.deepEqual(adopted.values[name], initial.values[name]);
    assert.deepEqual(adopted.schema.filter((row: any) => row.tbl_name !== "tovu_chat_migrations"), initial.schema);
    const ledger = db.prepare("SELECT * FROM tovu_chat_migrations ORDER BY id").all() as typeof LEDGER;
    assert.deepEqual(ledger.map(({ id, checksum }) => ({ id, checksum })), LEDGER.map(({ id, checksum }) => ({ id, checksum })));
    for (const row of ledger) assert.match(row.applied_at, /^\d{4}-\d{2}-\d{2}T/);
    await readBoth(db);
    db.close(); db = await openSiteChatDb(file);
    assert.deepEqual(db.prepare("SELECT * FROM tovu_chat_migrations ORDER BY id").all(), ledger);
  } finally { db?.close(); rmSync(dir, { recursive: true, force: true }); }
});

/** Every pin in checksums.ts at the C3 handoff (5ec1a964d^); later migrations may only add pins. */
const C3_PINNED_CHECKSUMS: Record<string, string> = {
  "0000_legacy_baseline": "2dc785cd1a16b371ac1cc8f6798c688d3c2e0a9a489c54535ef1cf8ca324e714",
  "0001_post_search": "234ca1fdbacd2462582ef55c551f4b5046236384b6e90f799d95fecb944e6795",
  "chat/0000_chat_baseline": "d7673b2b2ac8af992a396b375fa38da8ffbf852285c772016dc47c82d66d17a9",
  "0002_drop_empty_legacy_chat_tables": "1e33d7ab4ba950fcfa5c8fdb86d312a571f5e88c2d043e603970ad2914a7583b",
  "chat/0001_sqlite_chat_tables": "6ab892750dcd9201f17bd05df3f3f69f84a6342d54647984d6c834dd7d5d164f",
  "0003_coercion_json_as_json": "1135e06ed42097731f6ef16c2c4d826b0b23a171640e50df96517136876e99cf",
};

test("C3 changes zero bytes in historical SQL, metadata, chat steps or checksum pins", () => {
  const root = process.cwd();
  const expected = JSON.parse(readFileSync(new URL("./chat-package-adoption.sources.json", import.meta.url), "utf8")) as Record<string, string>;
  const drizzle = "apps/website/src/platform/db/drizzle";
  const actualFiles = [
    ...readdirSync(resolve(root, drizzle)).filter(n => n.endsWith(".sql")).map(n => `${drizzle}/${n}`),
    ...readdirSync(resolve(root, `${drizzle}/meta`)).map(n => `${drizzle}/meta/${n}`),
    ...readdirSync(resolve(root, "apps/website/src/platform/db/migrations/chat")).filter(n => n.endsWith(".ts")).map(n => `apps/website/src/platform/db/migrations/chat/${n}`),
  ];
  assert.deepEqual(actualFiles.sort(), Object.keys(expected).sort());
  for (const [file, hash] of Object.entries(expected)) {
    assert.equal(createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex"), hash, `${file}: historical bytes changed after the C3 handoff`);
  }
  // checksums.ts legitimately grows a pin per new migration (0004 landed after C3), so its raw
  // bytes cannot be frozen; what C3 must not touch is every pin that existed at the handoff.
  for (const [id, checksum] of Object.entries(C3_PINNED_CHECKSUMS)) {
    assert.equal(MIGRATION_CHECKSUMS[id], checksum, `checksums.ts: pin '${id}' changed after the C3 handoff`);
  }
});
