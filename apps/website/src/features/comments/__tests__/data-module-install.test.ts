import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { installCommentsDataModule } from "../data-module-install.js";

test("installCommentsDataModule: installs tables cleanly on a fresh database", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-comments-install-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  try {
    await installCommentsDataModule({ db, dbPath });

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    // COMMENTS_DATA_MODULE (types.ts) declares exactly these two tables — comments settings are
    // stored via the cross-cutting Settings Layered Ledger (ADR-028), NOT a plugin-owned table
    // (see CommentsSettings's own doc comment in types.ts), so there is no p_comments__settings.
    assert.ok(names.includes("p_comments__comments"), `expected p_comments__comments in [${names.join(", ")}]`);
    assert.ok(names.includes("p_comments__moderation_log"), `expected p_comments__moderation_log in [${names.join(", ")}]`);

    // Idempotent: re-invoking succeeds
    await installCommentsDataModule({ db, dbPath }, {});
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("installCommentsDataModule: throws Error when declareDataModule fails", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-comments-install-fail-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  try {
    // Poison the database with an incompatible column type to force declareDataModule to fail
    db.prepare(`CREATE TABLE p_comments__comments (id INTEGER PRIMARY KEY)`).run();

    await assert.rejects(
      () => installCommentsDataModule({ db, dbPath }),
      /comments dataModule declaration failed/
    );
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
