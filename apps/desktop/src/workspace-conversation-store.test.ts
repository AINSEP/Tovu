/**
 * @file `createConversationStore` over an in-memory file port (and, once, the real filesystem
 * defaults): conversation CRUD, message upsert + auto-title, list ordering, damaged-file tolerance,
 * and the tool-gap audit's decode/limit rules.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ToolGapEntry } from "@jini-ai/daemon/tool-audit";
import { createConversationStore, titleFrom, type ConversationStorePorts } from "./workspace-conversation-store.ts";

/** An in-memory file plus a scripted clock and id source; every write is a deep copy, like disk. */
function memoryPorts(initial: unknown = null, { readState = "ok" }: { readState?: "ok" | "unreadable" } = {}) {
  let file: unknown = initial;
  let clock = 0;
  let ids = 0;
  const locks: string[] = [];
  const ports: ConversationStorePorts = {
    read: () => (file === null ? { state: "missing" } : readState === "ok" ? { state: "ok", value: structuredClone(file) } : { state: "unreadable", text: "{" }) as ReturnType<ConversationStorePorts["read"]>,
    write: (_path, value) => { file = structuredClone(value); },
    now: () => ++clock,
    newId: () => `c${++ids}`,
    withLock: (filePath, critical) => { locks.push(filePath); return critical(); },
  };
  return { ports, file: () => file, locks };
}

const gap = (id: string, extra: Partial<ToolGapEntry> = {}): ToolGapEntry => ({
  id, at: "2026-10-17T00:00:00Z", site: "site", chatId: "c1", runId: "r", provider: "codex", toolUsed: "apply_patch",
  summary: "/tmp/a", type: "tool_gap", gapLine: null, ...extra,
});

test("titleFrom takes the first non-empty user line, capped at 60 chars, and never titles from the assistant", () => {
  assert.equal(titleFrom({ id: "m", role: "user", content: "  Fix the header\nand the footer" }), "Fix the header");
  assert.equal(titleFrom({ id: "m", role: "user", content: "x".repeat(80) }), "x".repeat(60));
  assert.equal(titleFrom({ id: "m", role: "user", content: "   \n  " }), null);
  assert.equal(titleFrom({ id: "m", role: "user", content: "" }), null);
  assert.equal(titleFrom({ id: "m", role: "assistant", content: "Sure, here it is" }), null);
});

test("create, rename, list (newest first) and remove round-trip under the file lock", () => {
  const memory = memoryPorts();
  const store = createConversationStore({ filePath: "/chats.json" }, memory.ports);

  const first = store.create();
  const second = store.create();
  assert.deepEqual(first, { id: "c1", title: null, messageCount: 0, createdAt: 1, updatedAt: 1 });
  assert.deepEqual(store.list().map((row) => row.id), ["c2", "c1"]);

  store.rename({ id: first.id, title: "Renamed" });
  assert.deepEqual(store.list().map((row) => [row.id, row.title]), [["c1", "Renamed"], ["c2", null]], "a rename bumps updatedAt");

  store.remove({ id: second.id });
  store.remove({ id: "never-existed" });
  assert.deepEqual(store.list().map((row) => row.id), ["c1"]);
  assert.ok(memory.locks.every((filePath) => filePath === "/chats.json") && memory.locks.length >= 5);
});

test("saveMessage upserts by id, auto-titles once from the first user message, and refuses an unknown conversation", () => {
  const memory = memoryPorts();
  const store = createConversationStore({ filePath: "/chats.json" }, memory.ports);
  const { id } = store.create();

  store.saveMessage({ conversationId: id, message: { id: "a1", role: "assistant", content: "Hello!" } });
  store.saveMessage({ conversationId: id, message: { id: "u1", role: "user", content: "Make it blue" } });
  store.saveMessage({ conversationId: id, message: { id: "u1", role: "user", content: "Make it green" } });
  store.saveMessage({ conversationId: id, message: { id: "u2", role: "user", content: "And bigger" } });

  assert.deepEqual(store.loadMessages({ conversationId: id }).map((message) => [message.id, message.content]),
    [["a1", "Hello!"], ["u1", "Make it green"], ["u2", "And bigger"]]);
  assert.equal(store.list()[0]!.title, "Make it blue", "the title is set once and never overwritten");
  assert.equal(store.list()[0]!.messageCount, 3);
  assert.throws(() => store.saveMessage({ conversationId: "ghost", message: { id: "x", role: "user", content: "hi" } }),
    { message: "Conversation ghost does not exist." });
  assert.throws(() => store.rename({ id: "ghost", title: "t" }), { message: "Conversation ghost does not exist." });
  assert.deepEqual(store.loadMessages({ conversationId: "ghost" }), []);
});

test("a missing, unreadable, null or wrongly-shaped file reads as no conversations and no gaps", () => {
  for (const [initial, readState] of [
    [null, "ok"], [{ conversations: [] }, "unreadable"], [{ conversations: "nope", toolGaps: {} }, "ok"], [[], "ok"],
  ] as const) {
    const store = createConversationStore({ filePath: "/chats.json" }, memoryPorts(initial, { readState }).ports);
    assert.deepEqual(store.list(), [], JSON.stringify(initial));
    assert.deepEqual(store.listToolGaps({}, {}), [], JSON.stringify(initial));
  }
  // A literal JSON `null` file is parsed fine but holds nothing.
  const nullFile = memoryPorts();
  nullFile.ports.read = () => ({ state: "ok", value: null }) as ReturnType<ConversationStorePorts["read"]>;
  const store = createConversationStore({ filePath: "/chats.json" }, nullFile.ports);
  assert.deepEqual(store.list(), []);
  assert.deepEqual(store.listToolGaps({}, {}), []);
});

test("tool gaps: undecodable entries are dropped, a re-append replaces by id, and the list limit is clamped to 1..200", () => {
  const memory = memoryPorts({ conversations: [], toolGaps: [{ garbage: true }, gap("g0")] });
  const store = createConversationStore({ filePath: "/chats.json" }, memory.ports);

  assert.deepEqual(store.listToolGaps({}, {}).map((entry) => entry.id), ["g0"]);
  store.appendToolGap({ entry: gap("g1") });
  store.appendToolGap({ entry: gap("g0", { gapLine: "Tool gap: edit — no Tovu tool for it." }) });

  assert.deepEqual(store.listToolGaps({}, {}).map((entry) => entry.id), ["g0", "g1"], "newest first, g0 moved to the end");
  assert.equal(store.listToolGaps({}, {})[0]!.gapLine, "Tool gap: edit — no Tovu tool for it.");
  assert.deepEqual(store.listToolGaps({}, { limit: 0 }).map((entry) => entry.id), ["g0"], "a limit below 1 still returns one");
  assert.equal(store.listToolGaps({}, { limit: 5000 }).length, 2);

  for (let index = 0; index < 205; index++) store.appendToolGap({ entry: gap(`bulk-${index}`) });
  assert.equal(store.listToolGaps({}, { limit: 5000 }).length, 200, "a limit above 200 is capped");
  assert.equal(store.listToolGaps({}, {}).length, 100, "the default limit is 100");
});

test("with the default ports the store persists to a real file and mints UUID conversation ids", () => {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-conversations-")), "chats.json");
  const store = createConversationStore({ filePath });

  const created = store.create();

  assert.match(created.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(Math.abs(created.createdAt - Date.now()) < 60_000);
  assert.deepEqual(createConversationStore({ filePath }).list().map((row) => row.id), [created.id]);
  assert.deepEqual((JSON.parse(fs.readFileSync(filePath, "utf8")) as { toolGaps: unknown[] }).toolGaps, []);
});
