import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { isInMemoryDbPath, snapshotDb } from "../snapshot";

/**
 * @file ADR-023 §4 — whole-file snapshot, isolated from the rest of the engine.
 *
 * BUG FIX regression coverage (2026-07-28): before this fix, `snapshotDb` ran `path.dirname`/
 * `path.basename` on WHATEVER string it was given, including SQLite's special non-file identifiers
 * (`:memory:`, `""`, `file::memory:?...` URIs). For `:memory:`, that resolved to a REAL file named
 * literally `:memory:.snapshot-<label>-<ts>` written into the process's current working directory
 * (the repo root, for this suite) — 297 such files (213MB) were found and deleted after having
 * accumulated from a single session's test runs. These tests prove the guard closes that leak.
 */

test("isInMemoryDbPath: recognizes SQLite's special non-file identifiers", () => {
  assert.equal(isInMemoryDbPath(":memory:"), true, "the common in-memory literal");
  assert.equal(isInMemoryDbPath(""), true, "the empty-string private on-disk temp db identifier");
  assert.equal(isInMemoryDbPath("file::memory:?cache=shared"), true, "SQLite's own doc-example URI form");
  assert.equal(isInMemoryDbPath("file::memory:"), true, "the URI form with no query string at all");
  assert.equal(isInMemoryDbPath("file:some.db?mode=memory&cache=shared"), true, "explicit mode=memory query param");
});

test("isInMemoryDbPath: a real file path (plain or file: URI) is never mistaken for in-memory", () => {
  assert.equal(isInMemoryDbPath("/tmp/content.db"), false);
  assert.equal(isInMemoryDbPath("content.db"), false);
  assert.equal(isInMemoryDbPath("file:/tmp/content.db"), false);
  assert.equal(isInMemoryDbPath("file:content.db?cache=shared"), false, "a real path with an unrelated query param");
});

test("snapshotDb: against an in-memory db, returns null and writes NO file anywhere, including the cwd", async () => {
  const db = new Database(":memory:");
  db.prepare(`CREATE TABLE posts (id TEXT PRIMARY KEY)`).run();

  const before = new Set(fs.readdirSync(process.cwd()));
  const result = await snapshotDb({ db, dbPath: ":memory:", label: "test-plugin" });
  const after = fs.readdirSync(process.cwd());

  assert.equal(result, null, "no real file backs an in-memory db — nothing to snapshot");
  const newEntries = after.filter((name) => !before.has(name));
  assert.deepEqual(newEntries, [], "no new file (esp. a `:memory:.snapshot-*` file) appeared in the cwd");

  db.close();
});

test("snapshotDb: the empty-string temp-db identifier also no-ops (never a `.snapshot-*` file named after `\"\"`)", async () => {
  const db = new Database("");
  const before = new Set(fs.readdirSync(process.cwd()));
  const result = await snapshotDb({ db, dbPath: "", label: "test-plugin" });
  const after = fs.readdirSync(process.cwd());

  assert.equal(result, null);
  assert.deepEqual(after.filter((name) => !before.has(name)), []);

  db.close();
});

test("snapshotDb: a real file-backed dbPath is unaffected — still snapshots to a real sibling file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-snapshot-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.prepare(`CREATE TABLE posts (id TEXT PRIMARY KEY)`).run();

  const result = await snapshotDb({ db, dbPath, label: "test-plugin" });

  assert.ok(result, "a real snapshot path was returned");
  assert.ok(result!.startsWith(dbPath), "sibling of the real db file, per the existing naming convention");
  assert.ok(fs.existsSync(result!), "the snapshot file actually exists on disk");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
