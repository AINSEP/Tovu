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
  assert.equal(resolvePathWithin(root, "../../../etc/passwd"), null);
  assert.equal(resolvePathWithin(root, "theme-assets/basic/css/base.css"), path.join(root, "theme-assets/basic/css/base.css"));
});

test("resolvePathWithin: refuses when root is not itself absolute, even for an otherwise-benign segment", () => {
  // path.resolve() anchors a relative root against process.cwd(), diverging from a naive
  // path.join() -- the OTHER escape this function's two guards catch (see its own doc).
  assert.equal(resolvePathWithin("relative-tovu-export-output", "theme-assets/basic/css/base.css"), null);
});
