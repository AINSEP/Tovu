import assert from "node:assert/strict";
import test from "node:test";

import type { ConnectorCredentialRow } from "#src/platform/connectors/connector-credential-store";
import { workspaces } from "../../schema.js";
import { openContentDb } from "../content-db.js";
import { SqliteConnectorCredentialRepo } from "../composio-connector-credential-repo.sqlite.js";

/**
 * @file `SqliteConnectorCredentialRepo` against a real, migrated `content.db` (`:memory:`).
 *
 * Had ZERO test coverage of any kind before this file — confirmed via `grep -rl` across the repo
 * and via the combined-lcov cross-check (every one of `toRow`/`listByWorkspaceId`/`upsert`/
 * `deleteByConnectorId` read 0 hits, deduped). Mirrors `media-provider-credential-repo.sqlite.test.ts`'s
 * pattern (same file doc: "Same shape as media-provider-credential-repo.sqlite.ts"). What only a real
 * DB proves here: the composite `(workspace_id, connector_id)` primary key really makes `upsert`
 * update rather than duplicate, the `composio_connector_credentials_sealed_shape` CHECK really agrees
 * with this adapter's all-null-or-all-set mapping, and the `workspaces` FK really holds.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const NOW = "2026-08-21T00:00:00.000Z";
const LATER = "2026-08-21T01:00:00.000Z";

function makeRow(overrides: Partial<ConnectorCredentialRow> = {}): ConnectorCredentialRow {
  return {
    workspaceId: WORKSPACE,
    connectorId: "github",
    accountLabel: null,
    sealed: null,
    aadVersion: 0,
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
  return new SqliteConnectorCredentialRepo(db);
}

test("listByWorkspaceId returns an empty array when no rows exist", async () => {
  assert.deepEqual(await (makeRepo() as SqliteConnectorCredentialRepo).listByWorkspaceId(WORKSPACE), []);
});

test("upsert then listByWorkspaceId round-trips a sealed row exactly", async () => {
  const repo = makeRepo();
  const row = makeRow({
    accountLabel: "octocat",
    sealed: { keyId: "k1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
  });

  await repo.upsert(row);

  assert.deepEqual(await repo.listByWorkspaceId(WORKSPACE), [row]);
});

test("a row with no sealed credential round-trips with sealed: null (the CHECK's other valid shape)", async () => {
  const repo = makeRepo();
  const row = makeRow({ sealed: null });

  await repo.upsert(row);

  assert.deepEqual(await repo.listByWorkspaceId(WORKSPACE), [row]);
});

test("upsert on the same (workspaceId, connectorId) updates in place rather than duplicating", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRow({ accountLabel: "octocat", updatedAt: NOW }));

  await repo.upsert(
    makeRow({
      accountLabel: "octocat-renamed",
      sealed: { keyId: "k2", ciphertext: "bmV3", nonce: "bm9uY2Uy", alg: "aes-256-gcm" },
      updatedAt: LATER,
    })
  );

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.equal(rows.length, 1, "the composite PK must make this an UPDATE, not a second row");
  assert.equal(rows[0].accountLabel, "octocat-renamed");
  assert.equal(rows[0].updatedAt, LATER);
});

test("listByWorkspaceId returns multiple connectors for one workspace, scoped away from another workspace's rows", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRow({ connectorId: "github", accountLabel: "octocat" }));
  await repo.upsert(makeRow({ connectorId: "notion", accountLabel: "my-notion-workspace" }));
  await repo.upsert(makeRow({ workspaceId: OTHER_WORKSPACE, connectorId: "github", accountLabel: "someone-elses" }));

  const rows = await repo.listByWorkspaceId(WORKSPACE);

  assert.deepEqual(
    rows.map((r) => r.connectorId).sort(),
    ["github", "notion"]
  );
});

test("deleteByConnectorId removes exactly the targeted row, leaving a sibling connector intact", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRow({ connectorId: "github" }));
  await repo.upsert(makeRow({ connectorId: "notion" }));

  await repo.deleteByConnectorId({ workspaceId: WORKSPACE, connectorId: "github" });

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.deepEqual(rows.map((r) => r.connectorId), ["notion"]);
});

test("deleteByConnectorId never crosses a workspace boundary", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRow({ workspaceId: WORKSPACE, connectorId: "github", accountLabel: "mine" }));
  await repo.upsert(makeRow({ workspaceId: OTHER_WORKSPACE, connectorId: "github", accountLabel: "theirs" }));

  await repo.deleteByConnectorId({ workspaceId: WORKSPACE, connectorId: "github" });

  assert.deepEqual(await repo.listByWorkspaceId(WORKSPACE), []);
  assert.equal((await repo.listByWorkspaceId(OTHER_WORKSPACE)).length, 1, "the other workspace's row must survive");
});

test("deleteByConnectorId on a non-existent row is a silent no-op", async () => {
  const repo = makeRepo();
  await repo.deleteByConnectorId({ workspaceId: WORKSPACE, connectorId: "does-not-exist" });
  assert.deepEqual(await repo.listByWorkspaceId(WORKSPACE), []);
});
