import assert from "node:assert/strict";
import { test } from "node:test";

import { createSearchIndexer, createSearchProviderRegistry, type SearchProviderContext, type SearchTarget } from "@jini-ai/search";
import { createInMemorySearchProvider, createInMemorySearchState } from "@jini-ai/search/testkit";
import type { DomainEvent } from "@jini-ai/core/contracts/events";
import type { MediaRecord } from "@jini-ai/cms/media";

import {
  createMediaSearchAccessPort, createMediaSearchSource, isPublicSearchImage, MEDIA_SEARCH_COLLECTION, withMediaSearchEvents,
  type MediaSearchEventRepo,
} from "../media-search-source.js";

/**
 * @file Public image descriptions in site search: only current, eligible public images are indexed
 * (by their stored description, never a generation prompt), committed media writes enqueue a
 * change event, and each delivery re-reads current state, so redelivery and out-of-order events
 * converge.
 */

const WS = "ws-media-search";
const SITE = "site-1";
const T0 = Date.parse("2026-11-01T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function image(id: string, overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    id, workspaceId: WS, kind: "media", title: `Title ${id}`, slug: `slug-${id}`, alt: "", caption: null, credit: null,
    source: { sha256: `${id}`.padEnd(64, "a"), contentType: "image/jpeg", provenance: { kind: "generated", prompt: "secret prompt xylophone" } as never },
    status: "active", createdAt: iso(T0), updatedAt: iso(T0), version: 1, width: 10, height: 10, cssClass: null, htmlAttributes: null,
    captions: null, ...overrides,
  } as MediaRecord;
}

/** A versioned in-memory media table with the CAS semantics of the real repo. */
function memoryRepo(): MediaSearchEventRepo & { rows: Map<string, MediaRecord>; failNext: boolean } {
  const rows = new Map<string, MediaRecord>();
  return {
    rows, failNext: false,
    async findById({ id }) { return rows.get(id) ?? null; },
    async list() { return [...rows.values()]; },
    async save(record) { rows.set(record.id, record); },
    async saveIfVersion({ record, ifVersion }) {
      if (this.failNext) { this.failNext = false; throw new Error("disk full"); }
      if (rows.get(record.id)?.version !== ifVersion) return { applied: false };
      rows.set(record.id, record);
      return { applied: true };
    },
    async remove({ id }) { rows.delete(id); },
  };
}

function setup() {
  let nowMs = T0 + 60_000;
  const clock = { now: () => nowMs, advance: (ms: number) => { nowMs += ms; } };
  const raw = memoryRepo();
  const events: DomainEvent[] = [];
  const outbox = { enqueue: async (event: DomainEvent) => { events.push(event); } };
  const repo = withMediaSearchEvents({ repo: raw, outbox, nowIso: () => iso(clock.now()) });
  const ports = {
    loadMedia: ({ workspaceId, id }: { workspaceId: string; id: string }) => raw.findById({ workspaceId, id }),
    scanMedia: async ({ workspaceId }: { workspaceId: string; limit: number }) => ({ records: (await raw.list({ workspaceId })) }),
    publicAccess: isPublicSearchImage,
    publicPath: ({ record }: { record: MediaRecord }) => `/m/${record.slug}/public.v1/image.webp`,
    now: clock.now,
  };
  const source = createMediaSearchSource(ports);
  const access = createMediaSearchAccessPort(ports);
  const registry = createSearchProviderRegistry({});
  registry.register({ definition: { id: "builtin", provider: createInMemorySearchProvider({}, { id: "builtin" }) } });
  const state = createInMemorySearchState({}, { active: [{ siteId: SITE, providerId: "builtin", generation: 1 }] });
  const contextFor = async ({ target, workspaceId }: { target: SearchTarget; workspaceId: string }): Promise<SearchProviderContext> => ({
    workspaceId, siteId: target.siteId, mode: "test", indexName: "media_search", credentials: {}, timeoutMs: 1000, now: clock.now,
    httpClient: { send: async () => { throw new Error("no network"); } },
  });
  const indexer = createSearchIndexer({
    sources: [source], registry, targets: state.targets, state: state.indexState, contextFor, now: clock.now,
    resolveSiteId: async ({ workspaceId }) => (workspaceId === WS ? SITE : null),
  });
  const provider = registry.get({ id: "builtin" })!.provider;
  /** What the public site would show: provider hits, then the fail-closed access check. */
  const search = async (text: string) => {
    const ctx = await contextFor({ target: { siteId: SITE, providerId: "builtin", generation: 1 }, workspaceId: WS });
    const result = await provider.query(ctx, { query: { text, audiences: [] } });
    if (result.status !== "ok") return [`error:${result.status}`];
    const keys = result.value.hits.map(hit => hit.key);
    const visible = await access.visibleKeys({ siteId: SITE, keys, audiences: [] });
    return keys.filter(key => visible.size > 0 && [...visible].some(v => v.includes(key.documentId))).map(key => key.documentId);
  };
  /** Raw provider hits (the index itself, without the query-time access filter). */
  const indexed = async (text: string) => {
    const ctx = await contextFor({ target: { siteId: SITE, providerId: "builtin", generation: 1 }, workspaceId: WS });
    const result = await provider.query(ctx, { query: { text, audiences: [] } });
    return result.status === "ok" ? result.value.hits.map(hit => hit.key.documentId) : [`error:${result.status}`];
  };
  const deliver = async (list: readonly DomainEvent[] = events.splice(0)) => {
    clock.advance(1);
    for (const event of list) await indexer.handleEvent({ event });
  };
  // The in-memory provider creates its index on the first (empty) backfill, as boot does.
  const ready = async () => { await indexer.backfill({ siteId: SITE, workspaceId: WS }); };
  return { raw, repo, events, source, indexer, search, indexed, deliver, clock, ready };
}

