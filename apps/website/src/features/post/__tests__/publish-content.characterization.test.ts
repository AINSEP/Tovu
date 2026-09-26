import assert from "node:assert/strict";
import test from "node:test";

import { PublishContentApplyRowError } from "#src/features/publish-content/apply-errors";
import { makeSite, sqliteContentSite, WORKSPACE_ID } from "#src/features/publish-content/__tests__/round-trip-harness";
import type { PackedEntity, PublishContentHandler } from "#src/features/publish-content/type-registry";

import type { PostRecord } from "../post.js";
import { contributePagePublish, contributePostPublish } from "../publish-content.js";

/**
 * @file Characterization pin for M-POST (`plan-publish-all-types-2026-09-25.md` §5, §7): the live site
 * holds a baseline `contentHash` for every published post and page, so moving the handler onto
 * `createRepoPublishHandler` must keep every hash (untagged and tagged), packed state and exact reason
 * byte-identical. Written against the hand-written handler and kept green across the migration.
 */

const at = "2026-09-01T00:00:00.000Z";

function row(overrides: Partial<PostRecord> & { id: string; slug: string }): PostRecord {
  return {
    workspaceId: WORKSPACE_ID,
    title: "Hello",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: at,
    version: 3,
    seoExtJson: null,
    deletedAt: null,
    createdAt: at,
    createdByPrincipalId: "author-1",
    ...overrides,
  } as PostRecord;
}

async function site() {
  const s = sqliteContentSite();
  await s.taxonomies.insert({ id: "tx-tags", name: "Tags", hierarchical: false, status: "active", updatedAt: at, version: 1 });
  for (const [id, name] of [["t-a", "Alpha"], ["t-b", "Beta"]]) {
    await s.terms.insert({ id, taxonomyId: "tx-tags", parentId: null, name, status: "active", updatedAt: at, version: 1 });
  }
  await s.posts.save(row({ id: "p-untagged", slug: "untagged" }));
  await s.posts.save(row({ id: "p-tagged", slug: "tagged", title: "Tagged", seoExtJson: '{"description":"d"}' }));
  await s.entryTerms.upsert({ contentType: "post", contentId: "p-tagged", termId: "t-b", addedAt: at });
  await s.entryTerms.upsert({ contentType: "post", contentId: "p-tagged", termId: "t-a", addedAt: at });
  await s.posts.save(row({ id: "pg-about", slug: "about", kind: "page", title: "About", bodyFormat: "html", bodyJson: null as never, bodyHtml: "<p>About</p>" }));
  await s.posts.save(row({ id: "p-trashed", slug: "old", deletedAt: at }));
  return { s, deps: makeSite(s.ports) };
}

const PINNED: Record<string, string> = {
  "p-untagged": "e8de450f9b9261409612dafb73f423f1cbf1d86c4b615c7ff5fd651ea96ce0b3",
  "p-tagged": "65ee9e4d21f9a4ff971c8a0900ab4e1eb81f287812f004795a04e11ab38c7eb9",
  "pg-about": "3ef2554ba2fd1e20986fae2fc52e99c47cd2b5e4ba4d3fc8037ae00e66b5cbf6",
};

async function packOf(handler: PublishContentHandler) {
  const out: PackedEntity[] = [];
  for await (const e of handler.pack()) out.push(e);
  return out;
}

const entity = (entityType: string, id: string, state: Record<string, unknown>): PackedEntity => ({
  entityType,
  id,
  schemaVersion: 2,
  contentHash: "unused",
  hashVersion: 1,
  requiredBlobs: [],
  state,
});

test("pack(): pinned contentHash per post and page (untagged, tagged), schemaVersion 2, trashed skipped", async () => {
  const { deps } = await site();
  const posts = await packOf(contributePostPublish().build(deps));
  const pages = await packOf(contributePagePublish().build(deps));
  assert.deepEqual(
    [...posts, ...pages].map((e) => [e.entityType, e.id, e.contentHash, e.schemaVersion, e.hashVersion, e.requiredBlobs]).sort(),
    [
      ["page", "pg-about", PINNED["pg-about"], 2, 1, []],
      ["post", "p-tagged", PINNED["p-tagged"], 2, 1, []],
      ["post", "p-untagged", PINNED["p-untagged"], 2, 1, []],
    ]
  );
  const tagged = posts.find((e) => e.id === "p-tagged")!;
  assert.deepEqual(Object.keys(tagged.state), [
    "title",
    "slug",
    "bodyJson",
    "status",
    "kind",
    "bodyFormat",
    "bodyHtml",
    "seoExtJson",
    "templateChoice",
    "overridesThemePage",
    "memberAccessJson",
    "createdByPrincipalId",
    "createdAt",
    "termIds",
  ]);
  assert.deepEqual(tagged.state.termIds, ["t-a", "t-b"]);
  assert.equal(tagged.state.createdByPrincipalId, "author-1");
  assert.equal("termIds" in posts.find((e) => e.id === "p-untagged")!.state, false);
});

