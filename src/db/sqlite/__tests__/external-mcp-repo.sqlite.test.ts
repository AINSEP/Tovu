import assert from "node:assert/strict";
import test from "node:test";

import type { ExternalMcpServerRecord } from "../../../assistant/index.js";
import { workspaces } from "../../schema.js";
import { openContentDb } from "../content-db.js";
import { SqliteExternalMcpServerRepo } from "../external-mcp-repo.sqlite.js";

/**
 * @file `SqliteExternalMcpServerRepo` against a real, migrated `content.db` (`:memory:`).
 *
 * Had ZERO test coverage of any kind before this file — confirmed via the combined-lcov cross-check
 * (toRecord/listByWorkspaceId/findByServerId/upsert/deleteByServerId all read 0 hits, deduped). What
 * only a real DB proves here: the composite `(workspace_id, server_id)` primary key really makes
 * `upsert` update rather than duplicate, `external_mcp_servers_sealed_shape`'s CHECK really agrees
 * with this adapter's all-null-or-all-set `sealedEnv` mapping, and `deleteByServerId`'s
 * `changes > 0` boolean really reflects whether a row existed.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const NOW = "2026-08-21T00:00:00.000Z";
const LATER = "2026-08-21T01:00:00.000Z";

function makeRecord(overrides: Partial<ExternalMcpServerRecord> = {}): ExternalMcpServerRecord {
  return {
    workspaceId: WORKSPACE,
    serverId: "my-server",
    label: "My Server",
    transport: "stdio",
    enabled: true,
    command: "npx",
    args: JSON.stringify(["-y", "my-mcp-server"]),
    allowedToolNames: JSON.stringify(["search", "fetch"]),
    envNames: JSON.stringify(["API_KEY"]),
    sealedEnv: { keyId: "k1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function seedWorkspaces(db: ReturnType<typeof openContentDb>, ids: string[]): void {
  for (const id of ids) {
    db.insert(workspaces).values({ id, name: id, slug: id, createdAt: NOW }).onConflictDoNothing().run();
  }
}

function makeRepo() {
  const db = openContentDb(":memory:");
  seedWorkspaces(db, [WORKSPACE, OTHER_WORKSPACE]);
  return new SqliteExternalMcpServerRepo(db);
}

test("listByWorkspaceId returns an empty array when no rows exist", async () => {
  assert.deepEqual(await makeRepo().listByWorkspaceId(WORKSPACE), []);
});

test("findByServerId returns null when no row matches", async () => {
  assert.equal(await makeRepo().findByServerId({ workspaceId: WORKSPACE, serverId: "my-server" }), null);
});

test("upsert then findByServerId round-trips a record exactly, including JSON-as-stored string columns", async () => {
  const repo = makeRepo();
  const record = makeRecord();

  await repo.upsert(record);

  assert.deepEqual(await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "my-server" }), record);
});

test("a record with no sealed env round-trips with sealedEnv: null (the CHECK's other valid shape)", async () => {
  const repo = makeRepo();
  const record = makeRecord({ sealedEnv: null, envNames: null });

  await repo.upsert(record);

  assert.deepEqual(await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "my-server" }), record);
});

test("nullable plaintext fields (label, command, args, allowedToolNames) round-trip as null", async () => {
  const repo = makeRepo();
  const record = makeRecord({ label: null, command: null, args: null, allowedToolNames: null, sealedEnv: null, envNames: null });

  await repo.upsert(record);

  assert.deepEqual(await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "my-server" }), record);
});

test("upsert on the same (workspaceId, serverId) updates in place rather than duplicating", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ enabled: true, updatedAt: NOW }));

  await repo.upsert(makeRecord({ enabled: false, label: "Renamed", updatedAt: LATER }));

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.equal(rows.length, 1, "the composite PK must make this an UPDATE, not a second row");
  assert.equal(rows[0].enabled, false);
  assert.equal(rows[0].label, "Renamed");
  assert.equal(rows[0].updatedAt, LATER);
});

test("listByWorkspaceId returns multiple servers for one workspace, scoped away from another workspace's rows", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ serverId: "server-a" }));
  await repo.upsert(makeRecord({ serverId: "server-b" }));
  await repo.upsert(makeRecord({ workspaceId: OTHER_WORKSPACE, serverId: "server-a" }));

  const rows = await repo.listByWorkspaceId(WORKSPACE);

  assert.deepEqual(
    rows.map((r) => r.serverId).sort(),
    ["server-a", "server-b"]
  );
});

test("deleteByServerId returns true and removes the row when it existed", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ serverId: "server-a" }));

  const deleted = await repo.deleteByServerId({ workspaceId: WORKSPACE, serverId: "server-a" });

  assert.equal(deleted, true);
  assert.equal(await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "server-a" }), null);
});

test("deleteByServerId returns false and changes nothing when no row matches", async () => {
  const repo = makeRepo();

  const deleted = await repo.deleteByServerId({ workspaceId: WORKSPACE, serverId: "does-not-exist" });

  assert.equal(deleted, false);
});

test("deleteByServerId never crosses a workspace boundary", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ workspaceId: WORKSPACE, serverId: "server-a" }));
  await repo.upsert(makeRecord({ workspaceId: OTHER_WORKSPACE, serverId: "server-a" }));

  const deleted = await repo.deleteByServerId({ workspaceId: WORKSPACE, serverId: "server-a" });

  assert.equal(deleted, true);
  assert.equal(await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "server-a" }), null);
  assert.ok(
    await repo.findByServerId({ workspaceId: OTHER_WORKSPACE, serverId: "server-a" }),
    "the other workspace's row must survive"
  );
});
