import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveAppDistDir, resolveCheckoutRoot, resolveProductRoot } from "../../product-root.js";

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

/**
 * `resolveAppDistDir` — the admin/site-chat SPA counterpart. `app.ts` used a fixed six-`../` count
 * that was right for `apps/website/src/server/runtime/composition` and one level too far for the
 * compiled `dist/src/server/runtime/composition`, so `npm start` served "Admin shell not built" (503)
 * at /admin even with `apps/admin/dist` built. The product root does not help here: in the compiled
 * tree it is `dist/`, which has no `apps/`.
 */
function makeCheckout() {
  const root = mkdtempSync(path.join(os.tmpdir(), "app-dist-test-"));
  mkdirSync(path.join(root, "apps", "admin"), { recursive: true });
  mkdirSync(path.join(root, "apps", "site-chat"), { recursive: true });
  return root;
}

test("resolveAppDistDir finds apps/<app>/dist from BOTH the source and the compiled composition dirs", () => {
  const root = makeCheckout();
  try {
    const sourceDir = path.join(root, "apps", "website", "src", "server", "runtime", "composition");
    const distDir = path.join(root, "dist", "src", "server", "runtime", "composition");
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(distDir, { recursive: true });
    assert.equal(resolveAppDistDir("admin", sourceDir), path.join(root, "apps", "admin", "dist"));
    assert.equal(resolveAppDistDir("admin", distDir), path.join(root, "apps", "admin", "dist"));
    assert.equal(resolveAppDistDir("site-chat", distDir), path.join(root, "apps", "site-chat", "dist"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveAppDistDir does not need the dist folder to exist yet (an unbuilt app still resolves, so /admin can say 'not built')", () => {
  const root = makeCheckout();
  try {
    const distDir = path.join(root, "dist", "src", "server", "runtime", "composition");
    mkdirSync(distDir, { recursive: true });
    assert.equal(resolveAppDistDir("admin", distDir), path.join(root, "apps", "admin", "dist"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveAppDistDir never throws: with no apps/<app> ancestor it returns a path under fromDir that does not exist", () => {
  const orphan = mkdtempSync(path.join(os.tmpdir(), "app-dist-orphan-"));
  try {
    const deep = path.join(orphan, "a", "b");
    mkdirSync(deep, { recursive: true });
    assert.equal(resolveAppDistDir("admin", deep), path.join(deep, "apps", "admin", "dist"));
  } finally {
    rmSync(orphan, { recursive: true, force: true });
  }
});

test("resolveAppDistDir(), called with no fromDir from a real file inside apps/website/src, finds this checkout's apps/admin/dist", () => {
  assert.equal(resolveAppDistDir("admin"), path.join(resolveProductRoot(), "apps", "admin", "dist"));
});

// `index.ts`, `deps.ts` and `app.ts` each looked for the repo-root `.certs/` pair with a fixed `../`
// count sized for the tsx source tree. The compiled tree is two levels shallower (`dist/src/...`), so
// every compiled boot (`npm start`) looked one directory ABOVE the checkout, found no certs, and
// silently served plain HTTP.
test("resolveCheckoutRoot finds the checkout from BOTH the source and the compiled entry/composition dirs", () => {
  const root = makeCheckout();
  try {
    mkdirSync(path.join(root, "apps", "website", "src", "server", "runtime", "composition"), { recursive: true });
    mkdirSync(path.join(root, "dist", "src", "server", "runtime", "composition"), { recursive: true });
    for (const dir of [
      path.join(root, "apps", "website", "src"),
      path.join(root, "apps", "website", "src", "server", "runtime", "composition"),
      path.join(root, "dist", "src"),
      path.join(root, "dist", "src", "server", "runtime", "composition"),
    ]) {
      assert.equal(resolveCheckoutRoot(dir), root, dir);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveCheckoutRoot never throws: with no apps/website ancestor it returns fromDir itself", () => {
  const orphan = mkdtempSync(path.join(os.tmpdir(), "checkout-orphan-"));
  try {
    const deep = path.join(orphan, "a", "b");
    mkdirSync(deep, { recursive: true });
    assert.equal(resolveCheckoutRoot(deep), deep);
  } finally {
    rmSync(orphan, { recursive: true, force: true });
  }
});

test("resolveCheckoutRoot(), called with no fromDir from a real file inside apps/website/src, finds this checkout", () => {
  assert.equal(resolveCheckoutRoot(), resolveProductRoot());
});
