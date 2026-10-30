import assert from "node:assert/strict";
import test from "node:test";
import type { JsonObject } from "@jini-ai/core/primitives";
import type { ChangeSetItemRecord } from "@jini-ai/cms/core";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { copyBodyJsonWithFreshEmbedPlacements } from "../duplicate-embeds.js";
import { toRecord, toRow, updatableColumns } from "../repo.rows.js";
import { createPostReverters } from "../reverters.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { contentHash, CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import { contributePostPublish, toPublishableState } from "../publish-content.js";
import { buildPostRecord } from "./post-record.fixture.js";

const clock = { nowMs: () => Date.parse("2026-10-10T00:00:00Z") };

test("L156 duplicate clones all leaves and malformed embeds, minting only string placements in preorder", () => {
  const doc: JsonObject = { content: [null, 7, false, "text", [],
    { type: "widgetEmbed" }, { type: "widgetEmbed", attrs: null },
    { type: "widgetEmbed", attrs: [] }, { type: "widgetEmbed", attrs: { placementId: 3 } },
    { type: "paragraph", attrs: { placementId: "unchanged" } },
    { type: "widgetEmbed", attrs: { placementId: "", nested: { type: "widgetEmbed", attrs: { placementId: "nested" } } } },
    { type: "widgetEmbed", attrs: { placementId: "last", widgetEntryId: "shared" } },
  ] };
  let minted = 0;
  const copy = copyBodyJsonWithFreshEmbedPlacements(doc, () => `new-${++minted}`);
  const expected = structuredClone(doc);
  const content = expected.content as JsonObject[];
  const parent = content[10]!.attrs as JsonObject;
  parent.placementId = "new-1";
  ((parent.nested as JsonObject).attrs as JsonObject).placementId = "new-2";
  (content[11]!.attrs as JsonObject).placementId = "new-3";
  assert.deepEqual(copy, expected);
  assert.equal(minted, 3);
  assert.notEqual(copy.content, doc.content);
  assert.notEqual((copy.content as JsonObject[])[10]!.attrs, (doc.content as JsonObject[])[10]!.attrs);
  assert.equal(((doc.content as JsonObject[])[10]!.attrs as JsonObject).placementId, "");
});

test("L156 row mappings preserve null defaults, body exclusivity, tri-state and omitted schedule/ext", () => {
  const record = buildPostRecord();
  const row = toRow(record);
  assert.deepEqual([row.seo_ext_json, row.deleted_at, row.template_choice, row.overrides_theme_page,
    row.member_access_json, row.created_by_principal_id, row.created_at, row.publish_at,
    row.featured_media_id, row.author, row.show_author, row.ext],
  [null, null, null, null, null, null, null, null, null, null, false, "{}"]);
  const read = toRecord({ ...row, autosave_json: null });
  assert.deepEqual(read, { ...record, seoExtJson: null, deletedAt: null, templateChoice: null,
    overridesThemePage: null, memberAccessJson: null, createdByPrincipalId: null, createdAt: null,
    author: null, showAuthor: false });
  const filled = buildPostRecord({ bodyFormat: "html", bodyHtml: "<p>body</p>", seoExtJson: "seo",
    deletedAt: "deleted", templateChoice: "template", overridesThemePage: false, memberAccessJson: "members",
    createdByPrincipalId: "creator", createdAt: "created", publishAt: "later", featuredMediaId: "media",
    author: "Writer", showAuthor: true, ext: { plugin: { flag: true } } });
  const filledRow = toRow(filled);
  assert.equal(filledRow.body_json, null);
  assert.equal(filledRow.body_html, "<p>body</p>");
  assert.deepEqual(toRecord({ ...filledRow, autosave_json: null }), filled);
  assert.equal(toRow({ ...record, bodyHtml: "stray" }).body_html, null);
  assert.equal(toRecord({ ...row, overrides_theme_page: 1, show_author: 0, autosave_json: null }).overridesThemePage, true);
  assert.equal(toRecord({ ...row, show_author: 1, autosave_json: null }).showAuthor, true);
  const writable = updatableColumns(filledRow);
  assert.equal("created_by_principal_id" in writable, false);
  assert.equal("created_at" in writable, false);
  assert.equal("autosave_json" in writable, false);
  assert.equal("id" in writable, false);
  assert.throws(() => toRecord({ ...row, ext: "invalid", autosave_json: null }), SyntaxError);
  assert.throws(() => toRecord({ ...row, body_json: "invalid", autosave_json: null }), SyntaxError);
});

