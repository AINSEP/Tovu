import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { removeFixtureTree } from "../helpers/remove-fixture-tree.js";

/**
 * @file `removeFixtureTree` must remove a fixture whose served site wrote a read-only subtree.
 *
 * The agent-plugin package store (`agent-plugins/…/packages/sha256/<digest>`) is written read-only
 * on purpose — immutability — so a plain recursive rm hits `EACCES` inside it and, before this fix,
 * the helper reported "a spawned process is still writing there" and leaked the temp dir.
 */

/** Builds `<root>/site/packages/sha256/<digest>/{file, nested/file}` with every dir and file read-only. */
function buildReadOnlyPackageStore(root: string): string {
  const digest = path.join(root, "site", "packages", "sha256", "abc123");
  fs.mkdirSync(path.join(digest, "nested"), { recursive: true });
  fs.writeFileSync(path.join(digest, "manifest.json"), "{}");
  fs.writeFileSync(path.join(digest, "nested", "index.js"), "");
  fs.chmodSync(path.join(digest, "nested", "index.js"), 0o444);
  fs.chmodSync(path.join(digest, "manifest.json"), 0o444);
  fs.chmodSync(path.join(digest, "nested"), 0o555);
  fs.chmodSync(digest, 0o555);
  fs.chmodSync(path.dirname(digest), 0o555);
  return digest;
}

test("removes a fixture tree containing read-only nested directories", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "remove-fixture-tree-"));
  buildReadOnlyPackageStore(root);
  const stderrWrites: string[] = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrWrites.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    removeFixtureTree(root);
  } finally {
    process.stderr.write = originalWrite;
    if (fs.existsSync(root)) {
      fs.chmodSync(path.join(root, "site", "packages", "sha256"), 0o755);
      fs.chmodSync(path.join(root, "site", "packages", "sha256", "abc123"), 0o755);
      fs.chmodSync(path.join(root, "site", "packages", "sha256", "abc123", "nested"), 0o755);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  assert.deepEqual(stderrWrites, []);
  assert.equal(fs.existsSync(root), false);
});

test("a missing fixture tree is a no-op", () => {
  const root = path.join(os.tmpdir(), `remove-fixture-tree-missing-${process.pid}-${Date.now()}`);
  removeFixtureTree(root);
  assert.equal(fs.existsSync(root), false);
});
