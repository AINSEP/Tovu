import assert from "node:assert/strict";
import test from "node:test";
import { hkdfSync } from "node:crypto";

import { deriveDailySalt } from "../salt.js";

const ANALYTICS_SEED = "test-site-key-seed-do-not-use-in-prod";

test("deriveDailySalt is deterministic for a fixed (analyticsSeed, workspaceId, utcDate) triple", () => {
  const first = deriveDailySalt({ analyticsSeed: ANALYTICS_SEED, workspaceId: "workspace-1", utcDate: "2026-07-10" });
  const second = deriveDailySalt({ analyticsSeed: ANALYTICS_SEED, workspaceId: "workspace-1", utcDate: "2026-07-10" });

  assert.equal(first.equals(second), true);
  assert.equal(first.length, 32);
  // PARITY: migration must keep the original host HKDF context byte-for-byte.
  const expected = Buffer.from(hkdfSync("sha256", ANALYTICS_SEED,
    "tovu-analytics-daily-salt-hkdf-v1", "analytics-salt:workspace-1:2026-07-10", 32));
  assert.deepEqual(first, expected);
});

test("deriveDailySalt rotates across UTC days (salt rotation)", () => {
  const day1 = deriveDailySalt({ analyticsSeed: ANALYTICS_SEED, workspaceId: "workspace-1", utcDate: "2026-07-10" });
  const day2 = deriveDailySalt({ analyticsSeed: ANALYTICS_SEED, workspaceId: "workspace-1", utcDate: "2026-07-11" });

  assert.equal(day1.equals(day2), false);
});

test("deriveDailySalt is workspace-scoped (no cross-workspace salt reuse)", () => {
  const workspaceA = deriveDailySalt({ analyticsSeed: ANALYTICS_SEED, workspaceId: "workspace-a", utcDate: "2026-07-10" });
  const workspaceB = deriveDailySalt({ analyticsSeed: ANALYTICS_SEED, workspaceId: "workspace-b", utcDate: "2026-07-10" });

  assert.equal(workspaceA.equals(workspaceB), false);
});

test("deriveDailySalt changes when the analytics seed changes", () => {
  const seedA = deriveDailySalt({ analyticsSeed: "seed-a", workspaceId: "workspace-1", utcDate: "2026-07-10" });
  const seedB = deriveDailySalt({ analyticsSeed: "seed-b", workspaceId: "workspace-1", utcDate: "2026-07-10" });

  assert.equal(seedA.equals(seedB), false);
});

test("deriveDailySalt rejects an empty workspaceId", () => {
  assert.throws(() => deriveDailySalt({ analyticsSeed: ANALYTICS_SEED, workspaceId: "", utcDate: "2026-07-10" }), RangeError);
});

test("deriveDailySalt rejects an empty utcDate", () => {
  assert.throws(() => deriveDailySalt({ analyticsSeed: ANALYTICS_SEED, workspaceId: "workspace-1", utcDate: "" }), RangeError);
});
