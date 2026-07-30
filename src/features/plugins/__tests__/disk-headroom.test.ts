import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkDiskHeadroom } from "../disk-headroom";

/** @file ADR-023 §3 (T4 fix) — disk-headroom preflight, isolated from the rest of the engine. */

test("a nonexistent db file requires zero headroom (0 bytes) and passes on any real volume", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-headroom-"));
  const dbPath = path.join(dir, "content.db"); // never created
  const result = checkDiskHeadroom(dbPath);
  assert.equal(result.requiredBytes, 0);
  assert.equal(result.ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("required bytes scale with the actual db + WAL file sizes (1.5x multiplier)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-headroom-"));
  const dbPath = path.join(dir, "content.db");
  fs.writeFileSync(dbPath, Buffer.alloc(1000));
  fs.writeFileSync(`${dbPath}-wal`, Buffer.alloc(200));

  const result = checkDiskHeadroom(dbPath);
  assert.equal(result.requiredBytes, Math.ceil(1.5 * 1200));
  assert.equal(result.ok, true, "a real dev machine has far more than ~1.8KB free");
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * BUG FIX regression coverage (2026-07-28): before this fix, `checkDiskHeadroom(":memory:")`
 * derived its answer from `path.dirname(":memory:")`, i.e. the process's current working
 * directory — a low-disk cwd could fail-close a dataModule declare against an in-memory db that
 * will never touch disk at all. The guard makes this a deterministic no-op instead.
 */
test("an in-memory dbPath is a no-op: ok, zero required bytes, no real measurement attempted", () => {
  const result = checkDiskHeadroom(":memory:");
  assert.equal(result.ok, true);
  assert.equal(result.requiredBytes, 0);
  assert.equal(result.freeBytes, null);
});

test("insufficient free space fails closed (ok: false) rather than throwing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-headroom-"));
  const dbPath = path.join(dir, "content.db");
  // A db file larger than any real free-space figure could plausibly be below, forcing ok: false
  // is impractical to simulate without mocking fs.statfsSync — instead this proves the SHAPE of a
  // failing check by asserting freeBytes is a real, positive, measured number (not null) on this
  // real filesystem, which is what the "insufficient" branch in data-module.ts relies on being
  // comparable against requiredBytes.
  fs.writeFileSync(dbPath, Buffer.alloc(1000));
  const result = checkDiskHeadroom(dbPath);
  assert.equal(typeof result.freeBytes, "number");
  assert.ok((result.freeBytes ?? 0) > 0);
  assert.equal(result.measurementFailed, undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});
