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

test("replaceWorkspace commits every upsert and the tombstone delete together", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ providerId: "grok" }));

  const written = await repo.replaceWorkspace({
    workspaceId: WORKSPACE,
    plan: () => ({
      upserts: [makeRecord({ providerId: "openai", model: "dall-e-3" })],
      tombstoneProviderIds: ["grok"],
    }),
  });

  assert.deepEqual(written.map((r) => r.providerId), ["openai"]);
  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.deepEqual(rows.map((r) => r.providerId).sort(), ["openai"]);
});

test("replaceWorkspace rolls back writes it had already applied when a later write in the same transaction fails (atomicity proof)", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ providerId: "grok", model: "kept" }));

  await assert.rejects(
    () =>
      repo.replaceWorkspace({
        workspaceId: WORKSPACE,
        plan: () => ({
          upserts: [
            makeRecord({ providerId: "openai", model: "dall-e-3" }),
            // `keyTail` with no ciphertext — the CHECK rejects this row, and it is planned AFTER a
            // row the transaction has already written.
            makeRecord({ providerId: "fal", keyTail: "1234" }),
          ],
          tombstoneProviderIds: ["grok"],
        }),
      }),
    /CHECK constraint failed/
  );

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.deepEqual(
    rows.map((r) => r.providerId).sort(),
    ["grok"],
    "the openai row written before the failure must roll back, and the planned tombstone must not be reached"
  );
  assert.equal(rows[0]?.model, "kept");
});

test("replaceWorkspace applies nothing when the planner itself throws", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ providerId: "grok", model: "kept" }));

  await assert.rejects(
    () =>
      repo.replaceWorkspace({
        workspaceId: WORKSPACE,
        plan: () => {
          throw new Error("planner refused");
        },
      }),
    /planner refused/
  );

  assert.deepEqual((await repo.listByWorkspaceId(WORKSPACE)).map((r) => r.model), ["kept"]);
});

test("the planner is handed the rows as of the transaction, never a caller's earlier snapshot", async () => {
  // The staleness half of the atomicity defect: the store used to read the workspace itself, merge
  // against that snapshot, and only then open a transaction. Anything committed in between was
  // overwritten by the merge. The read now lives inside the boundary.
  const repo = makeRepo();
  await repo.upsert(makeRecord({ providerId: "openai", model: "v1" }));
  const staleSnapshot = await repo.listByWorkspaceId(WORKSPACE);
  await repo.upsert(makeRecord({ providerId: "openai", model: "v2" }));

  let seenByPlanner: string[] = [];
  await repo.replaceWorkspace({
    workspaceId: WORKSPACE,
    plan: (existing) => {
      seenByPlanner = existing.map((row) => `${row.providerId}:${row.model}`);
      return { upserts: [], tombstoneProviderIds: [] };
    },
  });

  assert.deepEqual(staleSnapshot.map((r) => r.model), ["v1"]);
  assert.deepEqual(seenByPlanner, ["openai:v2"], "the planner must see committed state, not the caller's older read");
});

test("replaceWorkspace never reads or tombstones another workspace's rows", async () => {
  const repo = makeRepo();
  await repo.upsert(makeRecord({ workspaceId: OTHER_WORKSPACE, providerId: "openai" }));
  await repo.upsert(makeRecord({ workspaceId: WORKSPACE, providerId: "grok" }));

  let seenByPlanner: string[] = [];
  await repo.replaceWorkspace({
    workspaceId: WORKSPACE,
    plan: (existing) => {
      seenByPlanner = existing.map((row) => row.providerId);
      return { upserts: [], tombstoneProviderIds: ["grok", "openai"] };
    },
  });

  assert.deepEqual(seenByPlanner, ["grok"]);
  assert.deepEqual((await repo.listByWorkspaceId(OTHER_WORKSPACE)).map((r) => r.providerId), ["openai"]);
  assert.deepEqual(await repo.listByWorkspaceId(WORKSPACE), []);
});

test("a reader polling on the shared connection can never observe a half-replaced map", async () => {
  // Codex's live reproduction against better-sqlite3: the old `transaction()` awaited between each
  // upsert and the tombstone delete, and because this connection is shared and synchronous, another
  // queued continuation could run mid-transaction and read uncommitted, half-replaced state
  // (`[a:new, b:old]`). `replaceWorkspace`'s body has no suspension point, so there is no turn of
  // the event loop at which such a state exists.
  const repo = makeRepo();
  await repo.upsert(makeRecord({ providerId: "openai", model: "old" }));
  await repo.upsert(makeRecord({ providerId: "grok", model: "old" }));

  const modelsNow = async (): Promise<string> =>
    (await repo.listByWorkspaceId(WORKSPACE))
      .map((row) => `${row.providerId}:${row.model}`)
      .sort()
      .join(",");

  let replacing = true;
  const observations: string[] = [];
  const observer = (async () => {
    for (let turn = 0; turn < 5000 && replacing; turn += 1) {
      observations.push(await modelsNow());
      await Promise.resolve();
    }
  })();

  await repo.replaceWorkspace({
    workspaceId: WORKSPACE,
    plan: () => ({
      upserts: [
        makeRecord({ providerId: "openai", model: "new" }),
        makeRecord({ providerId: "grok", model: "new" }),
      ],
      tombstoneProviderIds: [],
    }),
  });
  replacing = false;
  await observer;

  assert.ok(observations.length > 0);
  for (const observed of observations) {
    assert.ok(
      observed === "grok:old,openai:old" || observed === "grok:new,openai:new",
      `uncommitted half-replaced state was observable: ${observed}`
    );
  }
});

test("an async planner smuggled past the type system fails closed instead of reopening the interleaving window", async () => {
  // `MediaProviderCredentialReplacePlanner` forbids a promise return, which is the primary defence.
  // This pins the runtime behaviour behind it: a planner cast past that type does not quietly write
  // a partial map or leave the transaction hanging open — it aborts and rolls back.
  const repo = makeRepo();
  await repo.upsert(makeRecord({ providerId: "grok", model: "kept" }));

  await assert.rejects(() =>
    repo.replaceWorkspace({
      workspaceId: WORKSPACE,
      plan: (async () => ({
        upserts: [makeRecord({ providerId: "openai" })],
        tombstoneProviderIds: ["grok"],
      })) as unknown as Parameters<typeof repo.replaceWorkspace>[0]["plan"],
    })
  );

  assert.deepEqual((await repo.listByWorkspaceId(WORKSPACE)).map((r) => r.providerId), ["grok"]);

  // ...and the connection is usable afterwards, proving the aborted transaction really closed.
  await repo.upsert(makeRecord({ providerId: "openai" }));
  assert.deepEqual((await repo.listByWorkspaceId(WORKSPACE)).map((r) => r.providerId).sort(), ["grok", "openai"]);
});
