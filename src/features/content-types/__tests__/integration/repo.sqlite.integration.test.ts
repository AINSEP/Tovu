import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "../../../../db/sqlite/content-db";
import { SqliteContentTypeRepo } from "../../repo.sqlite";
import { deprecateContentType, registerContentType, updateContentTypeFields } from "../../index";

/**
 * @file Real SQLite persistence for `features/content-types` (this dispatch, closing the gap
 * every prior spec-016-020 session disclosed: "no real repo.sqlite.ts/repo.memory.ts pair exists
 * yet"). Mirrors `db/sqlite/__tests__/database-journal.integration.test.ts`'s pattern: a real
 * temp-file `better-sqlite3` database, not `:memory:` (this repo's established convention for
 * this class of test). Drives the CERTIFIED `registerContentType`/`updateContentTypeFields`/
 * `deprecateContentType` write-service functions against the new SQLite repo — the actual proof
 * persistence works correctly, not just that the adapter compiles.
 */

function alwaysAllow() {
  return async () => ({ allowed: true, reason: "ok" });
}

function openTempContentDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-types-sqlite-"));
  const filePath = path.join(tmpDir, "content.db");
  const db = openContentDb(filePath);
  return { db, filePath, tmpDir };
}

function noopIndexProvisioner() {
  return {
    provisionIndexesForNewContentType: async () => {},
    applyFieldIndexTransitions: async () => {},
    tearDownAllIndexesForContentType: async () => {},
  };
}

test("create -> restart-simulated (fresh repo instance against the same file) -> data still there", async () => {
  const { db, filePath, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteContentTypeRepo(db);
    const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };

    const registered = await registerContentType({
      deps: { repo, clock, ids: { newId: () => "ct-1" }, authorize: alwaysAllow(), indexProvisioner: noopIndexProvisioner(), outbox: { enqueue: async () => {} } },
      input: { actorId: "user-1", workspaceId: "ws-1", key: "recipe", label: "Recipe", fields: [{ name: "title", kind: "text", required: true, queryable: true }] },
    });
    assert.equal(registered.ok, true);

    // "Restart": open a brand-new ContentDb handle against the SAME file path, construct a fresh
    // repo instance, and confirm the row survives — proving real filesystem persistence, not an
    // in-process cache.
    const dbAfterRestart = openContentDb(filePath);
    const repoAfterRestart = new SqliteContentTypeRepo(dbAfterRestart);
    const found = await repoAfterRestart.findByKey({ workspaceId: "ws-1", key: "recipe" });
    assert.ok(found);
    assert.equal(found?.label, "Recipe");
    assert.equal(found?.fields.length, 1);
    assert.equal(found?.status, "active");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("workspace-scoping boundary: a content type registered in ws-1 is invisible to ws-2's lookups", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteContentTypeRepo(db);
    const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };
    const deps = { repo, clock, ids: { newId: () => "ct-1" }, authorize: alwaysAllow(), indexProvisioner: noopIndexProvisioner(), outbox: { enqueue: async () => {} } };

    await registerContentType({ deps, input: { actorId: "user-1", workspaceId: "ws-1", key: "recipe", label: "Recipe", fields: [] } });

    const crossWorkspaceLookup = await repo.findByKey({ workspaceId: "ws-2", key: "recipe" });
    assert.equal(crossWorkspaceLookup, null, "the same key in a different workspace must not resolve");

    const ws1List = await repo.listByWorkspace({ workspaceId: "ws-1" });
    const ws2List = await repo.listByWorkspace({ workspaceId: "ws-2" });
    assert.equal(ws1List.length, 1);
    assert.equal(ws2List.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("revision/audit trail actually persists: register + field-change + deprecate each append a real content_type_revisions row", async () => {
  const { db, filePath, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteContentTypeRepo(db);
    const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };
    const deps = { repo, clock, ids: { newId: () => "ct-1" }, authorize: alwaysAllow(), indexProvisioner: noopIndexProvisioner(), outbox: { enqueue: async () => {} } };

    await registerContentType({ deps, input: { actorId: "user-1", workspaceId: "ws-1", key: "recipe", label: "Recipe", fields: [] } });
    await updateContentTypeFields({
      deps,
      input: { actorId: "user-1", workspaceId: "ws-1", key: "recipe", fields: [{ name: "title", kind: "text", required: true, queryable: false }], expectedVersion: 1 },
    });
    await deprecateContentType({
      deps: { repo, clock, authorize: alwaysAllow(), outbox: { enqueue: async () => {} } },
      input: { workspaceId: "ws-1", actorId: "user-1", key: "recipe", expectedVersion: 2 },
    });

    // Restart, read revisions directly via a raw query against the real file — proves the
    // append-only ledger survives independent of the in-process repo instance.
    const dbAfterRestart = openContentDb(filePath);
    const rows = dbAfterRestart.$client.prepare("SELECT op, content_type_key, workspace_id FROM content_type_revisions ORDER BY seq ASC").all() as Array<{
      op: string;
      content_type_key: string;
      workspace_id: string;
    }>;
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => r.op),
      ["register", "field-change", "field-change"]
    );
    assert.ok(rows.every((r) => r.content_type_key === "recipe" && r.workspace_id === "ws-1"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("audit provenance persists: principal_kind distinguishes a human write from an assistant write on identical actor ids", async () => {
  const { db, filePath, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteContentTypeRepo(db);
    const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };
    const deps = { repo, clock, ids: { newId: () => "ct-1" }, authorize: alwaysAllow(), indexProvisioner: noopIndexProvisioner(), outbox: { enqueue: async () => {} } };

    // Both writes are attributed to the SAME principal id — the assistant runs under the human's
    // own principal (see `server/modules/assistant.ts`), so `actor_id` cannot tell them apart.
    await registerContentType({
      deps,
      input: { actorId: "principal-7", principalKind: "user", workspaceId: "ws-1", key: "recipe", label: "Recipe", fields: [] },
    });
    await updateContentTypeFields({
      deps,
      input: {
        actorId: "principal-7",
        principalKind: "agent",
        workspaceId: "ws-1",
        key: "recipe",
        fields: [{ name: "title", kind: "text", required: true, queryable: false }],
        expectedVersion: 1,
      },
    });
    // A caller that supplies no provenance persists NULL — honestly "not recorded", never a
    // fabricated default (the same contract every pre-existing call site inherits).
    await deprecateContentType({
      deps: { repo, clock, authorize: alwaysAllow(), outbox: { enqueue: async () => {} } },
      input: { workspaceId: "ws-1", actorId: "principal-7", key: "recipe", expectedVersion: 2 },
    });

    const dbAfterRestart = openContentDb(filePath);
    const rows = dbAfterRestart.$client
      .prepare("SELECT actor_id, principal_kind FROM content_type_revisions ORDER BY seq ASC")
      .all() as Array<{ actor_id: string; principal_kind: string | null }>;

    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.actor_id === "principal-7"), "one principal id across all three writes");
    assert.deepEqual(
      rows.map((r) => r.principal_kind),
      ["user", "agent", null],
      "the column round-trips through the real migration, adapter, and file"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
