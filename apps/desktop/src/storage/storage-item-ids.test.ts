import assert from "node:assert/strict";
import test from "node:test";
import { createStorageItemIds } from "./storage-item-ids.ts";

function fixture() {
  let sequence = 0;
  let now = 100;
  const ids = createStorageItemIds<string>({ randomId: () => `opaque-${++sequence}`, now: () => now }, { itemTtlMs: 25 });
  return { ids, advanceTo: (time: number) => { now = time; } };
}

test("item IDs and confirmations expire at the deadline, not a tick later", () => {
  const { ids, advanceTo } = fixture();
  const senderId = 5;
  const kind = "folder";
  const id = ids.issue({ senderId, kind, target: "/sites/dismissed" });
  const first = ids.issueConfirmation({ senderId, id, action: "trash-folder" });
  const second = ids.issueConfirmation({ senderId, id, action: "trash-folder" });
  advanceTo(124);
  assert.equal(ids.resolve({ senderId, id, kind }), "/sites/dismissed");
  assert.deepEqual(ids.spendConfirmation({ senderId, confirmationId: first }), { id, action: "trash-folder" });
  advanceTo(125);
  assert.equal(ids.resolve({ senderId, id, kind }), undefined);
  assert.equal(ids.spendConfirmation({ senderId, confirmationId: second }), undefined);
});

test("relisting replaces only that sender's item IDs and outstanding confirmations", () => {
  const { ids } = fixture();
  const kind = "folder";
  const a = ids.issue({ senderId: 1, kind, target: "/sites/a" });
  const b = ids.issue({ senderId: 2, kind, target: "/sites/b" });
  const confirmA = ids.issueConfirmation({ senderId: 1, id: a, action: "trash-folder" });
  const confirmB = ids.issueConfirmation({ senderId: 2, id: b, action: "trash-folder" });
  assert.equal(ids.resolve({ senderId: 1, id: a, kind }), "/sites/a");
  ids.reset({ senderId: 1 });
  assert.equal(ids.resolve({ senderId: 1, id: a, kind }), undefined);
  assert.equal(ids.spendConfirmation({ senderId: 1, confirmationId: confirmA }), undefined);
  assert.equal(ids.resolve({ senderId: 2, id: b, kind }), "/sites/b");
  assert.deepEqual(ids.spendConfirmation({ senderId: 2, confirmationId: confirmB }), { id: b, action: "trash-folder" });
});

test("an item is kind-bound and a confirmation tried by the wrong sender cannot be replayed", () => {
  const { ids } = fixture();
  const id = ids.issue({ senderId: 8, kind: "sign-in", target: "partition-a" });
  const confirmationId = ids.issueConfirmation({ senderId: 8, id, action: "remove-sign-in" });
  assert.equal(ids.resolve({ senderId: 8, kind: "folder", id }), undefined);
  assert.equal(ids.resolve({ senderId: 8, kind: "sign-in", id }), "partition-a");
  assert.equal(ids.spendConfirmation({ senderId: 9, confirmationId }), undefined);
  assert.equal(ids.spendConfirmation({ senderId: 8, confirmationId }), undefined);
});
