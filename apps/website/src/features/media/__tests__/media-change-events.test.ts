import { MediaStillReferencedError } from "@jini-ai/cms/media";
import assert from "node:assert/strict";
import { test } from "node:test";

import { SqlOutboxAdapter } from "@jini-ai/db/events";
import type { MediaRecord } from "@jini-ai/cms/media";

import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { schemaErasedKernel, type ContentKernel } from "#src/platform/db/content-kernel";
import { SqlMediaRepo, type MediaChangeSink } from "#src/platform/db/repos/media-repo";
import { OUTBOX_TABLES } from "#src/platform/db/sqlite/outbox-repo.sqlite";
import { createMediaTrashAdapter } from "@jini-ai/cms/trash/site/adapters/media";
import { createMediaSearchChangeSink, createMediaSearchSource, isPublicSearchImage, MEDIA_SEARCH_CHANGED_EVENT } from "@jini-ai/search/site/media-search-source";

/**
 * @file P10-M5.T2 — the media-change event is written by the outbox INSIDE the media write's own
 * transaction, on the real repo over SQLite and PGlite: a failed or refused write leaves no event, a
 * failed enqueue undoes the write, every committed description change / trash / restore / purge
 * enqueues exactly one event, and a repeated report of the same write stays one event.
 * A file an admin can read is not necessarily a public search document: Library documents never emit.
 */

const WS = "ws-media-events";
const T0 = "2026-11-01T10:00:00.000Z";

function image(id: string, overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    id, workspaceId: WS, kind: "media", originalFilename: null, title: `Title ${id}`, slug: `slug-${id}`, alt: "", caption: "", credit: "",
    source: { sha256: id.padEnd(64, "a"), contentType: "image/jpeg" }, status: "active", createdAt: T0, updatedAt: T0, version: 1,
    width: null, height: null, cssClass: null, htmlAttributes: null, captions: null, description: null, ...overrides,
  } as MediaRecord;
}

/** The next CAS write of `record`, one version and one second later. */
function next(record: MediaRecord, patch: Partial<MediaRecord>): MediaRecord {
  return { ...record, ...patch, version: record.version + 1, updatedAt: new Date(Date.parse(record.updatedAt) + 1000).toISOString() };
}

function harness(kernel: ContentKernel) {
  const outbox = new SqlOutboxAdapter({ kernel: schemaErasedKernel({ store: kernel }), tables: OUTBOX_TABLES, claimLeaseMs: 60_000 });
  const real = createMediaSearchChangeSink({ outbox, nowIso: () => T0 });
  const control = { failAfterEnqueue: false };
  // The real sink, then (when armed) a failure after its outbox row is written — standing in for
  // anything that fails later in the same transaction.
  const changes: MediaChangeSink = {
    async changed(change) {
      await real.changed(change);
      if (control.failAfterEnqueue) { control.failAfterEnqueue = false; throw new Error("the disk is full"); }
    },
  };
  const repo = new SqlMediaRepo(kernel, { changes });
  const events = async () => (await kernel.run((db) => db.selectFrom("outbox_events").select(["id", "event_json"]).where("workspace_id", "=", WS).orderBy("id").execute()))
    .map((row) => ({ id: row.id, name: (JSON.parse(row.event_json) as { name: string }).name }));
  return { kernel, repo, changes, real, control, events };
}

