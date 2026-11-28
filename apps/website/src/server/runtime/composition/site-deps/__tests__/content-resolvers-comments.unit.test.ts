import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";

/**
 * @file `composeContentResolversComments`'s late-bound closures: the widget resolver deps it hands
 * `wireCoreResolvers` (gallery media, menu page-target hrefs, form collection providers, the embed
 * consent switch) and the comments module's post fallback and Trash-index forget. Each reads the
 * getter for a dependency composed later only when it is called, and delegates to that value.
 * `wireCoreResolvers`, `createCommentsModule` and `createCommentsCapability` are recorders, so the
 * test can call what was handed; the downstream adapters the closures build (gallery media
 * resolution, the menu page-target resolver, the comment target lookup) are real.
 */

const resolvers = await import("@jini-ai/cms/widgets/resolvers");
const comments = await import("@jini-ai/cms/comments");
const selection = await import("@jini-ai/cms/comments/site/provider-selection");
type CoreDeps = Parameters<typeof resolvers.wireCoreResolvers>[0];
type CommentsDeps = Parameters<typeof comments.createCommentsModule>[0];
const handed: { core?: CoreDeps; comments?: CommentsDeps } = {};
mock.module("@jini-ai/cms/widgets/resolvers", { namedExports: { ...resolvers, wireCoreResolvers: (deps: CoreDeps) => { handed.core = deps; } } });
mock.module("@jini-ai/cms/comments", { namedExports: { ...comments, createCommentsModule: (deps: CommentsDeps) => { handed.comments = deps; return { module: "comments" }; } } });
mock.module("@jini-ai/cms/comments/site/provider-selection", { namedExports: { ...selection, createCommentsCapability: () => ({ capability: "comments" }) } });
const { composeContentResolversComments } = await import("../content-resolvers-comments.js");

type Required = Parameters<typeof composeContentResolversComments>[0];

/** A counted getter, so a test can tell a lazy read from an eager one. */
function counted<T>(value: () => T) {
  const getter = Object.assign(() => { getter.reads += 1; return value(); }, { reads: 0 });
  return getter;
}

const clip = { id: "m-1", slug: "hero-clip", status: "active", source: { sha256: "sha-a" }, alt: "Clip", width: 640, height: 360, cssClass: null, htmlAttributes: {} };

function compose(routeDeps: Record<string, unknown> = {}) {
  const calls = { mediaBySlug: [] as unknown[], contentTypes: [] as unknown[], posts: [] as unknown[], entries: [] as unknown[], forgets: [] as unknown[] };
  const posts = new Map<string, { status: string }>([["p-legacy", { status: "published" }]]);
  const registry = { registry: "forms" };
  const getters = {
    mediaRepo: counted(() => ({ findBySlug: async (query: unknown) => { calls.mediaBySlug.push(query); return clip; } })),
    mediaContentTypeStore: counted(() => ({ getMany: async (query: unknown) => { calls.contentTypes.push(query); return new Map([["sha-a", "video/mp4"]]); } })),
    postRepo: counted(() => ({ findById: async (query: { id: string }) => { calls.posts.push(query); return posts.get(query.id) ?? null; } })),
    formCollectionProviders: counted(() => () => registry),
    routeDeps: counted(() => routeDeps),
  };
  const result = composeContentResolversComments({
    kernel: contentKernel({ store: openContentDb(":memory:") }),
    siteTimeZone: undefined,
    entryRepo: { findById: async (query: unknown) => { calls.entries.push(query); return null; } },
    transformDefinitionRepo: {},
    menuRepo: {}, navLocationBindingRepo: {},
    formDefinitionRepo: { findById: async () => null, findBySlug: async () => null },
    outbox: {}, clock: { nowMs: () => 7, nowIso: () => "2026-01-01T00:00:00.000Z" }, idGen: { newId: () => "id-1" },
    settingsRepo: {}, workspaceId: "site-7", trash: {},
    trashRepo: { deleteByEntity: async (query: unknown) => { calls.forgets.push(query); return 1; } },
    trashTransaction: async () => undefined,
    commentsReady: Promise.resolve(), commentsSettingsReady: Promise.resolve(),
    identity: { authorize: async () => ({ allowed: true }) }, settingsPrincipals: {},
    ...getters,
  } as unknown as Required);
  assert.ok(handed.core && handed.comments, "resolvers and comments module were composed");
  return { result, core: handed.core, commentsDeps: handed.comments, getters, calls, registry };
}

test("no later-built dependency getter is read while composing", () => {
  const { getters } = compose();
  assert.deepEqual(Object.entries(getters).map(([name, getter]) => [name, getter.reads]),
    [["mediaRepo", 0], ["mediaContentTypeStore", 0], ["postRepo", 0], ["formCollectionProviders", 0], ["routeDeps", 0]]);
});

