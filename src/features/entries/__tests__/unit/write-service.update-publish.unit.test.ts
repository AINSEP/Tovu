import assert from "node:assert/strict";
import test from "node:test";

import { ContentTypeNotActiveError } from "../../errors";
import { publishEntry, unpublishEntry, updateEntry } from "../../write-service";

/**
 * @file REQ-28 (SPEC-020) — `updateEntry`/`publishEntry`/`unpublishEntry` vs. a non-active owning
 * content type: `tombstone` blocks all three; `deprecated` blocks none of them (the inverse of
 * REQ-10, which blocks only *new* entry creation).
 *
 * Covers: AC-44 (UPDATE_ENTRY rejected for tombstoned type), AC-45 (PUBLISH/UNPUBLISH rejected,
 * no outbox event), AC-46 (all three succeed normally for a deprecated owning type), EC-13, EC-14.
 */

const NOW = "2026-07-15T00:00:00.000Z";
const clock = { nowIso: () => NOW };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

function entry(overrides: Partial<{ status: "draft" | "published" | "unpublished"; version: number }> = {}) {
  return { id: "entry-1", workspaceId: "ws-1", type: "recipe", slug: "chili", status: "draft" as const, title: "Chili", fieldsJson: { ext: { site: {} } }, version: 1, ...overrides };
}

function fakeEntryRepo(seed: ReturnType<typeof entry>) {
  let stored = seed;
  return {
    getStored: () => stored,
    findById: async () => stored,
    save: async (row: typeof seed) => {
      stored = row;
    },
    appendRevision: async () => undefined,
    transaction: async <T>(fn: () => Promise<T>) => fn(),
  };
}

function fakeContentTypeRepo(status: "active" | "deprecated" | "tombstone") {
  return { findByKey: async () => ({ workspaceId: "ws-1", key: "recipe", status, fields: [] }) };
}

function fakeOutbox() {
  const events: unknown[] = [];
  return { events, enqueue: async (e: unknown) => { events.push(e); } };
}

test("AC-44: UPDATE_ENTRY against an entry whose owning type is 'tombstone' is rejected with CONTENT_TYPE_NOT_ACTIVE, no update applied", async () => {
  const entryRepo = fakeEntryRepo(entry());
  const contentTypeRepo = fakeContentTypeRepo("tombstone");

  const result = await updateEntry({
    deps: { entryRepo, contentTypeRepo, clock, authorize: alwaysAllow, outbox: fakeOutbox() },
    input: { workspaceId: "ws-1", actorId: "user-1", id: "entry-1", title: "Updated Title", expectedVersion: 1 },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.error instanceof ContentTypeNotActiveError);
  assert.equal(entryRepo.getStored().title, "Chili", "no update may be applied when rejected");
});

test("AC-45: PUBLISH_ENTRY and UNPUBLISH_ENTRY against a tombstoned owning type are both rejected, no status transition, no outbox event", async () => {
  for (const action of [publishEntry, unpublishEntry]) {
    const seed = action === publishEntry ? entry({ status: "draft" }) : entry({ status: "published" });
    const entryRepo = fakeEntryRepo(seed);
    const contentTypeRepo = fakeContentTypeRepo("tombstone");
    const outbox = fakeOutbox();

    const result = await action({
      deps: { entryRepo, contentTypeRepo, clock, authorize: alwaysAllow, outbox },
      input: { workspaceId: "ws-1", actorId: "user-1", id: "entry-1", expectedVersion: 1 },
    });

    assert.equal(result.ok, false);
    assert.equal(entryRepo.getStored().status, seed.status, "status must be unchanged when rejected");
    assert.equal(outbox.events.length, 0, "no outbox event may be enqueued when rejected (AC-45)");
  }
});

test("AC-46/EC-14: UPDATE_ENTRY, PUBLISH_ENTRY, and UNPUBLISH_ENTRY all succeed normally for a 'deprecated' (not tombstoned) owning type", async () => {
  const updateEntryRepo = fakeEntryRepo(entry());
  const updateContentTypeRepo = fakeContentTypeRepo("deprecated");
  const updateResult = await updateEntry({
    deps: { entryRepo: updateEntryRepo, contentTypeRepo: updateContentTypeRepo, clock, authorize: alwaysAllow, outbox: fakeOutbox() },
    input: { workspaceId: "ws-1", actorId: "user-1", id: "entry-1", title: "Updated Title", expectedVersion: 1 },
  });
  assert.equal(updateResult.ok, true, "REQ-28: deprecated only blocks new entry CREATION, not update/publish/unpublish of existing entries");

  const publishEntryRepo = fakeEntryRepo(entry({ status: "draft" }));
  const publishContentTypeRepo = fakeContentTypeRepo("deprecated");
  const publishResult = await publishEntry({
    deps: { entryRepo: publishEntryRepo, contentTypeRepo: publishContentTypeRepo, clock, authorize: alwaysAllow, outbox: fakeOutbox() },
    input: { workspaceId: "ws-1", actorId: "user-1", id: "entry-1", expectedVersion: 1 },
  });
  assert.equal(publishResult.ok, true);

  const unpublishEntryRepo = fakeEntryRepo(entry({ status: "published" }));
  const unpublishContentTypeRepo = fakeContentTypeRepo("deprecated");
  const unpublishResult = await unpublishEntry({
    deps: { entryRepo: unpublishEntryRepo, contentTypeRepo: unpublishContentTypeRepo, clock, authorize: alwaysAllow, outbox: fakeOutbox() },
    input: { workspaceId: "ws-1", actorId: "user-1", id: "entry-1", expectedVersion: 1 },
  });
  assert.equal(unpublishResult.ok, true);
});

test("EC-13: UPDATE_ENTRY against a tombstoned owning type reports CONTENT_TYPE_NOT_ACTIVE distinctly (asserted via error class), matching REQ-28's exact code", async () => {
  const entryRepo = fakeEntryRepo(entry());
  const contentTypeRepo = fakeContentTypeRepo("tombstone");

  const result = await updateEntry({
    deps: { entryRepo, contentTypeRepo, clock, authorize: alwaysAllow, outbox: fakeOutbox() },
    input: { workspaceId: "ws-1", actorId: "user-1", id: "entry-1", title: "X", expectedVersion: 1 },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.error instanceof ContentTypeNotActiveError);
});
