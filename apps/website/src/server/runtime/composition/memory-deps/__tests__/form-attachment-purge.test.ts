import assert from "node:assert/strict";
import { test } from "node:test";
import type { TrashAdapter } from "@jini-ai/cms/trash";
import { attachFormAttachmentPurge, formAttachmentRemover, formSubmissionReader } from "../slices/form-attachment-purge.js";

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
