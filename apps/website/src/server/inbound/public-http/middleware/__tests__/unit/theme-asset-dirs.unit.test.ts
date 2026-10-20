import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";

import { resolveThemeDirs } from "../../theme-asset-dirs.js";

/**
 * @file Direct coverage for `resolveThemeDirs`' refusals that Express routing never lets an HTTP
 * request reach (an empty or missing `:themeId`), plus its ordering contract. The HTTP-level
 * behaviour is pinned in `../integration/theme-static-assets.integration.test.ts`.
 */

/** A temp root holding one empty folder per name, removed after the test. */
function makeRoot(t: TestContext, folders: readonly string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), "theme-asset-dirs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const folder of folders) mkdirSync(path.join(root, folder), { recursive: true });
  return root;
}

test("resolveThemeDirs: an empty theme id never resolves to the root itself", (t) => {
  const root = makeRoot(t, []);
  assert.deepEqual(resolveThemeDirs({ roots: [root], themeId: "" }, {}), []);
});

test("resolveThemeDirs: a missing theme id is treated as empty and refused", (t) => {
  const root = makeRoot(t, []);
  assert.deepEqual(resolveThemeDirs({ roots: [root], themeId: undefined }, {}), []);
});

test("resolveThemeDirs: a __-prefixed folder (the originals catalog) is refused even when it exists", (t) => {
  const root = makeRoot(t, ["__original-themes__"]);
  assert.deepEqual(resolveThemeDirs({ roots: [root], themeId: "__original-themes__" }, {}), []);
});

test("resolveThemeDirs: a dot-prefixed folder is refused even when it exists", (t) => {
  const root = makeRoot(t, [".git"]);
  assert.deepEqual(resolveThemeDirs({ roots: [root], themeId: ".git" }, {}), []);
});

test("resolveThemeDirs: a traversal id that lands on a real sibling folder is refused", (t) => {
  const parent = makeRoot(t, ["root/real", "outside"]);
  assert.deepEqual(resolveThemeDirs({ roots: [path.join(parent, "root")], themeId: "real/../../outside" }, {}), []);
});

test("resolveThemeDirs: the first root holding the id wins", (t) => {
  const first = makeRoot(t, ["same"]);
  const second = makeRoot(t, ["same"]);
  assert.deepEqual(resolveThemeDirs({ roots: [first, second], themeId: "same" }, {}), [path.join(first, "same")]);
});

test("resolveThemeDirs: a renamed theme lists the current folder before the retired one, from any root", (t) => {
  const first = makeRoot(t, ["basic"]);
  const second = makeRoot(t, ["tovu-theme"]);
  assert.deepEqual(resolveThemeDirs({ roots: [first, second], themeId: "basic" }, {}), [
    path.join(second, "tovu-theme"),
    path.join(first, "basic"),
  ]);
});

test("resolveThemeDirs: an id absent from every root resolves to nothing", (t) => {
  const root = makeRoot(t, ["other"]);
  assert.deepEqual(resolveThemeDirs({ roots: [root], themeId: "missing" }, {}), []);
});
