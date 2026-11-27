import assert from "node:assert/strict";
import test from "node:test";
import { createCleanupPreviewStore } from "@jini-ai/platform/retention";
import { createStorageCleanupGate, type StoragePassView } from "../cleanup-gate.js";

/** A recording runner whose dry run reports `bytes`; `bytes` can change between preview and apply. */
function harness({ ttlMs = 60_000 } = {}) {
  let now = 0;
  let tokens = 0;
  const state = { bytes: 5, live: 0 };
  const runOnce = async ({ dryRun }: { dryRun: boolean }): Promise<StoragePassView> => {
    if (!dryRun) state.live += 1;
    return { status: "completed", dryRun, policies: [{ id: "share-files", bytes: state.bytes, items: 1 }] };
  };
  const previewStore = createCleanupPreviewStore({ randomToken: () => `grant-${++tokens}`, mono: () => now }, { ttlMs });
  const gate = createStorageCleanupGate({ runOnce, previewStore }, {});
  return { gate, state, advance: (ms: number) => { now += ms; } };
}

test("a dry run is free and mints nothing", async () => {
  const h = harness();
  const pass = await h.gate.dryRun({}, {});
  assert.equal(pass.dryRun, true);
  assert.equal(h.state.live, 0);
});

test("live without a grant is refused and deletes nothing", async () => {
  const h = harness();
  assert.deepEqual(await h.gate.apply({ principalId: "owner", previewToken: undefined }, {}), { status: "refused", reason: "no-grant" });
  assert.deepEqual(await h.gate.apply({ principalId: "owner", previewToken: "made-up" }, {}), { status: "refused", reason: "grant-invalid" });
  assert.equal(h.state.live, 0);
});

test("a valid grant executes exactly once; a replay is refused", async () => {
  const h = harness();
  const { previewToken, pass } = await h.gate.preview({ principalId: "owner" }, {});
  assert.equal(pass.dryRun, true);
  const first = await h.gate.apply({ principalId: "owner", previewToken }, {});
  assert.equal(first.status, "applied");
  assert.deepEqual(await h.gate.apply({ principalId: "owner", previewToken }, {}), { status: "refused", reason: "grant-invalid" });
  assert.equal(h.state.live, 1);
});

test("concurrent applies of one grant run the live pass once", async () => {
  const h = harness();
  const { previewToken } = await h.gate.preview({ principalId: "owner" }, {});
  const outcomes = await Promise.all([1, 2, 3].map(() => h.gate.apply({ principalId: "owner", previewToken }, {})));
  assert.equal(outcomes.filter(outcome => outcome.status === "applied").length, 1);
  assert.equal(h.state.live, 1);
});

test("a grant pinned to a different preview is refused", async () => {
  const h = harness();
  const { previewToken } = await h.gate.preview({ principalId: "owner" }, {});
  h.state.bytes = 9;
  assert.deepEqual(await h.gate.apply({ principalId: "owner", previewToken }, {}), { status: "refused", reason: "grant-invalid" });
  assert.equal(h.state.live, 0);
});

test("a grant is bound to the principal it was minted for and expires", async () => {
  const h = harness({ ttlMs: 100 });
  const { previewToken } = await h.gate.preview({ principalId: "owner" }, {});
  assert.equal((await h.gate.apply({ principalId: "someone-else", previewToken }, {})).status, "refused");
  h.advance(101);
  assert.equal((await h.gate.apply({ principalId: "owner", previewToken }, {})).status, "refused");
  assert.equal(h.state.live, 0);
});

test("a plan status change invalidates approval even when neither pass has policy rows", async () => {
  let status = "completed";
  const calls: boolean[] = [];
  const gate = createStorageCleanupGate({
    runOnce: async ({ dryRun }) => { calls.push(dryRun); return { status, dryRun }; },
    previewStore: createCleanupPreviewStore({ randomToken: () => "owner-reviewed", mono: () => 0 }),
  });
  const { pass, previewToken } = await gate.preview({ principalId: "owner" }, {});
  assert.deepEqual(pass, { status: "completed", dryRun: true });
  status = "busy";
  assert.deepEqual(await gate.apply({ principalId: "owner", previewToken }, {}), { status: "refused", reason: "grant-invalid" });
  assert.deepEqual(calls, [true, true]);
});
