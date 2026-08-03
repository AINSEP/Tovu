import assert from "node:assert/strict";
import test from "node:test";

import { eq } from "drizzle-orm";

import { openContentDb, type ContentDb } from "../../../db/sqlite/content-db";
import { settingValuesUser, settingValuesWorkspace, workspaces } from "../../../db/schema";
import { SqliteSettingsRepo } from "../repo.sqlite";
import { purgeTenantSettings } from "@jini-ai/cms/settings";

/**
 * T027 (AC-13, EC-07) — a raw `DELETE` on a workspace holding setting values
 * must be rejected by the real `ON DELETE RESTRICT` FK (schema.ts /
 * ADR-028 §2 ✔B4), never silently cascade-drop value rows without a
 * ledgered `op='purge'` revision. This is a proof of the DB-level barrier
 * itself — no app-level pre-check is needed or added; better-sqlite3 raises
 * a genuine `SQLITE_CONSTRAINT_FOREIGNKEY` error (foreign_keys=ON is set in
 * `openContentDb`), which is what `PURGE_REQUIRED` maps to at the API layer
 * (Phase 5, out of scope here).
 */

const NOW = "2026-07-12T00:00:00.000Z";

function openTestDb(): ContentDb {
  return openContentDb(":memory:");
}

function seedWorkspace(db: ContentDb, id: string): void {
  db.insert(workspaces).values({ id, name: id, slug: id, createdAt: NOW }).onConflictDoNothing().run();
}

test("a raw DELETE on a workspace holding a setting_values_workspace row is rejected by the RESTRICT FK (AC-13/EC-07)", () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-fk-1");
  db.insert(settingValuesWorkspace)
    .values({
      settingId: "setting-fk-1",
      workspaceId: "ws-fk-1",
      valueJson: JSON.stringify("x"),
      state: "set",
      defVersion: 1,
      seq: 1,
      updatedBy: "actor-1",
      updatedAt: NOW,
      originPluginId: null,
    })
    .run();

  assert.throws(() => {
    db.delete(workspaces).where(eq(workspaces.id, "ws-fk-1")).run();
  }, /FOREIGN KEY constraint failed/);

  assert.equal(db.select().from(workspaces).where(eq(workspaces.id, "ws-fk-1")).all().length, 1);
  assert.equal(
    db
      .select()
      .from(settingValuesWorkspace)
      .where(eq(settingValuesWorkspace.workspaceId, "ws-fk-1"))
      .all().length,
    1,
    "the value row must survive the rejected delete attempt"
  );
});

test("a raw DELETE on a workspace holding a setting_values_user row is rejected by the RESTRICT FK (AC-13/EC-07)", () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-fk-2");
  db.insert(settingValuesUser)
    .values({
      settingId: "setting-fk-2",
      workspaceId: "ws-fk-2",
      principalId: "p-1",
      valueJson: JSON.stringify("x"),
      state: "set",
      defVersion: 1,
      seq: 1,
      updatedBy: "actor-1",
      updatedAt: NOW,
      originPluginId: null,
    })
    .run();

  assert.throws(() => {
    db.delete(workspaces).where(eq(workspaces.id, "ws-fk-2")).run();
  }, /FOREIGN KEY constraint failed/);

  assert.equal(db.select().from(workspaces).where(eq(workspaces.id, "ws-fk-2")).all().length, 1);
});

test("PURGE_REQUIRED is resolved by running the purge service first: after purgeTenantSettings clears a workspace's rows, the raw DELETE succeeds", async () => {
  const db = openTestDb();
  seedWorkspace(db, "ws-fk-3");
  db.insert(settingValuesWorkspace)
    .values({
      settingId: "setting-fk-3",
      workspaceId: "ws-fk-3",
      valueJson: JSON.stringify("x"),
      state: "set",
      defVersion: 1,
      seq: 1,
      updatedBy: "actor-1",
      updatedAt: NOW,
      originPluginId: null,
    })
    .run();

  // Blocked before the purge runs.
  assert.throws(() => {
    db.delete(workspaces).where(eq(workspaces.id, "ws-fk-3")).run();
  }, /FOREIGN KEY constraint failed/);

  const repo = new SqliteSettingsRepo(db);
  const alwaysAllow = async () => ({ allowed: true, reason: "matched" });
  const clock = { nowIso: () => NOW };
  const result = await purgeTenantSettings({
    deps: { repo, clock, authorize: alwaysAllow },
    input: { workspaceId: "ws-fk-3", callerPrincipalId: "actor-1" },
  });
  assert.equal(result.purgedCount, 1);

  // No more referencing rows — the raw delete now succeeds.
  db.delete(workspaces).where(eq(workspaces.id, "ws-fk-3")).run();
  assert.equal(db.select().from(workspaces).where(eq(workspaces.id, "ws-fk-3")).all().length, 0);
});
