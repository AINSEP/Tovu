import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { uploadMedia } from "@jini-ai/cms/media";
import type { TrashAdapter } from "@jini-ai/cms/trash";
import { attachFormAttachmentPurge, formAttachmentRemover, formSubmissionReader } from "../slices/form-attachment-purge.js";
import { createRouteDeps } from "../../app.js";

/**
 * @file The in-memory root's form attachment purge pieces, against interface fakes (design 02 step 4):
 * the submission reader pages like the SQL host (keyset by id, sorted, terminal empty page for one
 * submission), the remover is a no-op for an already-gone asset, and the wiring wraps exactly the
 * `form` and `form_submission` adapters and fails with a plain message when one is missing.
 */

const submission = (id: string) => ({ id, data: { id } });

function fakeSubmissionRepo(rows: ReturnType<typeof submission>[]) {
  return {
    listAllForDefinition: async () => rows,
    findAnyById: async ({ id }: { id: string }) => rows.find((row) => row.id === id) ?? null,
  } as never;
}

test("form reader: all submissions of a form, sorted by id, after the cursor, limited, as dataJson", async () => {
  const read = formSubmissionReader({ formSubmissionRepo: fakeSubmissionRepo([submission("c"), submission("a"), submission("b")]), entityType: "form" });
  assert.deepEqual(await read({ workspaceId: "w", entityId: "f", limit: 2 }), [
    { id: "a", dataJson: JSON.stringify({ id: "a" }) }, { id: "b", dataJson: JSON.stringify({ id: "b" }) },
  ]);
  assert.deepEqual((await read({ workspaceId: "w", entityId: "f", after: "b", limit: 5 })).map((row) => row.id), ["c"]);
});

test("form_submission reader: one page for the single submission, then the terminal empty page; a missing row is empty", async () => {
  const read = formSubmissionReader({ formSubmissionRepo: fakeSubmissionRepo([submission("s1")]), entityType: "form_submission" });
  assert.deepEqual((await read({ workspaceId: "w", entityId: "s1", limit: 10 })).map((row) => row.id), ["s1"]);
  assert.deepEqual(await read({ workspaceId: "w", entityId: "s1", after: "s1", limit: 10 }), []);
  assert.deepEqual(await read({ workspaceId: "w", entityId: "missing", limit: 10 }), []);
});

test("attachment remover: an asset that is already gone is a no-op and never reads the route deps", async () => {
  let rootReads = 0;
  const remove = formAttachmentRemover({
    mediaRepo: { findById: async () => null } as never, formSubmissionRepo: {} as never, postRepo: {} as never,
    clock: {} as never, idGen: {} as never, outbox: {} as never, entryRefsRepo: () => ({}) as never,
    routeDeps: () => { rootReads += 1; return {} as never; },
  });
  await remove({ workspaceId: "w", mediaId: "m1" });
  assert.equal(rootReads, 0);
});

test("attach: wraps exactly the form and form_submission adapters; any other adapter is left as it was", () => {
  const plain = (entityType: string): TrashAdapter => ({ entityType } as never);
  const adapters = new Map<string, TrashAdapter>([["form", plain("form")], ["form_submission", plain("form_submission")], ["post", plain("post")]]);
  const before = new Map(adapters);
  attachFormAttachmentPurge({ adapters, formSubmissionRepo: {} as never, mediaRepo: {} as never, postRepo: {} as never, clock: {} as never, idGen: {} as never, outbox: {} as never, entryRefsRepo: () => ({}) as never, routeDeps: () => ({}) as never });
  assert.notEqual(adapters.get("form"), before.get("form"));
  assert.notEqual(adapters.get("form_submission"), before.get("form_submission"));
  assert.equal(adapters.get("post"), before.get("post"));
});

test("attach: a missing form adapter fails with the exact message", () => {
  assert.throws(
    () => attachFormAttachmentPurge({ adapters: new Map(), formSubmissionRepo: {} as never, mediaRepo: {} as never, postRepo: {} as never, clock: {} as never, idGen: {} as never, outbox: {} as never, entryRefsRepo: () => ({}) as never, routeDeps: () => ({}) as never }),
    { message: "memory trash has no form adapter" },
  );
});

test("memory purge removes a submission's private media and journals its exact storage key", async () => {
  const deps = createRouteDeps();
  const workspaceId = deps.workspaceId, at = "2030-01-01T00:00:00.000Z";
  const actor = { principalId: "form-owner" };
  const formDefinitionId = "attachment-form", id = "answer-with-attachment";
  await deps.formDefinitionRepo.create({ id: formDefinitionId, workspaceId, name: "Files", slug: "files", status: "active", version: 1,
    createdAt: at, updatedAt: at, fields: [], notify: { enabled: false, recipients: [] } });
  const { media } = await uploadMedia({ deps: { mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo,
    renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore, clock: deps.clock, idGen: deps.idGen, createHash },
    input: { workspaceId, filename: "answer-with-attachment-photo.png", contentType: "image/png",
      bytes: Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), createdByPrincipal: actor.principalId, access: "private" } });
  const blob = await deps.assetBlobRepo.findByHash({ workspaceId, sha256: media.source.sha256 });
  assert.ok(blob);
  assert.equal(blob.status, "active");
  await deps.formSubmissionRepo.create({ workspaceId, id, formDefinitionId,
    data: { photo: { mediaId: media.id, filename: "photo.png", contentType: "image/png", byteSize: 8 } }, sourceIp: null, submittedAt: at });
  assert.equal((await deps.trash.trash({ workspaceId, entityType: "form_submission", entityId: id, actor,
    display: { title: "Files" }, at, expectedVersion: null })).ok, true);
  const { items } = await deps.trash.list({ workspaceId, now: at, limit: 10 });
  const item = items.find(row => row.entityId === id && row.entityType === "form_submission");
  assert.ok(item);
  assert.equal((await deps.mediaRepo.findById({ workspaceId, id: media.id }))?.status, "active");

  const report = await deps.trash.purgeSelected({ workspaceId, ids: [item.id], actor, authorizeItem: async () => true });
  assert.equal(report.purged, 1);
  assert.equal(await deps.mediaRepo.findById({ workspaceId, id: media.id }), null);
  assert.equal((await deps.assetBlobRepo.findByHash({ workspaceId, sha256: media.source.sha256 }))?.status, "tombstoned");
  const pending = await deps.outbox.claimPending({ batchSize: 50, nowIso: "2999-01-01T00:00:00.000Z" });
  const cleanup = pending.filter(({ event }) => event.name === "form.attachment.cleanup" && event.aggregateId === media.id);
  assert.equal(cleanup.length, 1);
  assert.deepEqual((cleanup[0]!.event.payload as { storageKeys: string[] }).storageKeys, [blob.storageKey]);
});
