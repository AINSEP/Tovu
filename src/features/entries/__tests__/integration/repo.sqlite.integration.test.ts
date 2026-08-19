import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "#src/db/sqlite/content-db";
import { SqliteEntryRepo } from "../../repo.sqlite.js";
import { createEntry, publishEntry, updateEntry } from "../../index.js";

/**
 * @file Real SQLite persistence for `features/entries` (this dispatch). Mirrors
 * `features/content-types/__tests__/integration/repo.sqlite.integration.test.ts`'s pattern and
 * rationale — see that file's header.
 */

function alwaysAllow() {
  return async () => ({ allowed: true, reason: "ok" });
}

function openTempContentDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "entries-sqlite-"));
  const filePath = path.join(tmpDir, "content.db");
  const db = openContentDb(filePath);
  return { db, filePath, tmpDir };
}

/** A fixed `ContentTypeLookupPort` double, standing in for `features/content-types`' real repo
 * (this test exercises `entries`' own persistence in isolation, per that package's own "no
 * runtime dependency on content-types' write path" architectural boundary). */
function fixedContentTypeLookup(workspaceId: string, key: string) {
  return {
    findByKey: async (params: { workspaceId: string; key: string }) =>
      params.workspaceId === workspaceId && params.key === key
        ? { workspaceId, key, status: "active" as const, fields: [] }
        : null,
  };
}

test("create -> restart-simulated (fresh repo instance against the same file) -> data still there", async () => {
  const { db, filePath, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
    const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };
    let idCounter = 0;

    const created = await createEntry({
      deps: {
        entryRepo: repo,
        contentTypeRepo: fixedContentTypeLookup("ws-1", "recipe"),
        clock,
        ids: { newId: () => `entry-${++idCounter}` },
        authorize: alwaysAllow(),
        outbox: { enqueue: async () => {} },
      },
      input: { actorId: "user-1", workspaceId: "ws-1", type: "recipe", slug: "banana-bread", title: "Banana Bread", fieldsJson: { ext: { site: {} } } },
    });
    assert.equal(created.ok, true);

    const dbAfterRestart = openContentDb(filePath);
    const repoAfterRestart = new SqliteEntryRepo(dbAfterRestart);
    const found = await repoAfterRestart.findBySlug({ workspaceId: "ws-1", type: "recipe", slug: "banana-bread" });
    assert.ok(found);
    assert.equal(found?.title, "Banana Bread");
    assert.equal(found?.status, "draft");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("workspace-scoping boundary: an entry created in ws-1 is invisible to ws-2's lookups", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
    const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };
    const deps = {
      entryRepo: repo,
      contentTypeRepo: fixedContentTypeLookup("ws-1", "recipe"),
      clock,
      ids: { newId: () => "entry-1" },
      authorize: alwaysAllow(),
      outbox: { enqueue: async () => {} },
    };

    const created = await createEntry({ deps, input: { actorId: "user-1", workspaceId: "ws-1", type: "recipe", slug: "banana-bread", title: "Banana Bread", fieldsJson: { ext: { site: {} } } } });
    assert.equal(created.ok, true);
    const entryId = created.ok ? created.value.entry.id : "";

    const crossWorkspace = await repo.findById({ workspaceId: "ws-2", id: entryId });
    assert.equal(crossWorkspace, null, "the same entry id in a different workspace must not resolve");

    const ws1List = await repo.listByWorkspace({ workspaceId: "ws-1" });
    const ws2List = await repo.listByWorkspace({ workspaceId: "ws-2" });
    assert.equal(ws1List.length, 1);
    assert.equal(ws2List.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("revision/audit trail actually persists: create + update + publish each append a real entry_revisions row", async () => {
  const { db, filePath, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
    const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };
    const deps = {
      entryRepo: repo,
      contentTypeRepo: fixedContentTypeLookup("ws-1", "recipe"),
      clock,
      ids: { newId: () => "entry-1" },
      authorize: alwaysAllow(),
      outbox: { enqueue: async () => {} },
    };

    const created = await createEntry({ deps, input: { actorId: "user-1", workspaceId: "ws-1", type: "recipe", slug: "banana-bread", title: "Banana Bread", fieldsJson: { ext: { site: {} } } } });
    assert.equal(created.ok, true);
    const entryId = created.ok ? created.value.entry.id : "";

    await updateEntry({ deps, input: { actorId: "user-1", workspaceId: "ws-1", id: entryId, title: "Banana Bread v2", expectedVersion: 1 } });
    await publishEntry({ deps, input: { actorId: "user-1", workspaceId: "ws-1", id: entryId, expectedVersion: 2 } });

    const dbAfterRestart = openContentDb(filePath);
    const rows = dbAfterRestart.$client.prepare("SELECT op, entry_id, workspace_id FROM entry_revisions ORDER BY seq ASC").all() as Array<{
      op: string;
      entry_id: string;
      workspace_id: string;
    }>;
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => r.op),
      ["create", "update", "publish"]
    );
    assert.ok(rows.every((r) => r.entry_id === entryId && r.workspace_id === "ws-1"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Fable adversarial-review fix (2026-07-21, Finding C/P10a): a throwing onWritten hook rolls back the ENTIRE transaction, not just itself — SqliteEntryRepo's real BEGIN IMMEDIATE/COMMIT/ROLLBACK, not the in-memory adapter's no-op transaction() passthrough", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
    const clock = { nowIso: () => "2026-07-21T00:00:00.000Z" };
    const baseDeps = {
      entryRepo: repo,
      contentTypeRepo: fixedContentTypeLookup("ws-1", "recipe"),
      clock,
      authorize: alwaysAllow(),
      outbox: { enqueue: async () => {} },
    };

    const created = await createEntry({
      deps: { ...baseDeps, ids: { newId: () => "entry-1" } },
      input: { actorId: "user-1", workspaceId: "ws-1", type: "recipe", slug: "banana-bread", title: "Banana Bread", fieldsJson: { ext: { site: {} } } },
    });
    assert.equal(created.ok, true);
    const entryId = created.ok ? created.value.entry.id : "";

    await assert.rejects(
      updateEntry({
        deps: {
          ...baseDeps,
          onWritten: async () => {
            throw new Error("simulated onWritten failure — mirrors widgets' entry_refs extraction hook throwing mid-transaction");
          },
        },
        input: { actorId: "user-1", workspaceId: "ws-1", id: entryId, title: "Should Never Persist", expectedVersion: 1 },
      }),
      /simulated onWritten failure/
    );

    const after = await repo.findById({ workspaceId: "ws-1", id: entryId });
    assert.equal(after?.title, "Banana Bread", "the title change must be rolled back along with the failed onWritten hook — same transaction, not swallowed");
    assert.equal(after?.version, 1, "version must not have advanced — proves save() itself was rolled back, not just skipped going forward");

    const revisionRows = db.$client.prepare("SELECT op FROM entry_revisions WHERE entry_id = ?").all(entryId) as Array<{ op: string }>;
    assert.deepEqual(revisionRows.map((r) => r.op), ["create"], "the update's revision row must also be rolled back, not left as a dangling audit entry for a write that never took effect");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