test("inspect(): the destination's hash equals the pinned pack hash; the other kind is invisible", async () => {
  const { deps } = await site();
  const post = contributePostPublish().build(deps);
  const page = contributePagePublish().build(deps);
  assert.deepEqual(await post.inspect("p-untagged"), { version: 3, hash: PINNED["p-untagged"] });
  assert.deepEqual(await post.inspect("p-tagged"), { version: 3, hash: PINNED["p-tagged"] });
  assert.deepEqual(await page.inspect("pg-about"), { version: 3, hash: PINNED["pg-about"] });
  assert.equal(await page.inspect("p-untagged"), null);
  assert.equal(await post.inspect("nope"), null);
});

test("precheck(): exact reason strings", async () => {
  const { deps } = await site();
  const post = contributePostPublish().build(deps);
  const page = contributePagePublish().build(deps);
  const state = (slug: unknown) => ({ title: "X", slug, kind: "post", status: "published", bodyFormat: "doc" });

  assert.match(
    (await contributePostPublish().build(makeSite({})).precheck(entity("post", "x", state("x")))) ?? "",
    /^post entity 'x' cannot be prechecked — no post (repo|port) wired for this deps bag$/
  );
  assert.equal(await post.precheck(entity("post", "p-new", state("fresh"))), null);
  assert.equal(await post.precheck(entity("post", "p-tagged", state("tagged"))), null);
  assert.equal(await post.precheck(entity("post", "p-new", state(""))), "post entity 'p-new' has no usable slug to check for a collision");
  assert.equal(await post.precheck(entity("post", "p-new", state(7))), "post entity 'p-new' has no usable slug to check for a collision");
  assert.equal(await post.precheck(entity("post", "p-new", state("tagged"))), "slug 'tagged' is already held by a different post ('p-tagged')");
  assert.equal(
    await post.precheck(entity("post", "p-trashed", state("old"))),
    "post 'p-trashed' is in the trash at this destination — restore it before publishing over it, or publishing would resurrect it as live content"
  );
  assert.equal(
    await page.precheck(entity("page", "p-untagged", { ...state("untagged"), kind: "page" })),
    "'p-untagged' is a 'post' at this destination but a 'page' at the source — kind is fixed at creation and cannot be changed by publishing"
  );
});

/** What `apply-loop.ts`'s `classifyApplyRowFailure` reports for a thrown apply error. */
function classify(handler: PublishContentHandler, entityType: string, id: string, error: unknown) {
  if (error instanceof PublishContentApplyRowError) return { outcome: error.rowOutcome, reason: error.message };
  if (handler.isApplyConflict?.(error)) return { outcome: "conflict", reason: `${entityType} '${id}' changed on the destination during apply: ${error.message}` };
  return null;
}

test("apply(): a stale version is a conflict row; create and update land with terms synced", async () => {
  const { s, deps } = await site();
  const post = contributePostPublish().build(deps);
  const packed = (await packOf(post)).find((e) => e.id === "p-tagged")!;

  const stale = await post.apply({ entity: packed, expectedVersion: 1, principalId: "op", idempotencyKey: "k1" }).then(
    () => null,
    (err: unknown) => classify(post, "post", "p-tagged", err)
  );
  assert.equal(stale?.outcome, "conflict");
  assert.match(stale?.reason ?? "", /^post 'p-tagged' changed on the destination during apply: /);

  const updated = await post.apply({
    entity: { ...packed, state: { ...packed.state, title: "Retitled", termIds: ["t-a"] } },
    expectedVersion: 3,
    principalId: "op",
    idempotencyKey: "k2",
  });
  assert.ok(updated.changeSetId);
  assert.equal((await s.posts.findById({ workspaceId: WORKSPACE_ID, id: "p-tagged" }))?.title, "Retitled");
  assert.deepEqual((await s.entryTerms.listForContent({ contentType: "post", contentId: "p-tagged" })).map((r) => r.termId), ["t-a"]);

  await post.apply({ entity: { ...packed, id: "p-copy", state: { ...packed.state, slug: "copy" } }, expectedVersion: undefined, principalId: "op", idempotencyKey: "k3" });
  const created = await s.posts.findById({ workspaceId: WORKSPACE_ID, id: "p-copy" });
  assert.equal(created?.createdByPrincipalId, "author-1");
  assert.equal(created?.slug, "copy");

  const missingTerm = await post
    .apply({ entity: { ...packed, id: "p-x", state: { ...packed.state, slug: "x", termIds: ["t-zz"] } }, expectedVersion: undefined, principalId: "op", idempotencyKey: "k4" })
    .then(
      () => null,
      (err: unknown) => classify(post, "post", "p-x", err)
    );
  assert.deepEqual(missingTerm, {
    outcome: "blocked",
    reason: "post 'p-x' is tagged with term 't-zz', which is missing at this destination — publish or restore that term first",
  });
  assert.equal(await s.posts.findById({ workspaceId: WORKSPACE_ID, id: "p-x" }), null);
});
