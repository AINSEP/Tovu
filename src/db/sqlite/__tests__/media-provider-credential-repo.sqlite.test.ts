import assert from "node:assert/strict";
import test from "node:test";

import type { MediaProviderCredentialRecord } from "../../../media/provider-credential-store";
import { workspaces } from "../../schema";
import { openContentDb } from "../content-db";
import { SqliteMediaProviderCredentialRepo } from "../media-provider-credential-repo.sqlite";

/**
 * @file `SqliteMediaProviderCredentialRepo` against a real, migrated `content.db` (`:memory:`).
 *
 * What only a real DB can prove, and an in-memory-Map double cannot: migration `0030`'s composite
 * `(workspace_id, provider_id)` primary key really makes `upsert` update rather than duplicate, its
 * CHECK constraint really agrees with this adapter's all-null-or-all-set mapping, the `workspaces`
 * FK really holds, and `deleteByProviderIds` on an empty list really is a no-op instead of the
 * `IN ()` syntax error Drizzle would otherwise emit.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const NOW = "2026-08-09T00:00:00.000Z";

function makeRecord(overrides: Partial<MediaProviderCredentialRecord> = {}): MediaProviderCredentialRecord {
  return {
    workspaceId: WORKSPACE,
    providerId: "openai",
    baseUrl: null,
    model: null,
    sealed: null,
    keyTail: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Seeds the `workspaces` rows this table's real FK requires. */
function seedWorkspaces(db: ReturnType<typeof openContentDb>, ids: string[]): void {
  for (const id of ids) {
    db.insert(workspaces).values({ id, name: id, slug: id, createdAt: NOW }).onConflictDoNothing().run();
  }
}

function makeRepo() {
  const db = openContentDb(":memory:");
  seedWorkspaces(db, [WORKSPACE, OTHER_WORKSPACE]);
  return new SqliteMediaProviderCredentialRepo(db);
}

test("listByWorkspaceId returns an empty array when no rows exist", async () => {
  assert.deepEqual(await makeRepo().listByWorkspaceId(WORKSPACE), []);
});

test("upsert then list round-trips a sealed record exactly", async () => {
  const repo = makeRepo();
  const record = makeRecord({
    baseUrl: "https://api.openai.com/v1",
    model: "dall-e-3",
    sealed: { keyId: "k1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
    keyTail: "1234",
  });

  await repo.upsert(record);

  assert.deepEqual(await repo.listByWorkspaceId(WORKSPACE), [record]);
});

test("a keyless row round-trips with sealed and keyTail both null", async () => {
  const repo = makeRepo();
  const record = makeRecord({ baseUrl: "https://proxy.example.com/v1" });

  await repo.upsert(record);

  const [found] = await repo.listByWorkspaceId(WORKSPACE);
  assert.equal(found?.sealed, null);
  assert.equal(found?.keyTail, null);
  assert.equal(found?.baseUrl, "https://proxy.example.com/v1");
});

test("upsert on the same (workspace, provider) updates the one row rather than adding a second", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ model: "dall-e-3" }));
  await repo.upsert(makeRecord({ model: "gpt-image-2", updatedAt: "2026-08-09T01:00:00.000Z" }));

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.model, "gpt-image-2");
});

test("two providers coexist in one workspace under the composite key", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ providerId: "openai" }));
  await repo.upsert(makeRecord({ providerId: "grok" }));

  const ids = (await repo.listByWorkspaceId(WORKSPACE)).map((row) => row.providerId).sort();
  assert.deepEqual(ids, ["grok", "openai"]);
});

test("listByWorkspaceId never returns another workspace's rows", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ workspaceId: WORKSPACE, providerId: "openai" }));
  await repo.upsert(makeRecord({ workspaceId: OTHER_WORKSPACE, providerId: "grok" }));

  assert.deepEqual((await repo.listByWorkspaceId(WORKSPACE)).map((r) => r.providerId), ["openai"]);
  assert.deepEqual((await repo.listByWorkspaceId(OTHER_WORKSPACE)).map((r) => r.providerId), ["grok"]);
});

test("deleteByProviderIds removes only the named ids", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ providerId: "openai" }));
  await repo.upsert(makeRecord({ providerId: "grok" }));
  await repo.upsert(makeRecord({ providerId: "fal" }));

  await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: ["grok", "fal"] });

  assert.deepEqual((await repo.listByWorkspaceId(WORKSPACE)).map((r) => r.providerId), ["openai"]);
});

test("deleteByProviderIds on an empty list is a no-op, not an IN () syntax error", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord());

  await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: [] });

  assert.equal((await repo.listByWorkspaceId(WORKSPACE)).length, 1);
});

test("deleteByProviderIds never crosses a workspace boundary", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ workspaceId: OTHER_WORKSPACE, providerId: "openai" }));

  await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: ["openai"] });

  assert.equal((await repo.listByWorkspaceId(OTHER_WORKSPACE)).length, 1);
});

test("deleteByProviderIds on ids with no rows is harmless", async () => {
  const repo = makeRepo();
  await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: ["openai", "grok"] });
  assert.deepEqual(await repo.listByWorkspaceId(WORKSPACE), []);
});

test("the CHECK constraint rejects a half-sealed row this adapter should never build", async () => {
  const repo = makeRepo();
  await assert.rejects(
    // `keyTail` set with no ciphertext — exactly the shape the constraint exists to forbid.
    repo.upsert(makeRecord({ keyTail: "1234" })),
    /CHECK constraint failed/
  );
});

test("transaction rolls back an upsert AND a delete when a later step in the same transaction throws (atomicity proof)", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ providerId: "grok" }));

  await assert.rejects(() =>
    repo.transaction(async () => {
      // Two writes representative of `saveMediaProviderCredentials`'s whole-map replace: an upsert
      // for one provider, a delete for another.
      await repo.upsert(makeRecord({ providerId: "openai", model: "dall-e-3" }));
      await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: ["grok"] });
      throw new Error("simulated failure after both writes, before commit");
    })
  );

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.deepEqual(
    rows.map((r) => r.providerId).sort(),
    ["grok"],
    "neither the upsert nor the delete may survive a transaction that failed after both ran"
  );
});

test("transaction commits every write together when fn resolves", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ providerId: "grok" }));

  await repo.transaction(async () => {
    await repo.upsert(makeRecord({ providerId: "openai", model: "dall-e-3" }));
    await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: ["grok"] });
  });

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.deepEqual(rows.map((r) => r.providerId).sort(), ["openai"]);
});
