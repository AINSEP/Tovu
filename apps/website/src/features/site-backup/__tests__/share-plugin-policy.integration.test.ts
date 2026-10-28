/** Owner 2026-10-18 regression contract. Expected RED before the fix: the default
 * newsletter list is refused; trusted plugin schemas cannot reach import verification. */
import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { importFixture, seedPluginShareData } from "./import.fixture.js";
import { sanitizeShareDatabase } from "#src/server/runtime/composition/site-portability";
import { rebuildImportDatabase } from "../import-database.js";

test("populated undeclared plugin tables still refuse by name beside declared tables", async t => {
  const h = await importFixture(t);
  await seedPluginShareData({ db: h.db });
  h.db.$client.exec("CREATE TABLE p_unknown__records (payload TEXT); INSERT INTO p_unknown__records VALUES ('required content')");
  await assert.rejects(sanitizeShareDatabase({ snapshot: h.db.$client.serialize() }), (error: unknown) => {
    assert.equal((error as { code: string }).code, "UNSUPPORTED_DATA");
    assert.match((error as Error).message, /p_unknown__records/);
    return true;
  });
});

test("import refuses tampered portable plugin DDL and private plugin tables", async t => {
  const h = await importFixture(t);
  await seedPluginShareData({ db: h.db });
  const clean = await sanitizeShareDatabase({ snapshot: h.db.$client.serialize() });
  for (const ddl of [
    "CREATE TRIGGER plugin_trigger AFTER INSERT ON p_newsletter__lists BEGIN DELETE FROM posts; END",
    "ALTER TABLE p_newsletter__lists ADD COLUMN injected TEXT",
    "CREATE TABLE p_newsletter__subscriptions (email TEXT)",
  ]) {
    const db = new Database(clean.bytes);
    try {
      db.exec(ddl);
      await assert.rejects(rebuildImportDatabase({ snapshot: db.serialize() }), (error: unknown) => (error as { code: string }).code === "INVALID_DATABASE");
    } finally { db.close(); }
  }
});

test("import refuses a portable row owned by a workspace the archive does not contain", async t => {
  const h = await importFixture(t);
  const clean = await sanitizeShareDatabase({ snapshot: h.db.$client.serialize() });
  const db = new Database(clean.bytes);
  try {
    db.pragma("foreign_keys = OFF");
    const [{ id: workspaceId }] = db.prepare("SELECT id FROM workspaces").all() as [{ id: string }];
    const [menu] = db.prepare("SELECT * FROM menus WHERE workspace_id = ? LIMIT 1").all(workspaceId) as Record<string, unknown>[];
    assert.ok(menu, "the starter fixture ships a menu to clone");
    const columns = Object.keys(menu);
    db.prepare(`INSERT INTO menus (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
      .run(...columns.map(column => column === "workspace_id" ? "ghost-workspace" : column === "id" ? "ghost-menu" : column === "slug" ? "ghost-slug" : menu[column]));
    await assert.rejects(rebuildImportDatabase({ snapshot: db.serialize() }), (error: unknown) => (error as { code: string }).code === "INVALID_DATABASE");
  } finally { db.close(); }
});
