import assert from "node:assert/strict";
import { test } from "node:test";

import { createSearchIndexer, createSearchProviderRegistry, encodeSearchKey, type SearchDocumentSource, type SearchProviderContext, type SearchTarget } from "@jini-ai/search";
import { createInMemorySearchProvider, createInMemorySearchState } from "@jini-ai/search/testkit";
import type { DomainEvent } from "@jini-ai/cms/core";
import { SqlPagesHtmlDocumentStore } from "../../pages/html-document-store.js";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { PostRecord } from "../../post/post.js";
import { postRepoFor } from "../../post/repo.js";
import { CMS_SEARCH_EVENTS, cmsSearchRevision, cmsSearchVisibility, createCmsSearchDocumentSources } from "../cms-document-source.js";
import { createCmsSearchAccessPort, memberSearchAudiences } from "../access.js";

/**
 * @file The CMS search source and access port on SQLite and PGlite, over real `posts` rows saved by
 * the real post repo: only what the public site shows is indexable or visible, revisions order
 * every change (scheduled go-live included), and member gates become audiences.
 */

const WS = "ws-search";
const SITE = "site-1";
const T0 = Date.parse("2026-10-21T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

function post(id: string, overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id, workspaceId: WS, title: `Title ${id}`, slug: `slug-${id}`, bodyJson: doc(`Body of ${id}`), bodyFormat: "doc", bodyHtml: null,
    status: "published", kind: "post", updatedAt: iso(T0), version: 3, ...overrides,
  };
}

function setup(kernel: ContentKernel) {
  let nowMs = T0 + 60_000;
  const clock = { now: () => nowMs, set: (ms: number) => { nowMs = ms; } };
  let runs = 0;
  const counted: ContentKernel = { ...kernel, run: (fn) => { runs += 1; return kernel.run(fn); } };
  const [posts, pages] = createCmsSearchDocumentSources({ kernel, now: clock.now }) as [SearchDocumentSource, SearchDocumentSource];
  return {
    kernel, repo: postRepoFor(kernel), posts, pages, clock,
    access: createCmsSearchAccessPort({ kernel: counted, now: clock.now }),
    runs: () => runs,
    load: (source: SearchDocumentSource, documentId: string, occurredAtMs = T0, workspaceId = WS) => source.load({ siteId: SITE, workspaceId, documentId, occurredAtMs }),
  };
}

const key = (documentId: string, collection = "post", overrides: { siteId?: string; workspaceId?: string } = {}) =>
  ({ siteId: SITE, workspaceId: WS, collection, documentId, ...overrides });

test("documentIdOf claims only post.ts's own events for its own kind", () => {
  const [posts, pages] = createCmsSearchDocumentSources({ kernel: {} as ContentKernel, now: () => 0 }) as [SearchDocumentSource, SearchDocumentSource];
  const event = (name: string, payload?: unknown) => ({ name, workspaceId: WS, occurredAt: iso(T0), aggregateId: "p1", payload });
  for (const name of CMS_SEARCH_EVENTS) assert.equal(posts.documentIdOf({ event: event(name, { entryId: "p1", contentType: "post" }) }), "p1");
  assert.equal(pages.documentIdOf({ event: event("entry.updated", { entryId: "g1", contentType: "page" }) }), "g1");
  assert.equal(posts.documentIdOf({ event: event("entry.updated", { entryId: "g1", contentType: "page" }) }), null, "a page is not a post");
  assert.equal(posts.documentIdOf({ event: event("entry.published", { workspaceId: WS, entryId: "e1" }) }), null, "generic entries carry no contentType");
  assert.equal(posts.documentIdOf({ event: event("entry.created", { entryId: "p1", contentType: "post" }) }), null, "not a search event");
  assert.equal(posts.documentIdOf({ event: event("entry.updated") }), null, "no payload");
  assert.equal(posts.documentIdOf({ event: event("entry.updated", { entryId: 7, contentType: "post" }) }), null, "non-string id");
});

test("default sources are post and page with the transition events; collections can be narrowed", () => {
  const sources = createCmsSearchDocumentSources({ kernel: {} as ContentKernel, now: () => 0 });
  assert.deepEqual(sources.map(source => [source.collection, source.events]), [["post", CMS_SEARCH_EVENTS], ["page", CMS_SEARCH_EVENTS]]);
  assert.deepEqual(createCmsSearchDocumentSources({ kernel: {} as ContentKernel, now: () => 0 }, { collections: ["page"] }).map(s => s.collection), ["page"]);
});

