import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolvePathWithin } from "../../path-containment.js";

/**
 * @file Direct coverage for `resolvePathWithin`'s two escapes — a `../`-laden traversal segment,
 * and a `root` that is not itself absolute. Each refusal is paired with a benign call against the
 * SAME `root`, so a passing test proves the refusal is about the traversal/non-absolute input
 * specifically, not an unrelated misconfiguration of that `root` value.
 */

test("resolvePathWithin: refuses a traversal segment that resolves outside an absolute root, but accepts a benign one under the same root", () => {
  const root = path.join(path.sep, "tovu-export-test-containment");
  assert.equal(resolvePathWithin({ root: root, segment: "../../../etc/passwd" }, {}), null);
  assert.equal(resolvePathWithin({ root: root, segment: "theme-assets/basic/css/base.css" }, {}), path.join(root, "theme-assets/basic/css/base.css"));
});

test("resolvePathWithin: refuses when root is not itself absolute, even for an otherwise-benign segment", () => {
  // path.resolve() anchors a relative root against process.cwd(), diverging from a naive
  // path.join() -- the OTHER escape this function's two guards catch (see its own doc).
  assert.equal(resolvePathWithin({ root: "relative-tovu-export-output", segment: "theme-assets/basic/css/base.css" }, {}), null);
});

test("resolvePathWithin: accepts a benign segment under an absolute root that carries a trailing separator", () => {
  // A naive `root + sep` prefix doubles up when root already ends in sep ("/tmp/export//"),
  // refusing every child even though path.resolve/path.join both agree on the real result.
  const root = path.join(path.sep, "tovu-export-test-containment") + path.sep;
  assert.equal(
    resolvePathWithin({ root: root, segment: "theme-assets/basic/css/base.css" }, {}),
    path.join(path.sep, "tovu-export-test-containment", "theme-assets/basic/css/base.css"),
  );
});

test("resolvePathWithin: root '/' accepts a benign child instead of refusing everything", () => {
  // Same doubled-prefix bug at its most extreme: root + sep for root "/" becomes "//".
  assert.equal(resolvePathWithin({ root: path.sep, segment: "theme-assets/basic.css" }, {}), path.join(path.sep, "theme-assets/basic.css"));
});

test("resolvePathWithin: still refuses a traversal payload under a trailing-separator root", () => {
  // Proves the trailing-separator fix didn't also loosen the traversal guard: this must stay null.
  const root = path.join(path.sep, "tovu-export-test-containment") + path.sep;
  assert.equal(resolvePathWithin({ root: root, segment: "../../../etc/passwd" }, {}), null);
});

test("resolvePathWithin: refuses a sibling whose name shares the root prefix", () => {
  const root = path.join(path.sep, "a", "export");
  assert.equal(resolvePathWithin({ root: root, segment: "../export-evil/x" }, {}), null);
  assert.equal(resolvePathWithin({ root: root + path.sep, segment: "../export-evil/x" }, {}), null);
  assert.equal(resolvePathWithin({ root: root, segment: "x" }, {}), path.join(root, "x"));
});

test("resolvePathWithin: refuses absolute segments and paths resolving to the root itself", () => {
  const root = path.join(path.sep, "a", "export");
  for (const segment of [path.join(root, "x"), path.join(path.sep, "etc", "passwd"), "..", ".", "child/..", ""]) {
    assert.equal(resolvePathWithin({ root: root, segment: segment }, {}), null, segment);
  }
});