test("L156 update inverse preserves legacy fields, restores explicit values, and replaces ext verbatim", async () => {
  const current = buildPostRecord({ author: "Current", showAuthor: true, templateChoice: "current",
    publishAt: "later", featuredMediaId: "current-media", ext: { current: true }, status: "draft" });
  const repo = new InMemoryPostRepo([current]);
  const outbox = new InMemoryOutbox();
  const reverter = createPostReverters({ postRepo: repo, clock, outbox, forgetRemoved: async () => {} }).update;
  const item: ChangeSetItemRecord = { id: "item", changeSetId: "change", position: 0,
    entityType: "post", entityId: current.id, operation: "update" };
  await assert.rejects(reverter.applyInverse({ workspaceId: current.workspaceId, item }), /without an inverse payload/);
  const inverse = { title: "Old", slug: "old", bodyJson: { type: "doc", content: [] }, status: "draft" };
  await assert.rejects(reverter.applyInverse({ workspaceId: current.workspaceId,
    item: { ...item, entityId: "missing", inversePayload: inverse } }), /was not found/);
  const historicalExts: Array<JsonObject | undefined> = [undefined, {}, { historical: true }];
  for (const ext of historicalExts) {
    await repo.save(current);
    const inversePayload: JsonObject = { ...inverse };
    if (ext !== undefined) inversePayload.ext = ext;
    await reverter.applyInverse({ workspaceId: current.workspaceId, item: { ...item, inversePayload } });
    const restored = await repo.findById({ workspaceId: current.workspaceId, id: current.id });
    const { ext: _ext, ...withoutExt } = current;
    assert.deepEqual(restored, { ...withoutExt, ...inverse, bodyJson: inverse.bodyJson,
      version: current.version + 1, updatedAt: new Date(clock.nowMs()).toISOString(),
      ...(ext && Object.keys(ext).length ? { ext } : {}) });
    assert.equal(Object.hasOwn(restored!, "ext"), ext !== undefined && Object.keys(ext).length > 0);
  }
  await repo.save(current);
  await reverter.applyInverse({ workspaceId: current.workspaceId, item: { ...item, inversePayload: {
    ...inverse, status: "published", author: null, showAuthor: false, templateChoice: null,
    publishAt: null, featuredMediaId: null, ext: { historical: true },
  } } });
  const restored = await repo.findById({ workspaceId: current.workspaceId, id: current.id });
  assert.ok(restored);
  assert.equal(restored.author, null);
  assert.equal(restored.showAuthor, false);
  assert.equal(restored.templateChoice, null);
  assert.equal(Object.hasOwn(restored!, "publishAt"), false);
  assert.equal(Object.hasOwn(restored!, "featuredMediaId"), false);
  assert.deepEqual(restored.ext, { historical: true });
  assert.equal((await outbox.claimPending({ batchSize: 10, nowIso: new Date(clock.nowMs()).toISOString() }))[0]?.event.name, "entry.published");
});

test("L156 publish import uses source provenance only on create and keeps destination ext on update", async (t) => {
  const existing = buildPostRecord({ createdAt: "local-created", createdByPrincipalId: "local-author",
    ext: { local: { flag: true } }, author: "Old", showAuthor: true, publishAt: "later", featuredMediaId: "old-media" });
  const repo = new InMemoryPostRepo([existing]);
  const savedProvenance: unknown[] = [];
  const save = repo.save.bind(repo);
  t.mock.method(repo, "save", async (record: Parameters<typeof repo.save>[0]) => {
    // Assert the record at the write boundary before any repository normalization or read-back.
    savedProvenance.push({ id: record.id, createdAt: record.createdAt, createdByPrincipalId: record.createdByPrincipalId });
    return save(record);
  });
  const outbox = new InMemoryOutbox();
  let id = 0;
  const handler = contributePostPublish().build({ workspaceId: existing.workspaceId, clock,
    idGen: { newId: () => `generated-${++id}` }, outbox, changeSets: new InMemoryChangeSetRepo([], [], outbox),
    authorize: async () => ({ allowed: true, reason: "test" }),
    ports: { post: { repo, forgetRemoved: async () => {} } },
  });
  const source = toPublishableState(buildPostRecord({ createdAt: "source-created", createdByPrincipalId: "source-author" }));
  const entity = { entityType: "post", id: existing.id, schemaVersion: 2, state: source, contentHash: contentHash("post", source), hashVersion: CONTENT_HASH_VERSION, requiredBlobs: [] };
  await handler.apply({ entity, expectedVersion: 1, principalId: "operator", idempotencyKey: "update" });
  const updated = (await repo.findById({ workspaceId: existing.workspaceId, id: existing.id }))!;
  assert.deepEqual([updated.createdAt, updated.createdByPrincipalId, updated.ext, updated.author, updated.showAuthor],
    ["local-created", "local-author", { local: { flag: true } }, null, false]);
  assert.equal(Object.hasOwn(updated, "publishAt"), false);
  assert.equal(Object.hasOwn(updated, "featuredMediaId"), false);
  for (const [newId, provenance] of [["copy", source], ["legacy-copy", { ...source, createdAt: undefined, createdByPrincipalId: undefined }]] as const) {
    await handler.apply({ entity: { ...entity, id: newId, state: { ...provenance, slug: newId,
      author: "Source", showAuthor: true, publishAt: "2027-01-01T00:00:00.000Z", featuredMediaId: "source-media" } },
    expectedVersion: undefined, principalId: "operator", idempotencyKey: newId });
    const created = (await repo.findById({ workspaceId: existing.workspaceId, id: newId }))!;
    assert.deepEqual(savedProvenance.at(-1), { id: newId,
      createdAt: newId === "copy" ? "source-created" : null,
      createdByPrincipalId: newId === "copy" ? "source-author" : null });
    assert.deepEqual([created.createdAt, created.createdByPrincipalId], newId === "copy"
      ? ["source-created", "source-author"] : [null, null]);
    assert.deepEqual([created.author, created.showAuthor, created.publishAt, created.featuredMediaId, created.ext],
      ["Source", true, "2027-01-01T00:00:00.000Z", "source-media", undefined]);
  }
});

test("L156 duplicate treats an own __proto__ field as the clone prototype (reported, not fixed)", () => {
  const source = JSON.parse('{"type":"doc","__proto__":{"injected":true}}') as JsonObject;
  const copy = copyBodyJsonWithFreshEmbedPlacements(source, () => "unused");
  assert.equal(Object.hasOwn(source, "__proto__"), true);
  assert.equal(Object.hasOwn(copy, "__proto__"), false);
  assert.deepEqual(Object.getPrototypeOf(copy), { injected: true });
  assert.equal(Object.hasOwn(Object.prototype, "injected"), false);
});
