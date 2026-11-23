import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { jiniDepsFingerprint, prepareAdminDepsCache, startAdminVite } from "../dev.mjs";

/**
 * @file A382: Vite keys its prebundled `.vite/deps` on the lockfile, but the admin's `@jini-ai/*`
 * deps are `file:` links into a sibling checkout, so installing or rebuilding a newer
 * `@jini-ai/chat` leaves the lockfile untouched and Vite keeps serving the old prebundle. `dev.mjs`
 * fingerprints the linked packages and forces one re-optimize whenever that fingerprint moves.
 */

function fixtureAdmin() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-admin-deps-"));
  const jiniChat = path.join(root, "Jini", "packages", "chat");
  fs.mkdirSync(path.join(jiniChat, "dist", "react"), { recursive: true });
  fs.writeFileSync(path.join(jiniChat, "package.json"), JSON.stringify({ name: "@jini-ai/chat", version: "0.7.3" }));
  fs.writeFileSync(path.join(jiniChat, "dist", "react", "index.js"), "export const v = 1;\n");
  const adminDir = path.join(root, "apps", "admin");
  fs.mkdirSync(path.join(adminDir, "node_modules", "@jini-ai"), { recursive: true });
  fs.symlinkSync(jiniChat, path.join(adminDir, "node_modules", "@jini-ai", "chat"));
  return { root, adminDir, jiniChat };
}

test("the fingerprint moves when a linked @jini-ai package is rebuilt or re-versioned", () => {
  const { root, adminDir, jiniChat } = fixtureAdmin();
  try {
    const nodeModulesDir = path.join(adminDir, "node_modules");
    const before = jiniDepsFingerprint({ nodeModulesDir });
    assert.equal(jiniDepsFingerprint({ nodeModulesDir }), before, "an unchanged tree keeps its fingerprint");
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(jiniChat, "dist", "react", "index.js"), later, later);
    const rebuilt = jiniDepsFingerprint({ nodeModulesDir });
    assert.notEqual(rebuilt, before, "a nested dist file rewritten by a rebuild changes it");
    fs.writeFileSync(path.join(jiniChat, "package.json"), JSON.stringify({ name: "@jini-ai/chat", version: "0.7.4" }));
    assert.notEqual(jiniDepsFingerprint({ nodeModulesDir }), rebuilt, "a version bump changes it");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a changed @jini-ai tree forces exactly one Vite re-optimize, then the stamp holds", () => {
  const { root, adminDir, jiniChat } = fixtureAdmin();
  try {
    assert.deepEqual(prepareAdminDepsCache({ adminDir }), { force: true }, "no stamp yet: the cache cannot be trusted");
    assert.deepEqual(prepareAdminDepsCache({ adminDir }), { force: false }, "same tree: keep the warm cache");
    fs.writeFileSync(path.join(jiniChat, "package.json"), JSON.stringify({ name: "@jini-ai/chat", version: "0.8.0" }));
    assert.deepEqual(prepareAdminDepsCache({ adminDir }), { force: true }, "an installed newer @jini-ai/chat forces");
    assert.deepEqual(prepareAdminDepsCache({ adminDir }), { force: false });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("an admin without any @jini-ai deps stamps once, then keeps its cache", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-admin-deps-"));
  try {
    assert.deepEqual(prepareAdminDepsCache({ adminDir: root }), { force: true });
    assert.deepEqual(prepareAdminDepsCache({ adminDir: root }), { force: false });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("startAdminVite passes --force to Vite only when the deps cache is stale", () => {
  for (const force of [true, false]) {
    const calls = [];
    startAdminVite({ apiPort: 3301, vitePort: 5274, apiScheme: "http" }, {
      startChild: (...args) => calls.push(args), prepareDepsCache: () => ({ force }),
    });
    assert.deepEqual(calls[0][2], ["--prefix", "apps/admin", "run", "dev", ...(force ? ["--", "--force"] : [])]);
  }
});
