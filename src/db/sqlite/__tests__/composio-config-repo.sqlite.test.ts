import assert from "node:assert/strict";
import test from "node:test";

import type { ComposioConfigRecord } from "../../../connectors/composio-config-store.js";
import { workspaces } from "../../schema.js";
import { SqliteComposioConfigRepo } from "../composio-config-repo.sqlite.js";
import { openContentDb } from "../content-db.js";

/**
 * @file `SqliteComposioConfigRepo` against a real, migrated `content.db` (`:memory:`).
 *
 * What only a real DB can prove, and an in-memory-Map double cannot: migration `0034`'s
 * `key_generation` column really exists with its `DEFAULT 0`, and
 * `updateAuthConfigIdsIfGenerationMatches` really compiles to a single conditional `UPDATE` whose
 * `changes` count is the compare-and-swap result — the guard that stops a delayed auth-config write
 * from reverting a key rotation.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const NOW = "2026-08-09T00:00:00.000Z";
const LATER = "2026-08-09T01:00:00.000Z";

function makeRecord(overrides: Partial<ComposioConfigRecord> = {}): ComposioConfigRecord {
  return {
    workspaceId: WORKSPACE,
    sealed: { keyId: "k1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
    keyTail: "1111",
    authConfigIds: {},
    keyGeneration: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeDb() {
  const db = openContentDb(":memory:");
  for (const id of [WORKSPACE, OTHER_WORKSPACE]) {
    db.insert(workspaces).values({ id, name: id, slug: id, createdAt: NOW }).onConflictDoNothing().run();
  }
  return db;
}

function makeRepo() {
  return new SqliteComposioConfigRepo(makeDb());
}

test("upsert then find round-trips a sealed record, key generation included", async () => {
  const repo = makeRepo();
  const record = makeRecord({ authConfigIds: { github: "ac_github_1" }, keyGeneration: 7 });

  await repo.upsert(record);

  assert.deepEqual(await repo.findByWorkspaceId(WORKSPACE), record);
});

test("an unwritten workspace reads as null", async () => {
  assert.equal(await makeRepo().findByWorkspaceId(WORKSPACE), null);
});

test("the conditional update applies when the generation still matches", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ keyGeneration: 3 }));

  const applied = await repo.updateAuthConfigIdsIfGenerationMatches({
    workspaceId: WORKSPACE,
    expectedGeneration: 3,
    authConfigIds: { github: "ac_github_1" },
    updatedAt: LATER,
  });

  assert.equal(applied, true);
  const row = await repo.findByWorkspaceId(WORKSPACE);
  assert.deepEqual(row?.authConfigIds, { github: "ac_github_1" });
  assert.equal(row?.updatedAt, LATER);
});

test("the conditional update writes NOTHING when the generation has moved on", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ keyGeneration: 3 }));
  // The rotation the delayed writer never saw.
  await repo.upsert(
    makeRecord({
      keyGeneration: 4,
      keyTail: "2222",
      sealed: { keyId: "k2", ciphertext: "bmV3", nonce: "bm9uY2Uy", alg: "aes-256-gcm" },
      updatedAt: LATER,
    })
  );

  const applied = await repo.updateAuthConfigIdsIfGenerationMatches({
    workspaceId: WORKSPACE,
    expectedGeneration: 3,
    authConfigIds: { github: "ac_provisioned_under_the_new_key" },
    updatedAt: "2026-08-09T02:00:00.000Z",
  });

  assert.equal(applied, false);
  const row = await repo.findByWorkspaceId(WORKSPACE);
  assert.deepEqual(row?.authConfigIds, {}, "the discarded ids must not be stored");
  assert.equal(row?.keyTail, "2222", "the rotated key must be intact");
  assert.equal(row?.updatedAt, LATER, "not even updated_at may be touched by a refused write");
});

test("the conditional update cannot carry any other column back with it", async () => {
  // The structural half of the fix: the SET list names only `auth_config_ids`/`updated_at`, so even
  // a matching generation gives a caller no way to rewrite the sealed key it happens to be holding.
  const repo = makeRepo();
  const stored = makeRecord({ authConfigIds: { github: "ac_github_1" } });
  await repo.upsert(stored);

  await repo.updateAuthConfigIdsIfGenerationMatches({
    workspaceId: WORKSPACE,
    expectedGeneration: 0,
    authConfigIds: {},
    updatedAt: LATER,
  });

  const row = await repo.findByWorkspaceId(WORKSPACE);
  assert.deepEqual(row?.sealed, stored.sealed);
  assert.equal(row?.keyTail, stored.keyTail);
  assert.equal(row?.createdAt, stored.createdAt);
  assert.deepEqual(row?.authConfigIds, {}, "an empty map clears the column rather than storing \"{}\"");
});

test("the conditional update never crosses a workspace boundary", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ workspaceId: OTHER_WORKSPACE, authConfigIds: { github: "ac_theirs" } }));

  const applied = await repo.updateAuthConfigIdsIfGenerationMatches({
    workspaceId: WORKSPACE,
    expectedGeneration: 0,
    authConfigIds: { github: "ac_mine" },
    updatedAt: LATER,
  });

  assert.equal(applied, false, "a workspace with no row of its own must not match another's");
  assert.deepEqual((await repo.findByWorkspaceId(OTHER_WORKSPACE))?.authConfigIds, { github: "ac_theirs" });
});

test("a row written without key_generation — the pre-0034 shape — reads back at 0 via the column DEFAULT", async () => {
  // Proves the migration is genuinely additive rather than something existing installs have to be
  // backfilled through: an INSERT that never names `key_generation`, exactly as every row written
  // before 0034 was, is accepted and lands on the default instead of NULL.
  const db = makeDb();
  db.$client
    .prepare(
      "INSERT INTO composio_config (workspace_id, sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg, key_tail, auth_config_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(WORKSPACE, "k1", "Y2lwaGVy", "bm9uY2U=", "aes-256-gcm", "1111", null, NOW, NOW);

  const repo = new SqliteComposioConfigRepo(db);
  assert.equal((await repo.findByWorkspaceId(WORKSPACE))?.keyGeneration, 0);

  // ...and such a row is immediately usable by the compare-and-swap, no backfill needed.
  assert.equal(
    await repo.updateAuthConfigIdsIfGenerationMatches({
      workspaceId: WORKSPACE,
      expectedGeneration: 0,
      authConfigIds: { github: "ac_github_1" },
      updatedAt: LATER,
    }),
    true
  );
});