test("member gates become audiences; anything unreadable is restricted to nobody", () => {
  assert.deepEqual(cmsSearchVisibility({ memberAccessJson: null }), { kind: "public" });
  assert.deepEqual(cmsSearchVisibility({ memberAccessJson: '{"visibility":"public"}' }), { kind: "public" });
  assert.deepEqual(cmsSearchVisibility({ memberAccessJson: '{"visibility":"members"}' }), { kind: "restricted", audiences: ["members"] });
  assert.deepEqual(cmsSearchVisibility({ memberAccessJson: '{"visibility":"paid"}' }), { kind: "restricted", audiences: ["paid"] });
  assert.deepEqual(cmsSearchVisibility({ memberAccessJson: '{"visibility":"tiers","tierIds":["gold","silver"]}' }), { kind: "restricted", audiences: ["tier:gold", "tier:silver"] });
  assert.deepEqual(cmsSearchVisibility({ memberAccessJson: '{"visibility":"tiers"}' }), { kind: "restricted", audiences: [] });
  assert.deepEqual(cmsSearchVisibility({ memberAccessJson: "{not json" }), { kind: "restricted", audiences: [] });
  assert.deepEqual(cmsSearchVisibility({ memberAccessJson: '{"visibility":"everyone"}' }), { kind: "restricted", audiences: [] });
});

test("viewer audiences use the same tokens, and an anonymous viewer has none", () => {
  assert.deepEqual(memberSearchAudiences({ context: { isAuthenticated: false, activeTierIds: ["gold"], isPaid: true } }), []);
  assert.deepEqual(memberSearchAudiences({ context: { isAuthenticated: true, activeTierIds: ["gold"], isPaid: false } }), ["members", "tier:gold"]);
  assert.deepEqual(memberSearchAudiences({ context: { isAuthenticated: true, activeTierIds: [], isPaid: true } }), ["members", "paid"]);
});

test("revisions: live rows by max(updatedAt, publishAt), others by max(updatedAt, occurredAt), missing outranks the millisecond", () => {
  const row = { updated_at: iso(T0), publish_at: null, version: 1_004 };
  assert.equal(cmsSearchRevision({ row, live: true, occurredAtMs: T0 + 5 }), T0 * 1000 + 4, "a live revision ignores the event time");
  assert.equal(cmsSearchRevision({ row: { ...row, publish_at: iso(T0 + 9) }, live: true, occurredAtMs: 0 }), (T0 + 9) * 1000 + 4);
  assert.equal(cmsSearchRevision({ row, live: false, occurredAtMs: T0 + 5 }), (T0 + 5) * 1000 + 4);
  assert.equal(cmsSearchRevision({ row, live: false, occurredAtMs: T0 - 5 }), T0 * 1000 + 4);
  assert.equal(cmsSearchRevision({ row: null, live: false, occurredAtMs: T0 }), T0 * 1000 + 999);
  assert.ok(Number.isSafeInteger(cmsSearchRevision({ row: null, live: false, occurredAtMs: Date.parse("2200-01-01T00:00:00.000Z") })));
});

