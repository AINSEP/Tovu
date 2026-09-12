import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveDesktopRoots } from "./packaged-paths.js";

const REPO_ROOT = "/Users/someone/Programming/Tovu";
const RESOURCES = "/Applications/Tovu.app/Contents/Resources";
const DOCUMENTS = "/Users/someone/Documents";

function devRoots() {
  return resolveDesktopRoots({ isPackaged: false, resourcesPath: RESOURCES, repoRoot: REPO_ROOT, documentsDir: DOCUMENTS });
}

function packagedRoots() {
  return resolveDesktopRoots({ isPackaged: true, resourcesPath: RESOURCES, repoRoot: REPO_ROOT, documentsDir: DOCUMENTS });
}

test("dev mode reproduces exactly what main.js derived from REPO_ROOT before this module existed", () => {
  const roots = devRoots();
  assert.equal(roots.payloadRoot, REPO_ROOT);
  assert.equal(roots.devFallbackSiteDir, path.join(REPO_ROOT, "sites", "tovu-com"));
  assert.deepEqual(roots.siteScanRoots, [path.join(REPO_ROOT, "sites")]);
  assert.equal(roots.defaultCliMode, "source");
});

test("a packaged app resolves the payload out of Resources/tovu, not out of the .app's Contents", () => {
  assert.equal(packagedRoots().payloadRoot, path.join(RESOURCES, "tovu"));
});

test("the staged payload keeps its repo-relative shape, so one path.join serves both modes", () => {
  // The contract `resolveCliEntry` and `buildServeEnv` depend on: `<root>/package.json`,
  // `<root>/apps/admin/dist` and `<root>/apps/site-chat/dist` are correct joins against EITHER root.
  for (const roots of [devRoots(), packagedRoots()]) {
    assert.equal(path.basename(path.join(roots.payloadRoot, "package.json")), "package.json");
    assert.ok(path.join(roots.payloadRoot, "apps", "admin", "dist").startsWith(roots.payloadRoot));
    assert.ok(path.join(roots.payloadRoot, "apps", "site-chat", "dist").startsWith(roots.payloadRoot));
  }
});

test("a packaged app has no dev fallback site, so that precedence tier is absent rather than broken", () => {
  // `null`, not a non-existent path: `resolveDevFallback` short-circuits on a falsy value and
  // reports `rejected: null` ("nothing to try"), where a bogus path would classify and report a
  // rejection the picker would then explain to a user who has no checkout.
  assert.equal(packagedRoots().devFallbackSiteDir, null);
});

test("a packaged app scans a user-writable root instead of the read-only payload", () => {
  const roots = packagedRoots();
  assert.deepEqual(roots.siteScanRoots, [path.join(DOCUMENTS, "Tovu Sites")]);
  for (const root of roots.siteScanRoots) {
    assert.ok(!root.startsWith(roots.payloadRoot), `${root} must not sit inside the read-only payload`);
  }
});

test("a packaged app defaults to compiled mode, because it ships no TypeScript source and no tsx", () => {
  assert.equal(packagedRoots().defaultCliMode, "compiled");
});

test("resolveDesktopRoots reads no ambient state — same inputs, same answer", () => {
  assert.deepEqual(packagedRoots(), packagedRoots());
  assert.deepEqual(devRoots(), devRoots());
});
