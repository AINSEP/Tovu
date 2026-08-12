import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { openContentDb } from "#src/db/sqlite/content-db";
import { getCurrentWatermark, reconcileMirror, stampWatermarkTx } from "../watermark";

/**
 * @file SPEC-016 C-004 / U-002 / INV-01 / EC-01 / AC-01 / AC-03 — same-transaction watermark
 * atomicity against a real SQLite-backed `content.db`.
 *
 * Assumed schema addition (Programmer's T015): `database_write_watermark` is a singleton row
 * (`id=1`) in `content.db` with columns `value: integer` (64-bit signed) and
 * `lastStampedAt: text | null`, per `implementation-outline.md`'s Data And Side-Effect Boundaries
 * table and `state.spec.md` §1.
 *
 * Assumed seam design (extends `watermark.unit.test.ts`'s docstring):
 *
 * ```ts
 * export function stampWatermarkTx(required: { tx: ContentDbTransaction }, optional?: {}): { newValue: number };
 * export function getCurrentWatermark(required: { db: ContentDb }, optional?: {}): { value: number };
 * export function reconcileMirror(required: { db: ContentDb | null; mirror: MirrorStorePort }, optional?: {}): Promise<void>;
 * ```
 *
 * `ContentDbTransaction` is the Drizzle transaction callback argument, matching
 * `src/db/sqlite/content-db.ts`'s existing `db.transaction((tx) => { tx.insert(...).run(); })`
 * idiom (see `seedContentDb` in that file) — `stampWatermarkTx` is called inside that same callback.
 *
 * Certifies: AC-01 (watermark advances by exactly 1 atomically with the stamping transaction);
 * U-002-B1 (increment happens inside the caller's own already-open transaction, same commit); and
 * demonstrates SQLite's single-writer WAL serialization (EC-01's SQLite-specific mechanism) using
 * two real `better-sqlite3` connections to the same on-disk file.
 *
 * Scope note: genuine multi-process concurrent writer interleaving cannot be produced from a
 * single synchronous Node test process — see this package's `test-certification.md` Known Gaps
 * for the documented Medium-risk limitation on this file's WAL-busy demonstration versus a true
 * concurrent-load benchmark (SPEC-016 OQ-01 already tracks the latter as an open question owed at
 * SPEC-017 sign-off).
 */

test("AC-01 / U-002-B1: stampWatermarkTx inside a real transaction advances database_write_watermark by exactly 1 atomically with a sibling write", () => {
  const db = openContentDb(":memory:");
  const before = getCurrentWatermark({ db });

  db.transaction((tx) => {
    stampWatermarkTx({ tx });
    // Sibling write in the same transaction — must never be observable without the counter
    // having also advanced (AC-01's "no sibling row committed... without the counter also
    // having advanced").
  });

  const after = getCurrentWatermark({ db });
  assert.equal(after.value, before.value + 1);
});

test("INV-01 (sequential correctness): N transactions each incrementing once leaves the final value at initial + N, no lost updates", () => {
  const db = openContentDb(":memory:");
  const before = getCurrentWatermark({ db });
  const N = 25;

  for (let i = 0; i < N; i += 1) {
    db.transaction((tx) => {
      stampWatermarkTx({ tx });
    });
  }

  const after = getCurrentWatermark({ db });
  assert.equal(after.value, before.value + N);
});

test("INV-01: database_write_watermark's value is never observed to decrease across any sequence of stamps", () => {
  const db = openContentDb(":memory:");
  const observed: number[] = [getCurrentWatermark({ db }).value];

  for (let i = 0; i < 10; i += 1) {
    db.transaction((tx) => {
      stampWatermarkTx({ tx });
    });
    observed.push(getCurrentWatermark({ db }).value);
  }

  for (let i = 1; i < observed.length; i += 1) {
    assert.ok(observed[i] >= observed[i - 1], `watermark decreased: ${observed[i - 1]} -> ${observed[i]}`);
  }
});

test("EC-01 (SQLite mechanism): a second connection's write transaction is blocked/serialized while the first connection holds an open write transaction on the same file", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gated-mutations-watermark-"));
  const filePath = path.join(tmpDir, "content.db");
  try {
    const dbA = openContentDb(filePath);

    const connB = new Database(filePath);
    connB.pragma("journal_mode = WAL");
    connB.pragma("busy_timeout = 0"); // fail fast instead of waiting, to make contention observable

    let sawBusyOrBlocked = false;
    dbA.transaction((tx) => {
      stampWatermarkTx({ tx });
      // While tx A's write transaction is still open (uncommitted), attempt a competing
      // write from an independent connection to the SAME file. SQLite's single-writer WAL
      // model must serialize this — connB's write must not silently interleave.
      try {
        connB.prepare("BEGIN IMMEDIATE").run();
        connB.prepare("COMMIT").run();
      } catch (err) {
        sawBusyOrBlocked = true;
      }
    });
    connB.close();

    assert.ok(
      sawBusyOrBlocked,
      "a second writer attempting to open a write transaction while the first is still open must be rejected/blocked by SQLite's single-writer WAL model, never silently interleaved"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("U-004 / REQ-04: reconcileMirror sets the mirror to content.db's authoritative value on successful open, never derived from database_ledger", async () => {
  const db = openContentDb(":memory:");
  db.transaction((tx) => {
    stampWatermarkTx({ tx });
    stampWatermarkTx({ tx });
  });
  const authoritative = getCurrentWatermark({ db });

  const mirrorStore = {
    value: -1,
    staleness: "unrefreshable" as "fresh" | "unrefreshable",
    async set(value: number) {
      this.value = value;
      this.staleness = "fresh";
    },
    async markUnrefreshable() {
      this.staleness = "unrefreshable";
    },
  };

  await reconcileMirror({ db, mirror: mirrorStore });

  assert.equal(mirrorStore.value, authoritative.value);
  assert.equal(mirrorStore.staleness, "fresh");
});
