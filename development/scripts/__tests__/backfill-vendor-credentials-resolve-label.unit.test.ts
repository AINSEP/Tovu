import assert from "node:assert/strict";
import test from "node:test";

import { resolveLabel, type GroupState } from "../backfill-vendor-credentials-helpers";

/**
 * @file Direct coverage for `resolveLabel`'s three disambiguation tiers. The end-to-end subprocess
 * test (`backfill-vendor-credentials.test.ts`) only ever reaches tier 2 (the origin-suffix) — that
 * is the one real collision today's two source tables' vendor mappings can produce (both map every
 * OLD provider id within one table to a DISTINCT vendor, so the only possible collision is the same
 * vendor appearing once from `publish_credential_sets` and once from `source_control_credential_
 * sets` — exactly what that test's `github` fixture rows exercise). Tier 3 (the id-prefix fallback)
 * is therefore unreachable with today's finite, fixed provider-to-vendor mapping — but it is real
 * defensive code, not dead code: nothing prevents a FUTURE mapping change from sending two DIFFERENT
 * old provider ids within the SAME source table to the SAME vendor, and this test proves tier 3
 * still resolves correctly if that ever happens, rather than leaving it an unproven assumption.
 */

function state(takenLabels: readonly string[] = [], hasDefault = false): GroupState {
  return { takenLabels: new Set(takenLabels), hasDefault };
}

test("tier 1 — no collision: candidate label passes through unchanged", () => {
  assert.equal(resolveLabel("default", state([]), "publish", "row-1"), "default");
});

test("tier 2 — collides with an already-taken label: disambiguated with an origin suffix", () => {
  assert.equal(resolveLabel("default", state(["default"]), "source-control", "row-2"), "default (Source Control)");
  assert.equal(resolveLabel("default", state(["default"]), "publish", "row-2"), "default (Publish)");
});

test("tier 3 — even the origin-suffixed label is already taken: falls back to a deterministic id-prefix suffix", () => {
  const s = state(["default", "default (Source Control)"]);
  assert.equal(resolveLabel("default", s, "source-control", "abcdef1234567890"), "default (Source Control) abcdef12");
});

test("resolution is deterministic — the same inputs always produce the same output", () => {
  const s = state(["default"]);
  const a = resolveLabel("default", s, "source-control", "row-x");
  const b = resolveLabel("default", s, "source-control", "row-x");
  assert.equal(a, b);
});
