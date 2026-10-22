import assert from "node:assert/strict";
import test from "node:test";

import {
  comparePostsByDisplayDate,
  currentIso,
  isLiveAt,
  isScheduledAt,
  postDisplayDateIso,
} from "../../scheduled-publish.js";

/** The scheduled-publish rule: a published record whose `publishAt` is still ahead of "now" is
 *  scheduled, not live; trashed records are never live; display order is newest-first, then id. */

const NOW = "2026-05-01T12:00:00.000Z";
const LATER = "2026-05-02T00:00:00.000Z";
const EARLIER = "2026-04-30T00:00:00.000Z";

test("currentIso returns the wall clock as round-trippable ISO text", () => {
  const before = Date.now();
  const iso = currentIso();
  const after = Date.now();
  assert.equal(new Date(iso).toISOString(), iso);
  assert.ok(Date.parse(iso) >= before && Date.parse(iso) <= after);
});

test("isScheduledAt: only a published record with a future publishAt is scheduled", () => {
  assert.equal(isScheduledAt({ status: "published", publishAt: LATER }, NOW), true);
  assert.equal(isScheduledAt({ status: "published", publishAt: NOW }, NOW), false, "publishAt == now is live");
  assert.equal(isScheduledAt({ status: "published", publishAt: EARLIER }, NOW), false);
  assert.equal(isScheduledAt({ status: "published", publishAt: null }, NOW), false);
  assert.equal(isScheduledAt({ status: "published" }, NOW), false);
  assert.equal(isScheduledAt({ status: "draft", publishAt: LATER }, NOW), false);
});

test("postDisplayDateIso prefers publishAt and falls back to updatedAt", () => {
  assert.equal(postDisplayDateIso({ publishAt: LATER, updatedAt: EARLIER }), LATER);
  assert.equal(postDisplayDateIso({ publishAt: null, updatedAt: EARLIER }), EARLIER);
  assert.equal(postDisplayDateIso({ updatedAt: NOW }), NOW);
});

test("comparePostsByDisplayDate sorts newest display date first, then ascending id", () => {
  const posts = [
    { id: "b", updatedAt: EARLIER },
    { id: "c", publishAt: LATER, updatedAt: EARLIER },
    { id: "a", updatedAt: EARLIER },
    { id: "d", publishAt: NOW, updatedAt: LATER },
  ];
  assert.deepEqual([...posts].sort(comparePostsByDisplayDate).map((p) => p.id), ["c", "d", "a", "b"]);
  assert.equal(comparePostsByDisplayDate({ id: "x", updatedAt: NOW }, { id: "x", updatedAt: NOW }), 0);
  assert.equal(comparePostsByDisplayDate({ id: "y", updatedAt: NOW }, { id: "x", updatedAt: NOW }), 1);
  assert.equal(comparePostsByDisplayDate({ id: "x", updatedAt: EARLIER }, { id: "x", updatedAt: NOW }), 1);
  assert.equal(comparePostsByDisplayDate({ id: "x", updatedAt: NOW }, { id: "x", updatedAt: EARLIER }), -1);
});

test("isLiveAt: published, not trashed and not still scheduled", () => {
  assert.equal(isLiveAt({ status: "published", publishAt: EARLIER }, NOW), true);
  assert.equal(isLiveAt({ status: "published", deletedAt: null }, NOW), true);
  assert.equal(isLiveAt({ status: "published", deletedAt: EARLIER }, NOW), false);
  assert.equal(isLiveAt({ status: "published", publishAt: LATER }, NOW), false);
  assert.equal(isLiveAt({ status: "draft" }, NOW), false);
});