/** The admin's description change as the media service performs it: one CAS write. */
async function edit(s: ReturnType<typeof setup>, id: string, patch: Partial<MediaRecord>) {
  const current = s.raw.rows.get(id)!;
  s.clock.advance(1000);
  return s.repo.saveIfVersion({ record: { ...current, ...patch, version: current.version + 1, updatedAt: iso(s.clock.now()) }, ifVersion: current.version });
}

test("site search finds the public image by description and removes it on trash", async () => {
  const s = setup();
  await s.ready();
  await s.raw.save(image("img-1"));
  assert.deepEqual((await edit(s, "img-1", { description: "A lighthouse at dusk over quiet water" })).applied, true);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0]!.aggregateId, "img-1");
  await s.deliver();
  assert.deepEqual(await s.search("lighthouse"), ["img-1"]);
  // The generation prompt is never indexed text.
  assert.deepEqual(await s.indexed("xylophone"), []);

  await edit(s, "img-1", { status: "trashed" });
  await s.deliver();
  assert.deepEqual(await s.indexed("lighthouse"), []);

  // Restore brings it back; purge removes it for good.
  await edit(s, "img-1", { status: "active" });
  await s.deliver();
  assert.deepEqual(await s.search("lighthouse"), ["img-1"]);
  await s.repo.remove({ workspaceId: WS, id: "img-1" });
  await s.deliver();
  assert.deepEqual(await s.indexed("lighthouse"), []);
});

test("a private or unpublished image never enters or survives the public index", async () => {
  const s = setup();
  await s.ready();
  await s.raw.save(image("priv", { source: { sha256: "b".repeat(64), contentType: "image/png", private: true } }));
  await s.raw.save(image("doc", { kind: "document", source: { sha256: "c".repeat(64), contentType: "image/png" } }));
  await s.raw.save(image("pdf", { source: { sha256: "d".repeat(64), contentType: "application/pdf" } }));
  await s.raw.save(image("binned", { status: "trashed" }));
  for (const id of ["priv", "doc", "pdf", "binned"]) await edit(s, id, { description: `harbour crane ${id}` });
  await s.deliver();
  assert.deepEqual(await s.indexed("harbour"), []);
  assert.equal((await s.indexer.backfill({ siteId: SITE, workspaceId: WS })).done, true);
  assert.deepEqual(await s.indexed("harbour"), []);

  // An indexed public image that later turns private does not survive, even before its event lands.
  await s.raw.save(image("pub"));
  await edit(s, "pub", { description: "harbour crane public" });
  await s.deliver();
  assert.deepEqual(await s.search("harbour"), ["pub"]);
  await edit(s, "pub", { source: { sha256: "e".repeat(64), contentType: "image/jpeg", private: true } });
  assert.deepEqual(await s.search("harbour"), [], "query-time access applies the same publication rule");
  await s.deliver();
  assert.deepEqual(await s.indexed("harbour"), []);
});

test("redelivery and an older event delivered after a newer change converge on current state", async () => {
  const s = setup();
  await s.ready();
  await s.raw.save(image("img-2"));
  await edit(s, "img-2", { description: "red kite in flight" });
  const older = s.events.splice(0);
  await edit(s, "img-2", { description: "barn owl at night" });
  const newer = s.events.splice(0);
  await s.deliver(newer);
  await s.deliver(older);
  await s.deliver(newer);
  assert.deepEqual(await s.search("owl"), ["img-2"]);
  assert.deepEqual(await s.indexed("kite"), []);

  await edit(s, "img-2", { status: "trashed" });
  const trash = s.events.splice(0);
  await s.deliver(trash);
  await s.deliver(older);
  await s.deliver(trash);
  assert.deepEqual(await s.indexed("owl"), []);
});

test("a failed or rejected write enqueues nothing, and Library documents emit no event", async () => {
  const s = setup();
  await s.ready();
  await s.raw.save(image("img-3"));
  s.raw.failNext = true;
  await assert.rejects(edit(s, "img-3", { description: "never committed" }));
  const stale = await s.repo.saveIfVersion({ record: { ...image("img-3"), description: "stale" }, ifVersion: 99 });
  assert.equal(stale.applied, false);
  await s.raw.save(image("lib", { kind: "document" }));
  await edit(s, "lib", { description: "library text" });
  assert.deepEqual(s.events, []);
  assert.equal(MEDIA_SEARCH_COLLECTION, "media_image");
});
