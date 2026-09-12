/**
 * @file Regression tests for the staleness predicate behind `stage-payload.mjs`'s shell check.
 *
 * The first test is the one that matters: it reproduces the ACTUAL 2026-09-12 incident — an
 * apps/admin bundle twelve days older than its source, staged and shipped while the package step
 * reported success — and asserts the guard now refuses it. Before `shellStalenessFailure` existed,
 * `stage-payload.mjs` only checked that `index.html` was present, so that exact input passed.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { shellStalenessFailure, MS_PER_DAY } from "./shell-staleness.js";

const ADMIN = {
  relative: "apps/admin/dist",
  marker: "index.html",
  buildWith: "cd apps/admin && npx vite build",
};

const AUG_31 = Date.parse("2026-08-31T12:00:00Z");
const SEP_12 = Date.parse("2026-09-12T12:00:00Z");

test("THE INCIDENT: a twelve-day-stale admin bundle is refused", () => {
  const failure = shellStalenessFailure(AUG_31, SEP_12, ADMIN);

  assert.ok(failure, "this exact input shipped a wrong bundle while the package step said SUCCESS");
  assert.match(failure, /STALE/);
  assert.match(failure, /12\.0 day\(s\) older/);
  assert.match(failure, /apps\/admin\/dist/);
});

test("the failure message names a remedy that WORKS on a linked checkout", () => {
  const failure = shellStalenessFailure(AUG_31, SEP_12, ADMIN);

  assert.match(failure, /cd apps\/admin && npx vite build/);
  // `npm run admin:build` chains through check-no-linked-jini.mjs, which correctly refuses to build
  // while @jini-ai/* is npm-linked. A gate that detects a problem and then sends you down a blocked
  // path is barely better than the silent one it replaces.
  assert.doesNotMatch(failure, /admin:build/, "must not send the reader to the guard-blocked build");
  assert.doesNotMatch(failure, /unlink:jini/, "swapping the tree to published Jini is not the remedy");
});

test("a build NEWER than its source passes", () => {
  assert.equal(shellStalenessFailure(SEP_12, AUG_31, ADMIN), null);
});

test("a build with the same mtime as its source passes — equal is not stale", () => {
  assert.equal(shellStalenessFailure(SEP_12, SEP_12, ADMIN), null);
});

test("one second of staleness is still staleness — there is no tolerance window", () => {
  const failure = shellStalenessFailure(SEP_12 - 1000, SEP_12, ADMIN);
  assert.ok(failure, "a bundle built before the last source edit is wrong regardless of margin");
});

test("a missing build defers to the existence check rather than reporting a confusing age", () => {
  assert.equal(shellStalenessFailure(0, SEP_12, ADMIN), null);
});

test("a source tree that could not be read does not fail the package step", () => {
  assert.equal(shellStalenessFailure(SEP_12, 0, ADMIN), null);
});

test("the reported age is computed in whole days from the millisecond gap", () => {
  const failure = shellStalenessFailure(SEP_12 - 3 * MS_PER_DAY, SEP_12, ADMIN);
  assert.match(failure, /3\.0 day\(s\)/);
});
