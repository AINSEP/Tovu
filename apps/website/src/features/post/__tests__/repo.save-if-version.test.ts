import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import type { PostAutosaveSnapshot, PostRecord, PostRepoPort } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { SqlitePostRepo } from "../repo.sqlite.js";

/**
 * @file `PostRepoPort.saveIfVersion` — the conditional half of `updatePost`'s compare-and-set
 * (2026-09-07, fable bugs audit C01), proven identically against BOTH adapters (rule-of-two, per
 * `repo.sqlite.ts`'s own header).
 *
 * `post.concurrent-save.test.ts` proves the DOMAIN behaviour, and it proves it against the
 * in-memory adapter. That is exactly the shape of bug this repo keeps finding — a correct primitive
 * whose real sink never got it — so the SQL predicate needs its own evidence: the guard that lives
 * in `eq(posts.version, ifVersion)` is the one production actually runs.
 *
 * The load-bearing tests are the REJECTIONS, not the happy path. "A matching version writes" passes
 * under a `saveIfVersion` that ignores `ifVersion` entirely and just calls the old unconditional
 * upsert; what that impostor cannot pass is "a superseded basis writes NOTHING — not the body, not
 * the title, not the version" and "an absent row is not inserted".
 */

const WS = "ws-1";
const OTHER_WS = "ws-2";
const ID = "post-1";

function baseRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: ID,
    workspaceId: WS,
    title: "Original title",
    slug: "original",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "original" }] }] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "draft",
    kind: "post",
    updatedAt: "2026-09-07T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

/** The record a winning save would write: same row, next version, different everything else. */
function nextRecord(from: PostRecord, text: string): PostRecord {
  return {
    ...from,
    title: `Title — ${text}`,
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    updatedAt: "2026-09-07T02:00:00.000Z",
    version: from.version + 1,
  };
}

function openTempSqliteRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "post-save-if-version-sqlite-"));
  const db = openContentDb(path.join(tmpDir, "content.db"));
  return { repo: new SqlitePostRepo(db), cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }) };
}

/** Runs the same behavioral contract against both `PostRepoPort` adapters. `withRepo` hands the
 *  test a fresh repo (already seeded with `baseRecord()`) and a matching teardown. */
function runSaveIfVersionContract(
  name: string,
  withRepo: () => Promise<{ repo: PostRepoPort; teardown: () => void }>
) {
  test(`${name}: applies when the row is still at ifVersion`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const seeded = baseRecord();
      const result = await repo.saveIfVersion({ record: nextRecord(seeded, "winner"), ifVersion: 1 });

      assert.deepEqual(result, { applied: true });
      const after = await repo.findById({ workspaceId: WS, id: ID });
      assert.equal(after?.version, 2);
      assert.equal(after?.title, "Title — winner");
      assert.deepEqual(after?.bodyJson, nextRecord(seeded, "winner").bodyJson);
    } finally {
      teardown();
    }
  });

  test(`${name}: a superseded basis writes NOTHING — no body, no title, no version bump`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const seeded = baseRecord();
      // Somebody else won the row first.
      const winner = nextRecord(seeded, "winner");
      assert.deepEqual(await repo.saveIfVersion({ record: winner, ifVersion: 1 }), { applied: true });

      // A second writer built on the same stale basis. Its record even claims version 2, exactly as
      // `buildUpdatedPost` would compute it from the stale read — an unconditional upsert would
      // land it and the row would never reveal that two saves happened.
      const loser = nextRecord(seeded, "loser");
      const result = await repo.saveIfVersion({ record: loser, ifVersion: 1 });

      assert.deepEqual(result, { applied: false });
      const after = await repo.findById({ workspaceId: WS, id: ID });
      assert.equal(after?.title, "Title — winner", "the winner's title must survive");
      assert.deepEqual(after?.bodyJson, winner.bodyJson, "the winner's body must survive");
      assert.equal(after?.version, 2, "a rejected write must not advance the version");
    } finally {
      teardown();
    }
  });

  test(`${name}: an absent row reports applied:false and is NOT inserted — this is never an upsert`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const ghost = baseRecord({ id: "no-such-post", version: 8 });
      const result = await repo.saveIfVersion({ record: ghost, ifVersion: 7 });

      assert.deepEqual(result, { applied: false });
      assert.equal(
        await repo.findById({ workspaceId: WS, id: "no-such-post" }),
        null,
        "a row another writer deleted must stay deleted, not be resurrected by a losing save"
      );
    } finally {
      teardown();
    }
  });

  test(`${name}: the workspace is part of the match — a right id and version in the wrong workspace writes nothing`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const foreign = { ...nextRecord(baseRecord(), "cross-tenant"), workspaceId: OTHER_WS };
      const result = await repo.saveIfVersion({ record: foreign, ifVersion: 1 });

      assert.deepEqual(result, { applied: false });
      const after = await repo.findById({ workspaceId: WS, id: ID });
      assert.equal(after?.title, "Original title");
      assert.equal(after?.version, 1);
    } finally {
      teardown();
    }
  });

  test(`${name}: a parked autosave snapshot survives an applied saveIfVersion — same columns save() writes, no more`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const snapshot: PostAutosaveSnapshot = {
        baseVersion: 1,
        bodyJson: { type: "doc", content: [] },
        savedAt: "2026-09-07T01:00:00.000Z",
      } as PostAutosaveSnapshot;
      assert.deepEqual(await repo.writeAutosave({ workspaceId: WS, id: ID, snapshot }), { applied: true });

      await repo.saveIfVersion({ record: nextRecord(baseRecord(), "winner"), ifVersion: 1 });

      // `PostRecord` carries no autosave field, so a whole-row write must leave that column exactly
      // where it is — `writeAutosave`/`clearAutosave` are its only writers.
      assert.deepEqual(await repo.readAutosave({ workspaceId: WS, id: ID }), snapshot);
    } finally {
      teardown();
    }
  });
}

runSaveIfVersionContract("InMemoryPostRepo", async () => {
  const repo = new InMemoryPostRepo([baseRecord()]);
  return { repo, teardown: () => {} };
});

runSaveIfVersionContract("SqlitePostRepo", async () => {
  const { repo, cleanup } = openTempSqliteRepo();
  await repo.save(baseRecord());
  return { repo, teardown: cleanup };
});
