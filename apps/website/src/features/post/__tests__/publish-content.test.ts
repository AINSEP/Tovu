/**
 * @file Task 2 of the publish-content (Publish Content) feature — direct unit tests for
 * `contributePostPublish()`/`contributePagePublish()` (`../publish-content.ts`), which
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 2 requires as
 * "data only" contributors. Not required by the team-lead dispatch's own test list (that list covers
 * only registry mechanics — see `features/publish-content/__tests__/type-registry.test.ts`), but
 * added per this repo's own coverage-self-check discipline: every changed function should be
 * directly asserted.
 *
 * Exercises only READ paths (`pack`/`inspect`/`precheck`), against `InMemoryPostRepo` — the same
 * double `post.test.ts` itself uses. `apply()` is deliberately left unimplemented for now (see
 * `../publish-content.ts`'s own header); the one test for it here just pins that it fails loudly
 * rather than silently no-oping.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo } from "../repo.memory.js";
import type { PostRecord } from "../post.js";
import { contentHash } from "#src/features/publish-content/content-hash";
import { contributePagePublish, contributePostPublish } from "../publish-content.js";

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

function makeClock() {
  return { nowIso: () => "2026-09-18T00:00:00.000Z" };
}

function makeIdGen() {
  let n = 0;
  return { newId: () => `generated-id-${++n}` };
}

function makePost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE_ID,
    title: "Hello",
    slug: "hello",
    bodyJson: { type: "doc", content: [] },
    status: "draft",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function makeDeps(rows: PostRecord[]) {
  return {
    workspaceId: WORKSPACE_ID,
    postRepo: new InMemoryPostRepo(rows),
    clock: makeClock(),
    idGen: makeIdGen(),
  };
}

// ---------------------------------------------------------------------------
// contributePostPublish / contributePagePublish — data-only contract
// ---------------------------------------------------------------------------

test("contributePostPublish returns data only — entityType/dependsOn are plain values, build is deferred", () => {
  const contributor = contributePostPublish();
  assert.equal(contributor.entityType, "post");
  assert.deepEqual(contributor.dependsOn, ["media", "term"]);
  assert.equal(typeof contributor.build, "function");
});

test("contributePagePublish returns data only, distinguished from post only by entityType", () => {
  const contributor = contributePagePublish();
  assert.equal(contributor.entityType, "page");
  assert.deepEqual(contributor.dependsOn, ["media", "term"]);
});

test("both built handlers declare the resource's own content.write permission", () => {
  const deps = makeDeps([]);
  assert.equal(contributePostPublish().build(deps).permission, "content.write");
  assert.equal(contributePagePublish().build(deps).permission, "content.write");
});

// ---------------------------------------------------------------------------
// pack() — kind-filtered, canonicalized, hashed
// ---------------------------------------------------------------------------

test("post.pack() yields only kind:'post' rows, each hashed with contentHash('post', ...)", async () => {
  const post = makePost({ id: "post-1", kind: "post", title: "A Post" });
  const page = makePost({ id: "page-1", kind: "page", slug: "a-page", title: "A Page" });
  const handler = contributePostPublish().build(makeDeps([post, page]));

  const packed = [];
  for await (const entity of handler.pack()) packed.push(entity);

  assert.equal(packed.length, 1);
  assert.equal(packed[0].id, "post-1");
  assert.equal(packed[0].entityType, "post");
  assert.equal(packed[0].contentHash, contentHash("post", { ...post }));
  assert.deepEqual(packed[0].requiredBlobs, []);
});

test("page.pack() yields only kind:'page' rows", async () => {
  const post = makePost({ id: "post-1", kind: "post" });
  const page = makePost({ id: "page-1", kind: "page", slug: "a-page" });
  const handler = contributePagePublish().build(makeDeps([post, page]));

  const packed = [];
  for await (const entity of handler.pack()) packed.push(entity);

  assert.equal(packed.length, 1);
  assert.equal(packed[0].id, "page-1");
  assert.equal(packed[0].entityType, "page");
});

test("pack()'s contentHash is stable across two rows with identical content but different id/version/updatedAt", async () => {
  const rowA = makePost({ id: "post-a", version: 1, updatedAt: "2026-01-01T00:00:00.000Z" });
  const rowB = makePost({ id: "post-b", version: 9, updatedAt: "2026-09-01T00:00:00.000Z" });
  const handler = contributePostPublish().build(makeDeps([rowA, rowB]));

  const packed = [];
  for await (const entity of handler.pack()) packed.push(entity);

  assert.equal(packed.length, 2);
  assert.equal(packed[0].contentHash, packed[1].contentHash);
});

// ---------------------------------------------------------------------------
// inspect() — destination lookup, kind-guarded
// ---------------------------------------------------------------------------

test("inspect() returns {version, hash} for an existing row of the matching kind", async () => {
  const post = makePost({ id: "post-1", version: 3 });
  const handler = contributePostPublish().build(makeDeps([post]));

  const result = await handler.inspect("post-1");
  assert.deepEqual(result, { version: 3, hash: contentHash("post", { ...post }) });
});

test("inspect() returns null for a row that does not exist", async () => {
  const handler = contributePostPublish().build(makeDeps([]));
  assert.equal(await handler.inspect("missing"), null);
});

test("inspect() returns null for a row that exists but is the WRONG kind — a page's id must not resolve through the post handler", async () => {
  const page = makePost({ id: "page-1", kind: "page", slug: "a-page" });
  const handler = contributePostPublish().build(makeDeps([page]));
  assert.equal(await handler.inspect("page-1"), null);
});

// ---------------------------------------------------------------------------
// precheck() — pure precondition check, never writes (plan §5 risk #4)
// ---------------------------------------------------------------------------

test("precheck() allows an entity whose slug is free", async () => {
  const handler = contributePostPublish().build(makeDeps([]));
  const result = await handler.precheck({
    entityType: "post",
    id: "new-post",
    contentHash: "irrelevant",
    hashVersion: 1,
    requiredBlobs: [],
    state: { slug: "free-slug" },
  });
  assert.equal(result, null);
});

test("precheck() allows an entity claiming ITS OWN current slug (updating in place is not a collision)", async () => {
  const existing = makePost({ id: "post-1", slug: "hello" });
  const handler = contributePostPublish().build(makeDeps([existing]));
  const result = await handler.precheck({
    entityType: "post",
    id: "post-1",
    contentHash: "irrelevant",
    hashVersion: 1,
    requiredBlobs: [],
    state: { slug: "hello" },
  });
  assert.equal(result, null);
});

test("precheck() blocks an entity whose slug is held by a DIFFERENT id — never auto-renames (plan §5 risk #4)", async () => {
  const existing = makePost({ id: "post-1", slug: "taken" });
  const handler = contributePostPublish().build(makeDeps([existing]));
  const result = await handler.precheck({
    entityType: "post",
    id: "post-2",
    contentHash: "irrelevant",
    hashVersion: 1,
    requiredBlobs: [],
    state: { slug: "taken" },
  });
  assert.match(result ?? "", /already held by a different post \('post-1'\)/);
});

test("precheck() blocks an entity with no usable slug rather than throwing", async () => {
  const handler = contributePostPublish().build(makeDeps([]));
  const result = await handler.precheck({
    entityType: "post",
    id: "post-1",
    contentHash: "irrelevant",
    hashVersion: 1,
    requiredBlobs: [],
    state: {},
  });
  assert.match(result ?? "", /no usable slug/);
});

// ---------------------------------------------------------------------------
// apply() — deliberately unimplemented (Task 7/8), must fail loudly, never silently no-op
// ---------------------------------------------------------------------------

test("apply() throws rather than silently no-opping or writing — Task 7/8 wires the real path", async () => {
  const handler = contributePostPublish().build(makeDeps([]));
  await assert.rejects(
    () => handler.apply({ entity: { entityType: "post", id: "x", contentHash: "h", hashVersion: 1, requiredBlobs: [], state: {} }, expectedVersion: undefined, principalId: "p1" }),
    /not implemented yet/
  );
});