test("gallery media resolves through the media repo and content-type store read at render time", async () => {
  const { core, getters, calls } = compose();
  assert.ok(core.galleryMedia, "gallery media is wired");
  const resolved = await core.galleryMedia({ refs: [{ type: "media", id: null, slug: "hero-clip", name: null, variant: null, header: false }], context: { workspaceId: "site-7", preview: false } });
  assert.deepEqual(calls.mediaBySlug, [{ workspaceId: "site-7", slug: "hero-clip" }]);
  assert.deepEqual(calls.contentTypes, [{ workspaceId: "site-7", sha256s: ["sha-a"] }]);
  assert.deepEqual(resolved.get("hero-clip"), { componentId: "media-image", props: {
    assetId: "m-1", slug: "hero-clip", sha256: "sha-a", contentType: "video/mp4", alt: "Clip", width: 640, height: 360, cssClass: null, htmlAttributes: {},
  } });
  assert.equal(getters.mediaRepo.reads, 1);
  assert.equal(getters.mediaContentTypeStore.reads, 1);
});

test("a menu page target resolves through the post repo read at render time", async () => {
  const { core, getters, calls } = compose();
  assert.ok(core.resolveMenuTargetHref, "menu target hrefs are wired");
  const target = { kind: "entryRef", entryId: "p-gone", lastKnownHref: "/about" } as const;
  const href = await core.resolveMenuTargetHref({ target, context: { workspaceId: "site-7" } } as Parameters<typeof core.resolveMenuTargetHref>[0]);
  assert.deepEqual(calls.posts, [{ workspaceId: "site-7", id: "p-gone" }]);
  assert.deepEqual(href, { path: "/about", available: true });
  assert.equal(getters.postRepo.reads, 1);
});

test("form collection providers are the registry the late getter builds, read per call", () => {
  const { core, getters, registry } = compose();
  assert.ok(core.formCollectionProviders, "form collection providers are wired");
  assert.equal(core.formCollectionProviders(), registry);
  assert.equal(core.formCollectionProviders(), registry);
  assert.equal(getters.formCollectionProviders.reads, 2);
});

test("the form embed consent switch is on only when the route deps' cookie consent says exactly true", () => {
  const routeDeps: Record<string, unknown> = {};
  const { core, getters } = compose(routeDeps);
  assert.ok(core.formEmbedConsentOff, "the consent switch is wired");
  assert.equal(core.formEmbedConsentOff(), false, "no cookie consent at all");
  routeDeps.cookieConsent = {};
  assert.equal(core.formEmbedConsentOff(), false, "cookie consent without the embed switch");
  routeDeps.cookieConsent = { embedConsentOff: () => false };
  assert.equal(core.formEmbedConsentOff(), false);
  routeDeps.cookieConsent = { embedConsentOff: () => true };
  assert.equal(core.formEmbedConsentOff(), true);
  assert.equal(getters.routeDeps.reads, 4, "the route deps are read on every call, never cached");
});

test("a comment target missing from entries falls back to the legacy post read at submit time", async () => {
  const { commentsDeps, getters, calls } = compose();
  assert.deepEqual(await commentsDeps.entryLookup({ workspaceId: "site-7", entryId: "p-legacy" }), { status: "published", publishedAt: null });
  assert.deepEqual(await commentsDeps.entryLookup({ workspaceId: "site-7", entryId: "p-none" }), null);
  assert.deepEqual(calls.entries, [{ workspaceId: "site-7", id: "p-legacy" }, { workspaceId: "site-7", id: "p-none" }]);
  assert.deepEqual(calls.posts, [{ workspaceId: "site-7", id: "p-legacy" }, { workspaceId: "site-7", id: "p-none" }]);
  assert.equal(getters.postRepo.reads, 2);
});

test("forgetting a restored comment deletes its Trash index row for the asking workspace", async () => {
  const { commentsDeps, calls } = compose();
  assert.ok(commentsDeps.forgetRemoved, "forgetRemoved is wired");
  assert.equal(await commentsDeps.forgetRemoved({ workspaceId: "site-9", id: "c-4" }), 1);
  assert.deepEqual(calls.forgets, [{ workspaceId: "site-9", entityType: "comment", entityId: "c-4" }]);
});

test("the composed comments module and capability are the ones the factories built", () => {
  const { result } = compose();
  assert.deepEqual(result.commentsModule, { module: "comments" });
  assert.deepEqual(result.commentsCapability, { capability: "comments" });
});
