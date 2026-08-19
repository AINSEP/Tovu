import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "#src/db/sqlite/content-db";
import { reconcileMirror, stampWatermarkTx } from "../watermark.js";

/**
 * @file SPEC-016 U-004 / REQ-03–REQ-05 / EC-05 — boot-time mirror reconciliation direction.
 *
 * Assumed seam: `reconcileMirror(required: { db: ContentDb | null; mirror: MirrorStorePort })`.
 * `db: null` models "content.db failed to open at boot" (the caller catches the open failure and
 * passes `null` rather than reconcileMirror itself performing the open call — keeps this unit
 * pure with respect to filesystem/DB-open error handling, which is the composition root's job).
 * The successful-open cases use a real `openContentDb(":memory:")` handle (same as
 * `watermark-transaction.integration.test.ts`) so this suite exercises the real query path, not a
 * stand-in object.
 *
 * Certifies: U-004-B1 (unconditional overwrite from the authoritative value, discarding the
 * mirror's own prior value), U-004-B2 / U-004-F1 (failed open leaves the mirror unreconciled and
 * marks it `'unrefreshable'`, never a precise-looking but wrong value), and REQ-05's "no precise
 * count when content.db can't open" rule at the disclosure-consumer level (via `mirror.staleness`).
 */

function fakeMirror(initial: { value: number; staleness: "fresh" | "unrefreshable" }) {
  const state = { ...initial };
  return {
    get value() {
      return state.value;
    },
    get staleness() {
      return state.staleness;
    },
    async set(value: number) {
      state.value = value;
      state.staleness = "fresh";
    },
    async markUnrefreshable() {
      state.staleness = "unrefreshable";
    },
  };
}

test("U-004-B1 / REQ-04: reconcileMirror unconditionally overwrites the mirror from the authoritative value, discarding its prior value entirely", async () => {
  const db = openContentDb(":memory:");
  db.transaction((tx) => {
    stampWatermarkTx({ tx });
    stampWatermarkTx({ tx });
  });
  const mirror = fakeMirror({ value: 999, staleness: "fresh" });

  await reconcileMirror({ db, mirror });

  assert.equal(mirror.value, 2, "the mirror must be overwritten to content.db's real authoritative value (2), never the stale prior value (999)");
});

test("U-004-B2 / U-004-F1 / REQ-05 / EC-05: content.db failing to open leaves mirror.value untouched and sets staleness to 'unrefreshable'", async () => {
  const mirror = fakeMirror({ value: 42, staleness: "fresh" });

  await reconcileMirror({ db: null, mirror });

  assert.equal(mirror.value, 42, "mirror.value must be neither zeroed nor treated as current when content.db can't open");
  assert.equal(mirror.staleness, "unrefreshable");
});

test("AC-06 / REQ-05: mirror.staleness === 'unrefreshable' is the signal disclosure surfaces must check before rendering any precise count", async () => {
  const mirror = fakeMirror({ value: 10, staleness: "fresh" });
  await reconcileMirror({ db: null, mirror });

  // This is the observable contract disclosure surfaces (owned by dependent domains) rely on —
  // certifying the signal exists and is set correctly is this package's own scope; the dependent
  // domain's own rendering of "unknown/lower-bound" text is out of scope here (SPEC-017/019).
  assert.equal(mirror.staleness, "unrefreshable");
});

test("EC (§7): mirror never initialized — reconcileMirror still succeeds from a fresh (initial-value) mirror state", async () => {
  const db = openContentDb(":memory:");
  const mirror = fakeMirror({ value: 0, staleness: "fresh" });

  await reconcileMirror({ db, mirror });

  assert.equal(mirror.value, 0);
  assert.equal(mirror.staleness, "fresh");
});
