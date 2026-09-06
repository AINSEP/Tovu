import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import type { PostRecord, PostRepoPort } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { SqlitePostRepo } from "../repo.sqlite.js";

/**
 * @file Standing-draft autosave (2026-09-06 dispatch) — `PostRepoPort.readAutosave`/
 * `writeAutosave`/`clearAutosave`, proven identically against BOTH adapters (rule-of-two, per
 * `repo.sqlite.ts`'s own header).
 *
 * The load-bearing property under test is NOT "a write persists" (that would pass under a naive
 * unconditional `UPDATE`, which is exactly the bug this suite exists to catch): it is that a
 * `writeAutosave` whose `baseVersion` has been superseded by a real save is REJECTED, and the
 * previously-parked snapshot survives unchanged rather than being silently clobbered by stale
 * content. This is the mechanism `PostRepoPort.writeAutosave`'s own doc says makes a later
 * `clearAutosave` race-safe (a real save's `version` bump makes every earlier in-flight autosave
 * write a guaranteed no-op).
 */

function baseRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: "ws-1",
    title: "Hello",
    slug: "hello",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "draft",
    kind: "post",
    updatedAt: "2026-09-06T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function openTempSqliteRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "post-autosave-sqlite-"));
  const db = openContentDb(path.join(tmpDir, "content.db"));
  return { repo: new SqlitePostRepo(db), cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }) };
}

/** Runs the same behavioral contract against both `PostRepoPort` adapters. `withRepo` hands the
 *  test a fresh repo (already seeded with `baseRecord()`) and a matching teardown. */
function runAutosaveContract(name: string, withRepo: () => Promise<{ repo: PostRepoPort; teardown: () => void }>) {
  test(`${name}: readAutosave returns null when nothing has ever been parked`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const snapshot = await repo.readAutosave({ workspaceId: "ws-1", id: "post-1" });
      assert.equal(snapshot, null);
    } finally {
      teardown();
    }
  });

  test(`${name}: writeAutosave at the row's current version applies and round-trips`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const result = await repo.writeAutosave({
        workspaceId: "ws-1",
        id: "post-1",
        snapshot: {
          bodyFormat: "doc",
          title: "Hello",
          bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
          slug: "hello",
          baseVersion: 1,
          savedAt: "2026-09-06T00:00:01.000Z",
          savedByPrincipalId: "user-local",
        },
      });
      assert.deepEqual(result, { applied: true });

      const snapshot = await repo.readAutosave({ workspaceId: "ws-1", id: "post-1" });
      assert.deepEqual(snapshot, {
        bodyFormat: "doc",
        title: "Hello",
        bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
        slug: "hello",
        baseVersion: 1,
        savedAt: "2026-09-06T00:00:01.000Z",
        savedByPrincipalId: "user-local",
      });
    } finally {
      teardown();
    }
  });

  test(`${name}: a stale writeAutosave (baseVersion behind a real save) is rejected and does not disturb the parked snapshot`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const first = await repo.writeAutosave({
        workspaceId: "ws-1",
        id: "post-1",
        snapshot: {
          bodyFormat: "doc",
          title: "Hello",
          bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }] },
          slug: "hello",
          baseVersion: 1,
          savedAt: "2026-09-06T00:00:01.000Z",
          savedByPrincipalId: "user-local",
        },
      });
      assert.deepEqual(first, { applied: true });

      // Simulate a real Save/Publish landing in between: the only two things that ever bump
      // `version` (see `updatePost`), so this is the same version-advance a real save produces.
      const existing = await repo.findById({ workspaceId: "ws-1", id: "post-1" });
      assert.ok(existing);
      await repo.save({ ...existing, version: existing.version + 1, updatedAt: "2026-09-06T00:01:00.000Z" });

      // A late autosave tick, still carrying the OLD baseVersion, arrives after that save.
      const stale = await repo.writeAutosave({
        workspaceId: "ws-1",
        id: "post-1",
        snapshot: {
          bodyFormat: "doc",
          title: "Hello",
          bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "STALE — must not win" }] }] },
          slug: "hello",
          baseVersion: 1,
          savedAt: "2026-09-06T00:00:05.000Z",
          savedByPrincipalId: "user-local",
        },
      });
      assert.deepEqual(stale, { applied: false });

      // The snapshot on disk/in-memory is still the FIRST (accepted) write, byte-for-byte — proving
      // the stale write was ignored rather than merged, truncated, or partially applied.
      const snapshot = await repo.readAutosave({ workspaceId: "ws-1", id: "post-1" });
      assert.deepEqual(snapshot?.bodyJson, {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }],
      });
    } finally {
      teardown();
    }
  });

  test(`${name}: clearAutosave removes the snapshot unconditionally, even after the row's version has moved`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      await repo.writeAutosave({
        workspaceId: "ws-1",
        id: "post-1",
        snapshot: {
          bodyFormat: "doc",
          title: "Hello",
          bodyJson: { type: "doc", content: [] },
          slug: "hello",
          baseVersion: 1,
          savedAt: "2026-09-06T00:00:01.000Z",
          savedByPrincipalId: "user-local",
        },
      });

      const existing = await repo.findById({ workspaceId: "ws-1", id: "post-1" });
      assert.ok(existing);
      await repo.save({ ...existing, version: existing.version + 1 });

      await repo.clearAutosave({ workspaceId: "ws-1", id: "post-1" });

      const snapshot = await repo.readAutosave({ workspaceId: "ws-1", id: "post-1" });
      assert.equal(snapshot, null);
    } finally {
      teardown();
    }
  });

  test(`${name}: writeAutosave/readAutosave/clearAutosave against a row that does not exist are all safe no-ops`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const result = await repo.writeAutosave({
        workspaceId: "ws-1",
        id: "no-such-post",
        snapshot: {
          bodyFormat: "doc",
          title: "Hello",
          bodyJson: {},
          slug: "hello",
          baseVersion: 1,
          savedAt: "2026-09-06T00:00:01.000Z",
          savedByPrincipalId: "user-local",
        },
      });
      assert.deepEqual(result, { applied: false });
      assert.equal(await repo.readAutosave({ workspaceId: "ws-1", id: "no-such-post" }), null);
      await assert.doesNotReject(() => repo.clearAutosave({ workspaceId: "ws-1", id: "no-such-post" }));
    } finally {
      teardown();
    }
  });
}

runAutosaveContract("InMemoryPostRepo", async () => {
  const repo = new InMemoryPostRepo([baseRecord()]);
  return { repo, teardown: () => {} };
});

runAutosaveContract("SqlitePostRepo", async () => {
  const { repo, cleanup } = openTempSqliteRepo();
  await repo.save(baseRecord());
  return { repo, teardown: cleanup };
});
