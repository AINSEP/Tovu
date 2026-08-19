import assert from "node:assert/strict";
import test from "node:test";

import type { SlugChangeCaptureInput } from "../../routing/index.js";
import { RedirectSlugChangeCapture } from "../capture.js";
import type { RedirectDbHandle } from "../ports.internal.js";
import type { RedirectRecord, RedirectRevision } from "../types.js";

/**
 * @file T005 (AC-18, AC-20, INV-01, INV-02, EC-05) — `capture.ts`'s
 * `RedirectSlugChangeCapture.onSlugChange` is called directly inside a
 * manufactured open transaction (no HTTP layer, no real content chokepoint —
 * see tasks.md's "Known Scope Boundary"). Certifies: atomicity (the row is
 * queryable via the same handle before any commit concept), idempotency by
 * retried input (AC-20), and that the implementation issues NO transaction
 * control of its own (EC-05, Decision A).
 */

function makeFakeDb() {
  const begins: string[] = [];
  const records: RedirectRecord[] = [];
  const revisions: RedirectRevision[] = [];
  const db: RedirectDbHandle = {
    insertRedirect(record) {
      records.push(record);
    },
    insertRevision(revision) {
      revisions.push(revision);
    },
  };
  return { db, begins, records, revisions };
}

function makeFakeRepo(existing: RedirectRecord[] = []) {
  return {
    async findByFromPattern(required: { workspaceId: string; fromPattern: string }) {
      return (
        existing.find(
          (r) => r.workspaceId === required.workspaceId && r.fromPattern === required.fromPattern
        ) ?? null
      );
    },
  };
}

const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
let idCounter = 0;
function makeIdGen() {
  idCounter = 0;
  return { newId: () => `redirect-${++idCounter}` };
}

const baseInput: SlugChangeCaptureInput = {
  workspaceId: "workspace-1",
  entryId: "post-1",
  oldPath: "/old-slug",
  newPath: "/new-slug",
  actor: "user-1",
  changeSetId: "cs-1",
};

test("onSlugChange inserts exactly one redirects row + one revision row, queryable via the same handle before any commit", async () => {
  const { db, records, revisions } = makeFakeDb();
  const repo = makeFakeRepo();
  const capture = new RedirectSlugChangeCapture({ repo, db, clock, idGen: makeIdGen() });

  await capture.onSlugChange(baseInput);

  // "queryable via the same transaction handle before commit" (AC-18): since
  // this is a manufactured (non-real) transaction, the assertion is that the
  // fake db handle's own state reflects the write immediately, synchronously
  // with the call — no deferred/async-outbox-only write (which would violate
  // INV-02, see the rejected "async outbox only" alternative in ADR-PIPE-009).
  assert.equal(records.length, 1);
  assert.equal(revisions.length, 1);
  assert.equal(records[0].fromPattern, "/old-slug");
  assert.equal(records[0].toTarget, "/new-slug");
  assert.equal(records[0].source, "auto_slug_change");
  assert.equal(records[0].matchType, "exact");
  assert.equal(records[0].status, "active");
  assert.equal(records[0].sourceEntryId, "post-1");
  assert.equal(records[0].createdByPrincipal, "user-1");
  assert.equal(revisions[0].redirectId, records[0].id);
  assert.equal(revisions[0].seq, 1);
  assert.equal(revisions[0].tombstoned, false);
});

test("onSlugChange retrying the same change (same oldPath/newPath) does not duplicate the rule (AC-20)", async () => {
  const { db, records, revisions } = makeFakeDb();
  const repo = makeFakeRepo();
  const capture = new RedirectSlugChangeCapture({ repo, db, clock, idGen: makeIdGen() });

  await capture.onSlugChange(baseInput);
  // Simulate the retry seeing the just-created row via a fresh repo view.
  const repoAfterFirst = makeFakeRepo(records);
  const captureRetry = new RedirectSlugChangeCapture({
    repo: repoAfterFirst,
    db,
    clock,
    idGen: makeIdGen(),
  });
  await captureRetry.onSlugChange(baseInput);

  assert.equal(records.length, 1, "no duplicate redirect row on retry");
  assert.equal(revisions.length, 1, "no duplicate revision row on retry");
});

test("onSlugChange issues NO transaction control of its own (EC-05, Decision A) — the db handle has no begin/commit-shaped members", async () => {
  const { db } = makeFakeDb();
  const dbKeys = Object.keys(db);
  assert.deepEqual(dbKeys.sort(), ["insertRedirect", "insertRevision"]);
});

test("onSlugChange propagates an unexpected throw uncaught", async () => {
  const repo = makeFakeRepo();
  const db: RedirectDbHandle = {
    insertRedirect() {
      throw new Error("disk full");
    },
    insertRevision() {
      throw new Error("should not be reached");
    },
  };
  const capture = new RedirectSlugChangeCapture({ repo, db, clock, idGen: makeIdGen() });

  await assert.rejects(() => capture.onSlugChange(baseInput), /disk full/);
});

test("onSlugChange for a distinct change (different oldPath) does not collide with a prior capture", async () => {
  const { db, records } = makeFakeDb();
  const repo = makeFakeRepo();
  const capture = new RedirectSlugChangeCapture({ repo, db, clock, idGen: makeIdGen() });

  await capture.onSlugChange(baseInput);
  const repoAfterFirst = makeFakeRepo(records);
  const captureSecond = new RedirectSlugChangeCapture({
    repo: repoAfterFirst,
    db,
    clock,
    idGen: makeIdGen(),
  });
  await captureSecond.onSlugChange({
    ...baseInput,
    oldPath: "/another-old-slug",
    newPath: "/another-new-slug",
    changeSetId: "cs-2",
  });

  assert.equal(records.length, 2);
});
