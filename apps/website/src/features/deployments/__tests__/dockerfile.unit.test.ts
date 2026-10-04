import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readDockerfileSource,
  writeDockerfileSource,
  writeDockerfileSourceWithIfMatch,
} from "../dockerfile.js";

/**
 * @file `dockerfile.ts`'s own etag/optimistic-concurrency logic, isolated from the HTTP route and
 * the agent tool (those get their own coverage in `dockerfile-source-route.test.ts` and
 * `tool-registrations.integration.test.ts` respectively) — Terra audit finding C5, 2026-08-15.
 *
 * Each serial test resolves the Dockerfile from a fresh temporary cwd. The checkout is never
 * written, including when a test process is interrupted.
 */

const originalCwd = process.cwd();
let testRoot: string;
beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), "tovu-dockerfile-test-"));
  process.chdir(testRoot);
});
afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testRoot, { recursive: true, force: true });
});

test("readDockerfileSource: etag is a deterministic, content-derived strong validator — same contents, same etag", () => {
  writeDockerfileSource("FROM node:22\n");
  const first = readDockerfileSource();
  const second = readDockerfileSource();
  assert.equal(first.etag, second.etag, "reading the same unchanged contents twice must produce the same etag");
  assert.match(first.etag, /^"[0-9a-f]{64}"$/, "must be a quoted sha256 hex digest, not Express's own auto-generated weak etag shape");
});

test("readDockerfileSource: a real content change produces a different etag", () => {
  writeDockerfileSource("FROM node:22\n");
  const first = readDockerfileSource();
  writeDockerfileSource("FROM node:22\nRUN echo hi\n");
  const second = readDockerfileSource();
  assert.notEqual(first.etag, second.etag);
});

test("readDockerfileSource: the missing-file etag is a fixed sentinel, never shaped like a real hash", () => {
  const missing = readDockerfileSource();
  assert.deepEqual(missing, { exists: false, contents: null, etag: 'W/"missing"' });
  assert.doesNotMatch(missing.etag, /^"[0-9a-f]{64}"$/);
  const result = writeDockerfileSourceWithIfMatch("FROM node:22\n", missing.etag);
  assert.ok(result.ok);
  assert.equal(result.snapshot.contents, "FROM node:22\n");
  assert.match(result.snapshot.etag, /^"[0-9a-f]{64}"$/);
  assert.deepEqual(readDockerfileSource(), result.snapshot);
});

test("writeDockerfileSourceWithIfMatch: succeeds and writes when ifMatch names the CURRENT etag", () => {
  writeDockerfileSource("FROM node:22\n");
  const current = readDockerfileSource();

  const newContents = "FROM node:22\nRUN echo hi\n";
  const result = writeDockerfileSourceWithIfMatch(newContents, current.etag);

  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.snapshot.contents, newContents);
  assert.equal(result.snapshot.exists, true);
  assert.notEqual(result.snapshot.etag, current.etag, "the etag must advance once the contents actually changed");

  // The write really landed on disk, not just in the returned snapshot.
  assert.deepEqual(readDockerfileSource(), result.snapshot);
});

test("writeDockerfileSourceWithIfMatch: a stale ifMatch is refused and the file is left untouched — the actual lost-update reproduction", () => {
  // Writer A reads first.
  writeDockerfileSource("FROM node:22\n");
  const staleIfMatch = readDockerfileSource().etag;

  // Writer B — a real, independent write to the SAME file — lands after Writer A's read.
  const writerBContents = "FROM node:22-slim\n# writer B\n";
  writeDockerfileSource(writerBContents);

  // Writer A now attempts its own write, still carrying the etag from BEFORE writer B's write.
  const writerAAttempt = "FROM node:18\n# writer A, should be rejected\n";
  const result = writeDockerfileSourceWithIfMatch(writerAAttempt, staleIfMatch);

  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.reason, "conflict");
  assert.equal(result.current.contents, writerBContents, "the conflict result must carry what's ACTUALLY on disk");

  // The core property under test: writer A's stale write must never have landed.
  const onDisk = readDockerfileSource();
  assert.equal(onDisk.contents, writerBContents, "a rejected stale write must not overwrite the concurrent writer's real save");
  assert.notEqual(onDisk.contents, writerAAttempt);
});

test("writeDockerfileSourceWithIfMatch: comparing against a CACHED etag instead of a fresh read would wrongly allow the same race back in — this proves the comparison is fresh", () => {
  writeDockerfileSource("FROM node:22\n");
  const cachedFromLongAgo = readDockerfileSource().etag;

  // Time passes; several other writes happen in between (simulating a long-lived caller that read
  // once and held onto the etag) — none of them should matter to THIS call's own freshness check.
  writeDockerfileSource("FROM node:22\nRUN one\n");
  writeDockerfileSource("FROM node:22\nRUN two\n");
  const rightBeforeAttempt = readDockerfileSource();

  // A caller using the STALE, long-held etag must still be refused, proving the comparison target
  // is the file's state at call time, not whatever the caller cached from its own earlier read.
  const result = writeDockerfileSourceWithIfMatch("FROM node:22\nRUN attempted\n", cachedFromLongAgo);
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.current.contents, rightBeforeAttempt.contents);
});

test("writeDockerfileSource (unconditional): stays available for cleanup/restore callers and performs no etag check", () => {
  writeDockerfileSource("FROM node:22\n");
  writeDockerfileSource("FROM node:22\nRUN changed-underneath\n"); // a "concurrent" change
  // Unconditional — no ifMatch parameter exists on this function at all, so there is nothing for a
  // stale caller to get wrong; it always wins, by design, for exactly the restore-in-t.after() use
  // case `dockerfile.ts`'s own file header documents.
  const result = writeDockerfileSource("FROM node:22\nRUN restored\n");
  assert.equal(result.contents, "FROM node:22\nRUN restored\n");
  assert.deepEqual(readDockerfileSource(), result);
});