describeEachDialect("CMS search source + access", { tables: ["posts", "post_revisions"], make: setup }, (make) => {
  test("load: a live post is a plain-text public document at its public URL", async () => {
    const s = make();
    await s.repo.save(post("p1"));
    const record = await s.load(s.posts, "p1");
    assert.deepEqual(record, {
      key: key("p1"), revision: T0 * 1000 + 3,
      document: { key: key("p1"), revision: T0 * 1000 + 3, url: "/slug-p1", title: "Title p1", body: "Body of p1", visibility: { kind: "public" } },
    });
  });

  test("load: a bespoke HTML home page is stripped to text and routed at /", async () => {
    const s = make();
    await s.repo.save(post("g1", { kind: "page", slug: "/", bodyFormat: "html", bodyHtml: "<h2>Hi</h2><p>Tom &amp; Jerry</p>" }));
    const record = await s.load(s.pages, "g1");
    assert.equal(record.document?.url, "/");
    assert.equal(record.document?.body, "Hi Tom & Jerry");
    assert.deepEqual(record.document?.key, key("g1", "page"));
  });

  test("an HTML page edit after the backfill finished reaches the index through the entry.updated it now emits", async () => {
    const s = make();
    await s.repo.save(post("g1", { kind: "page", slug: "about", bodyFormat: "html", bodyHtml: "<p>Old zephyr text</p>" }));
    await s.repo.save(post("g2", { kind: "page", slug: "draft", status: "draft", bodyFormat: "html", bodyHtml: "<p>Draft text</p>" }));
    const registry = createSearchProviderRegistry({});
    registry.register({ definition: { id: "builtin", provider: createInMemorySearchProvider({}, { id: "builtin" }) } });
    const state = createInMemorySearchState({}, { active: [{ siteId: SITE, providerId: "builtin", generation: 1 }] });
    const contextFor = async ({ target, workspaceId }: { target: SearchTarget; workspaceId: string }): Promise<SearchProviderContext> => ({
      workspaceId, siteId: target.siteId, mode: "test", indexName: "cms_html_edit", credentials: {}, timeoutMs: 1000, now: s.clock.now,
      httpClient: { send: async () => { throw new Error("no network"); } },
    });
    const indexer = createSearchIndexer({
      sources: [s.posts, s.pages], registry, targets: state.targets, state: state.indexState, contextFor, now: s.clock.now,
      resolveSiteId: async ({ workspaceId }) => (workspaceId === WS ? SITE : null),
    });
    const provider = registry.get({ id: "builtin" })!.provider;
    const ctx = await contextFor({ target: { siteId: SITE, providerId: "builtin", generation: 1 }, workspaceId: WS });
    const titlesFor = async (text: string) => {
      const result = await provider.query(ctx, { query: { text, audiences: [] } });
      return result.status === "ok" ? result.value.hits.map(hit => hit.key.documentId) : [`error:${result.status}`];
    };
    assert.equal((await indexer.backfill({ siteId: SITE, workspaceId: WS })).done, true);
    assert.deepEqual(await titlesFor("zephyr"), ["g1"]);

    const events: DomainEvent[] = [];
    const outbox = { enqueue: async (event: DomainEvent) => { events.push(event); } };
    const storeClock = { nowMs: () => T0 + 120_000 };
    const page = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "g1" }, { kernel: s.kernel, clock: storeClock, outbox });
    await page.read();
    await page.write("<p>New quokka text</p>");
    await page.write("<p>New quokka text</p>");
    const draft = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "g2" }, { kernel: s.kernel, clock: storeClock, outbox });
    await draft.read();
    await draft.write("<p>Changed draft</p>");
    // b46eb6e29 adds save telemetry for drafts too; unchanged HTML still emits nothing.
    assert.deepEqual(events.map(event => [event.name, event.aggregateId, event.id]), [
      ["content.saved", "g1", "g1-content.saved-4"],
      ["entry.updated", "g1", "g1-entry.updated-4"],
      ["content.saved", "g2", "g2-content.saved-4"],
    ], "one update for the published change, save telemetry for both changes, none for the unchanged save");
    assert.deepEqual(events[1]!.payload, { entryId: "g1", contentType: "page" });

    // The backfill's watermark is complete, so only the event can carry the edit.
    assert.equal((await indexer.backfill({ siteId: SITE, workspaceId: WS })).written, 0);
    s.clock.set(T0 + 180_000);
    for (const event of events) await indexer.handleEvent({ event });
    assert.deepEqual(await titlesFor("quokka"), ["g1"]);
    assert.deepEqual(await titlesFor("zephyr"), [], "the removed text is no longer served");
    assert.deepEqual(await titlesFor("draft"), [], "draft save telemetry never exposes a draft in search");
  });

  test("an HTML page converted from doc format emits entry.updated only when it is published", async () => {
    const s = make();
    await s.repo.save(post("g3", { kind: "page", slug: "converted" }));
    await s.repo.save(post("g4", { kind: "page", slug: "draft-converted", status: "draft" }));
    const events: DomainEvent[] = [];
    const outbox = { enqueue: async (event: DomainEvent) => { events.push(event); } };
    const storeClock = { nowMs: () => T0 + 120_000 };
    for (const postId of ["g3", "g4"]) await new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId }, { kernel: s.kernel, clock: storeClock, outbox }).ensureHtmlFormat("<p>Seeded</p>");
    await new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "g3" }, { kernel: s.kernel, clock: storeClock }).ensureHtmlFormat("<p>Seeded</p>");
    assert.deepEqual(events.map(event => [event.name, event.aggregateId, event.id]), [
      ["content.saved", "g3", "g3-content.saved-4"],
      ["entry.updated", "g3", "g3-entry.updated-4"],
      ["content.saved", "g4", "g4-content.saved-4"],
    ]);
  });

  test("load: draft, trashed, other kind, other workspace and missing rows load as null with an outranking revision", async () => {
    const s = make();
    await s.repo.save(post("d1", { status: "draft" }));
    await s.repo.save(post("t1", { deletedAt: iso(T0) }));
    await s.repo.save(post("g1", { kind: "page" }));
    for (const id of ["d1", "t1"]) assert.deepEqual(await s.load(s.posts, id, T0 + 7), { key: key(id), revision: (T0 + 7) * 1000 + 3, document: null });
    assert.deepEqual(await s.load(s.posts, "g1", T0 + 7), { key: key("g1"), revision: (T0 + 7) * 1000 + 999, document: null }, "a page is not in the post collection");
    assert.deepEqual(await s.load(s.posts, "p1", T0 + 7, "ws-other"), { key: key("p1", "post", { workspaceId: "ws-other" }), revision: (T0 + 7) * 1000 + 999, document: null });
    assert.deepEqual(await s.load(s.posts, "nope", T0 + 7), { key: key("nope"), revision: (T0 + 7) * 1000 + 999, document: null });
  });

  test("load: a scheduled post is null until go-live, then live with a revision above its tombstone", async () => {
    const s = make();
    const goLive = T0 + 3_600_000;
    await s.repo.save(post("s1", { publishAt: iso(goLive) }));
    const embargoed = await s.load(s.posts, "s1", T0);
    assert.equal(embargoed.document, null);
    s.clock.set(goLive);
    const live = await s.load(s.posts, "s1", goLive);
    assert.equal(live.document?.url, "/slug-s1");
    assert.equal(live.revision, goLive * 1000 + 3);
    assert.ok(live.revision > embargoed.revision);
  });

  test("load: a members-gated post is restricted to its audiences", async () => {
    const s = make();
    await s.repo.save(post("m1", { memberAccessJson: '{"visibility":"tiers","tierIds":["gold"]}' }));
    assert.deepEqual((await s.load(s.posts, "m1")).document?.visibility, { kind: "restricted", audiences: ["tier:gold"] });
  });

  test("scan: live rows of one kind and workspace only, id order, keyset pages until a short page", async () => {
    const s = make();
    for (const id of ["a", "c", "e", "f"]) await s.repo.save(post(id));
    await s.repo.save(post("b", { status: "draft" }));
    await s.repo.save(post("d", { deletedAt: iso(T0) }));
    await s.repo.save(post("bb", { publishAt: iso(T0 + 3_600_000) }));
    await s.repo.save(post("cc", { kind: "page" }));
    await s.repo.save(post("ee", { workspaceId: "ws-other", slug: "other-ee" }));
    const scan = (cursor?: string, limit = 2) => s.posts.scan({ siteId: SITE, workspaceId: WS, limit }, cursor === undefined ? {} : { cursor });
    const first = await scan();
    assert.deepEqual(first.records.map(r => r.key.documentId), ["a", "c"]);
    assert.equal(first.nextCursor, "c");
    assert.equal(first.records[0]?.document?.title, "Title a");
    const second = await scan("c");
    assert.deepEqual(second.records.map(r => r.key.documentId), ["e", "f"]);
    assert.equal(second.nextCursor, "f", "a full page may have more");
    assert.deepEqual(await scan("f"), { records: [] }, "an empty page ends the scan");
    assert.deepEqual(await scan(undefined, 0), { records: [] });
    const pages = await s.pages.scan({ siteId: SITE, workspaceId: WS, limit: 5 });
    assert.deepEqual(pages, { records: [await s.load(s.pages, "cc")] }, "a short page ends the scan");
  });

  test("access: only live, same-site, same-workspace, known-collection keys the viewer may see, one query per collection", async () => {
    const s = make();
    await s.repo.save(post("p1"));
    await s.repo.save(post("d1", { status: "draft" }));
    await s.repo.save(post("t1", { deletedAt: iso(T0) }));
    await s.repo.save(post("s1", { publishAt: iso(T0 + 3_600_000) }));
    await s.repo.save(post("m1", { memberAccessJson: '{"visibility":"members"}' }));
    await s.repo.save(post("g1", { kind: "page" }));
    const keys = [key("p1"), key("d1"), key("t1"), key("s1"), key("m1"), key("g1", "page"), key("g1"), key("missing"),
      key("p1", "post", { siteId: "site-2" }), key("p1", "post", { workspaceId: "ws-other" }), key("p1", "product")];
    const anonymous = await s.access.visibleKeys({ siteId: SITE, keys, audiences: [] });
    assert.deepEqual([...anonymous].sort(), [encodeSearchKey({ key: key("g1", "page") }), encodeSearchKey({ key: key("p1") })].sort());
    assert.equal(s.runs(), 2, "one query per collection present");
    const member = await s.access.visibleKeys({ siteId: SITE, keys, audiences: ["members"] });
    assert.ok(member.has(encodeSearchKey({ key: key("m1") })));
    assert.equal(member.size, 3);
    assert.deepEqual(await s.access.visibleKeys({ siteId: SITE, keys: [], audiences: [] }), new Set());
    assert.equal(s.runs(), 4, "no keys, no query");
  });

  test("access: a collection left out of the port is never visible", async () => {
    const s = make();
    await s.repo.save(post("g1", { kind: "page" }));
    const postsOnly = createCmsSearchAccessPort({ kernel: s.kernel, now: s.clock.now }, { collections: ["post"] });
    assert.deepEqual(await postsOnly.visibleKeys({ siteId: SITE, keys: [key("g1", "page")], audiences: [] }), new Set());
  });
});
