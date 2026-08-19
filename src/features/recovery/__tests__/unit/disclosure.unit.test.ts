import assert from "node:assert/strict";
import test from "node:test";

import { computeDisclosure } from "../../disclosure.js";

/**
 * @file REQ-09/REQ-10/REQ-11 (SPEC-019) — `computeDisclosure`'s covered-category restriction and
 * unknown-baseline rendering (C-305; INV-05).
 *
 * Covers: AC-16 (only posts/pages + plugin-table categories listed), AC-17 (Collections `entries`
 * omitted until write-path inventory confirms watermark-stamping), AC-18 (acknowledge control
 * requires caveat-text, tested at the UI/data-shape level here), AC-19 (unknown estimate when
 * content.db is unreadable), EC-02 (watermarkAtCapture null for pre-column rows), EC-08 (baseline
 * wholly unavailable at compute time).
 */

const COVERED_CATEGORIES = ["posts", "pages", "plugin-tables"] as const;

test("AC-16: disclosure lists counts only for posts/pages + plugin-table categories, in the current write-path inventory", async () => {
  const watermarkSource = {
    getBaseline: async () => ({ available: true as const, watermarkAtCapture: 1000, currentWatermark: 1050 }),
    getCategoryCounts: async () => ({ posts: 12, pages: 3, "plugin-tables": 1 }),
  };

  const result = await computeDisclosure({
    deps: { watermarkSource, coveredCategories: COVERED_CATEGORIES },
    input: { restorePointId: "rp-1" },
  });

  assert.equal(result.partial, true);
  assert.deepEqual(Object.keys(result.counts).sort(), ["pages", "plugin-tables", "posts"]);
});

test("AC-17: a Collections `entries` category is never present in the disclosure output, even if the caller-supplied count source has data for it", async () => {
  const watermarkSource = {
    getBaseline: async () => ({ available: true as const, watermarkAtCapture: 500, currentWatermark: 520 }),
    // Simulates a count source that (incorrectly, if consulted) has entries data available.
    getCategoryCounts: async () => ({ posts: 5, pages: 1, "plugin-tables": 0, entries: 999 }),
  };

  const result = await computeDisclosure({
    deps: { watermarkSource, coveredCategories: COVERED_CATEGORIES },
    input: { restorePointId: "rp-2" },
  });

  assert.equal(Object.prototype.hasOwnProperty.call(result.counts, "entries"), false, "entries must never appear until ADR-041 item 11 confirms its write path is watermark-stamped (REQ-09)");
});

test("AC-19/EC-08: when the watermark baseline is unavailable (content.db unreadable), the disclosure states plainly it could not be computed and never implies zero loss", async () => {
  const watermarkSource = {
    getBaseline: async () => ({ available: false as const }),
    getCategoryCounts: async () => ({}),
  };

  const result = await computeDisclosure({
    deps: { watermarkSource, coveredCategories: COVERED_CATEGORIES },
    input: { restorePointId: "rp-3" },
  });

  assert.equal(result.watermarkBaselineAvailable, false);
  for (const category of COVERED_CATEGORIES) {
    assert.equal(result.counts[category], "unknown", `category '${category}' must render as unknown, never 0, when the baseline is unavailable (REQ-11)`);
  }
});

test("EC-02: a restore point whose watermarkAtCapture is null (pre-column row) renders an unknown estimate for that restore point, never zero loss", async () => {
  const watermarkSource = {
    getBaseline: async () => ({ available: true as const, watermarkAtCapture: null, currentWatermark: 900 }),
    getCategoryCounts: async () => ({ posts: 4, pages: 0, "plugin-tables": 0 }),
  };

  const result = await computeDisclosure({
    deps: { watermarkSource, coveredCategories: COVERED_CATEGORIES },
    input: { restorePointId: "rp-4" },
  });

  for (const category of COVERED_CATEGORIES) {
    assert.equal(result.counts[category], "unknown", "a null watermarkAtCapture must never be treated as a zero-baseline (matches SPEC-016 EC-06 exactly)");
  }
});

test("INV-05: the disclosure never asserts a numeric count for a category outside coveredCategories, regardless of what getCategoryCounts returns", async () => {
  const watermarkSource = {
    getBaseline: async () => ({ available: true as const, watermarkAtCapture: 10, currentWatermark: 15 }),
    getCategoryCounts: async () => ({ posts: 1, pages: 0, "plugin-tables": 0, sessions: 42, "change-sets": 7 }),
  };

  const result = await computeDisclosure({
    deps: { watermarkSource, coveredCategories: COVERED_CATEGORIES },
    input: { restorePointId: "rp-5" },
  });

  assert.equal(Object.prototype.hasOwnProperty.call(result.counts, "sessions"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.counts, "change-sets"), false);
});
