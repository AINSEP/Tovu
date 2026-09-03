import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveProductRoot } from "../../product-root.js";

/**
 * @file Regression coverage for the two path-offset bugs found in `read-template.ts`'s
 * `TEMPLATES_ROOT` and `deps.ts`'s `builtInThemesDir`/`bundledAgentPluginsDir`: each hardcoded a
 * `../` count that was only ever correct in ONE of the source/compiled trees at a time after the
 * 2026-08-28 `apps/website/` rename (`tovu init` broke: "template starter is missing or corrupt";
 * built-in theme/agent-plugin seeding would have resolved outside the repo entirely). See
 * `product-root.ts`'s header for the full mechanism this replaces.
 */

function makeFixtureRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), "product-root-test-"));
  writeFileSync(path.join(root, "package.json"), "{}");
  mkdirSync(path.join(root, "content"));
  return root;
}

test("resolveProductRoot finds an ancestor several levels up that has both package.json and content/", () => {
  const root = makeFixtureRoot();
  try {
    const deep = path.join(root, "apps", "website", "src", "platform", "site-dir");
    mkdirSync(deep, { recursive: true });
    assert.equal(resolveProductRoot(deep), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveProductRoot resolves correctly from two DIFFERENT depths (the exact source-vs-dist asymmetry that caused the original bug)", () => {
  const root = makeFixtureRoot();
  try {
    // Simulates the source tree: apps/website/src/platform/site-dir/ -- 5 levels below root.
    const sourceDir = path.join(root, "apps", "website", "src", "platform", "site-dir");
    mkdirSync(sourceDir, { recursive: true });
    // Simulates the compiled tree: dist/src/platform/site-dir/ -- 3 levels below its own root
    // (a SEPARATE fixture root, mirroring how dist/ has its own package.json+content/).
    const distRoot = makeFixtureRoot();
    const distDir = path.join(distRoot, "src", "platform", "site-dir");
    mkdirSync(distDir, { recursive: true });
    try {
      // A single fixed `../` count cannot pass both of these -- that asymmetry IS the bug.
      assert.equal(resolveProductRoot(sourceDir), root);
      assert.equal(resolveProductRoot(distDir), distRoot);
    } finally {
      rmSync(distRoot, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveProductRoot returns fromDir itself when it already has both package.json and content/", () => {
  const root = makeFixtureRoot();
  try {
    assert.equal(resolveProductRoot(root), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveProductRoot does NOT stop at an ancestor with only ONE of the two markers", () => {
  const root = makeFixtureRoot();
  try {
    // An intermediate dir with just a package.json (no content/) must not false-positive --
    // this is exactly what would happen if some app under apps/* ever grows its own package.json.
    const decoy = path.join(root, "apps", "decoy");
    mkdirSync(decoy, { recursive: true });
    writeFileSync(path.join(decoy, "package.json"), "{}");
    const deep = path.join(decoy, "src");
    mkdirSync(deep);
    assert.equal(resolveProductRoot(deep), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveProductRoot throws a clear error when no ancestor has both markers", () => {
  const orphan = mkdtempSync(path.join(os.tmpdir(), "product-root-orphan-"));
  try {
    const deep = path.join(orphan, "a", "b", "c");
    mkdirSync(deep, { recursive: true });
    assert.throws(() => resolveProductRoot(deep), /no ancestor of/);
  } finally {
    rmSync(orphan, { recursive: true, force: true });
  }
});

test("resolveProductRoot(), called with no argument from a real file inside apps/website/src, finds the actual repo root", () => {
  // Regression-proves the default-argument path (the one every real call site uses), not just the
  // injectable-fromDir path the tests above exercise for isolation. Asserts on the package name
  // rather than the checkout's folder name, which isn't guaranteed to be "Tovu" on every machine.
  const repoRoot = resolveProductRoot();
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(pkg.name, "tovu");
});
