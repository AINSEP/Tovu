import assert from "node:assert/strict";
import test from "node:test";

import { deriveDailySalt } from "../salt.js";

const ROOT_KEY_SEED = "test-root-key-seed-do-not-use-in-prod";

test("deriveDailySalt is deterministic for a fixed (rootKeySeed, workspaceId, utcDate) triple", () => {
  const first = deriveDailySalt({ rootKeySeed: ROOT_KEY_SEED, workspaceId: "workspace-1", utcDate: "2026-07-10" });
  const second = deriveDailySalt({ rootKeySeed: ROOT_KEY_SEED, workspaceId: "workspace-1", utcDate: "2026-07-10" });

  assert.equal(first.equals(second), true);
  assert.equal(first.length, 32);
});

test("deriveDailySalt rotates across UTC days (salt rotation)", () => {
  const day1 = deriveDailySalt({ rootKeySeed: ROOT_KEY_SEED, workspaceId: "workspace-1", utcDate: "2026-07-10" });
  const day2 = deriveDailySalt({ rootKeySeed: ROOT_KEY_SEED, workspaceId: "workspace-1", utcDate: "2026-07-11" });

  assert.equal(day1.equals(day2), false);
});

test("deriveDailySalt is workspace-scoped (no cross-workspace salt reuse)", () => {
  const workspaceA = deriveDailySalt({ rootKeySeed: ROOT_KEY_SEED, workspaceId: "workspace-a", utcDate: "2026-07-10" });
  const workspaceB = deriveDailySalt({ rootKeySeed: ROOT_KEY_SEED, workspaceId: "workspace-b", utcDate: "2026-07-10" });

  assert.equal(workspaceA.equals(workspaceB), false);
});

test("deriveDailySalt changes when the root key seed changes", () => {
  const seedA = deriveDailySalt({ rootKeySeed: "seed-a", workspaceId: "workspace-1", utcDate: "2026-07-10" });
  const seedB = deriveDailySalt({ rootKeySeed: "seed-b", workspaceId: "workspace-1", utcDate: "2026-07-10" });

  assert.equal(seedA.equals(seedB), false);
});

test("deriveDailySalt rejects an empty workspaceId", () => {
  assert.throws(() => deriveDailySalt({ rootKeySeed: ROOT_KEY_SEED, workspaceId: "", utcDate: "2026-07-10" }), RangeError);
});

test("deriveDailySalt rejects an empty utcDate", () => {
  assert.throws(() => deriveDailySalt({ rootKeySeed: ROOT_KEY_SEED, workspaceId: "workspace-1", utcDate: "" }), RangeError);
});