for (const each of eachDialect({ tables: ["media", "media_slug_history", "outbox_events"], make: harness })) {
  test(`[${each.name}] a failed media write leaves no media-change event`, async () => {
    const h = each.make();
    const img = image("img-1");
    assert.deepEqual(await h.repo.insertIfAbsent(img), { applied: true });
    await h.repo.insertIfAbsent(image("other", { slug: "taken" }));
    const before = await h.events();
    assert.equal(before.length, 2);

    // Refused (stale version) and failed (slug collision) writes emit nothing.
    assert.deepEqual(await h.repo.saveIfVersion({ record: next(img, { description: "stale" }), ifVersion: 99 }), { applied: false });
    await assert.rejects(h.repo.saveIfVersion({ record: next(img, { slug: "taken" }), ifVersion: 1 }));
    // A failure after the event row was written undoes BOTH: the event and the media write are one commit.
    h.control.failAfterEnqueue = true;
    await assert.rejects(h.repo.saveIfVersion({ record: next(img, { description: "never committed" }), ifVersion: 1 }), /disk is full/);
    assert.deepEqual(await h.events(), before);
    const stored = await h.repo.findById({ workspaceId: WS, id: img.id });
    assert.equal(stored?.version, 1, "the failed write rolled back with its event");
    assert.equal(stored?.description ?? null, null);
  });

  test(`[${each.name}] every committed description change, trash, restore and purge enqueues one event; a Library document none`, async () => {
    const h = each.make();
    const v1 = image("img-2");
    await h.repo.save(v1);
    const v2 = next(v1, { description: "a lighthouse at dusk" });
    await h.repo.save(v2);
    const v3 = next(v2, { status: "trashed" });
    assert.deepEqual(await h.repo.saveIfVersion({ record: v3, ifVersion: 2 }), { applied: true });
    const v4 = next(v3, { status: "active" });
    assert.deepEqual(await h.repo.saveIfVersion({ record: v4, ifVersion: 3 }), { applied: true });
    // Redelivery of the same committed write's report is still one event (deterministic id).
    await h.real.changed({ workspaceId: WS, mediaId: v4.id, kind: "media", marker: `v4:${v4.updatedAt}` });
    await h.repo.remove({ workspaceId: WS, id: v4.id });
    await h.repo.remove({ workspaceId: WS, id: v4.id });
    const events = await h.events();
    assert.equal(events.length, 5);
    assert.ok(events.every((event) => event.name === MEDIA_SEARCH_CHANGED_EVENT));
    assert.equal(events.filter((event) => event.id.includes(":removed:")).length, 1);

    // Purge resolves to a tombstone on delivery.
    const source = createMediaSearchSource({
      loadMedia: (input) => h.repo.findById(input), scanMedia: async () => ({ records: [] }), publicAccess: isPublicSearchImage,
      publicPath: () => "/m/x", now: () => Date.parse(T0),
    });
    assert.equal((await source.load({ siteId: "s", workspaceId: WS, documentId: v4.id, occurredAtMs: Date.parse(T0) })).document, null);

    // A Library document's writes and purge never emit.
    const doc = image("lib", { kind: "document" });
    await h.repo.insertIfAbsent(doc);
    await h.repo.saveIfVersion({ record: next(doc, { description: "library text" }), ifVersion: 1 });
    await h.repo.remove({ workspaceId: WS, id: doc.id });
    assert.equal((await h.events()).length, 5);
  });

  test(`[${each.name}] trash and restore through the Trash marker flip enqueue in the same transaction`, async () => {
    const h = each.make();
    await h.kernel.run((db) => db.deleteFrom("outbox_events").execute());
    const img = image("img-3");
    await h.repo.insertIfAbsent(img);
    const adapter = createMediaTrashAdapter({ isReferencedError: ({ error }) => error instanceof MediaStillReferencedError,  db: h.kernel, purgeAsset: async () => {}, changes: h.changes });
    const baseline = (await h.events()).length;
    h.control.failAfterEnqueue = true;
    await assert.rejects(adapter.hide({ workspaceId: WS, entityId: img.id, at: "2026-11-02T00:00:00.000Z", expectedVersion: 1 }), /disk is full/);
    assert.equal((await h.repo.findById({ workspaceId: WS, id: img.id }))?.status, "active", "the failed trash rolled back with its event");
    assert.equal((await h.events()).length, baseline);
    assert.equal((await adapter.hide({ workspaceId: WS, entityId: img.id, at: "2026-11-02T00:00:01.000Z", expectedVersion: 1 })).ok, true);
    assert.equal((await adapter.unhide({ workspaceId: WS, entityId: img.id, at: "2026-11-02T00:00:02.000Z", expectedVersion: 2 })).ok, true);
    assert.equal((await h.events()).length, baseline + 2);
  });
}
