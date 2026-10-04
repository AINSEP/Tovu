import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { nodeProvisioningFileIo, resolveCommittedConfigRoot } from "../provisioning.node-io.js";

test("nodeProvisioningFileIo reads missing files as null and replaces complete UTF-8 documents", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "tovu-provisioning-io-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "nested", "config.json");
  assert.equal(await nodeProvisioningFileIo.read(path), null);
  const first = '{"site":"café","grants":["publish","read"]}\n';
  await nodeProvisioningFileIo.write(path, first);
  assert.equal(await nodeProvisioningFileIo.read(path), first);
  assert.equal(await readFile(path, "utf8"), first);
  const originalInode = (await stat(path)).ino;

  const replacement = '{"grants":[]}\n';
  await nodeProvisioningFileIo.write(path, replacement);
  assert.equal(await nodeProvisioningFileIo.read(path), replacement);
  assert.equal(await readFile(path, "utf8"), replacement);
  assert.notEqual((await stat(path)).ino, originalInode, "replacement must rename a complete staging file over the target");
  assert.deepEqual(await readdir(dirname(path)), ["config.json"], "successful replacement leaves no staging file");
});

test("nodeProvisioningFileIo propagates non-missing read errors rather than returning missing", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "tovu-provisioning-unreadable-"));
  const path = join(root, "config.json");
  t.after(() => rm(root, { recursive: true, force: true }));
  await nodeProvisioningFileIo.write(path, '{"grants":["publish"]}');
  // A directory cannot be read as a config document, even when the runner is root (chmod-based
  // permission fixtures would silently become readable in that environment).
  await assert.rejects(nodeProvisioningFileIo.read(root), { code: "EISDIR" });
  assert.equal(await nodeProvisioningFileIo.read(path), '{"grants":["publish"]}');
});

/**
 * @file `resolveCommittedConfigRoot` — the absolute base every repo-relative committed-config path
 * (`PUBLISH_TRUST_CONFIG_PATH`, `DEPLOY_CONFIG_CANDIDATE_PATHS`) resolves against. Regression for
 * the 2026-09-19 desktop bug: those paths used to resolve against the bare `process.cwd()`, which
 * is wrong for the desktop shell's own-server mode (see this function's own doc).
 */

test("resolveCommittedConfigRoot prefers TOVU_REPO_ROOT when the caller's env sets it", () => {
  assert.equal(
    resolveCommittedConfigRoot({ TOVU_REPO_ROOT: "/repo/root" }),
    "/repo/root"
  );
});

test("resolveCommittedConfigRoot falls back to process.cwd() when TOVU_REPO_ROOT is unset", () => {
  assert.equal(resolveCommittedConfigRoot({}), process.cwd());
});

test("resolveCommittedConfigRoot falls back to process.cwd() when TOVU_REPO_ROOT is set but empty", () => {
  // An empty string is falsy, same treatment as unset — there is no meaningful "root is nowhere"
  // state for a filesystem base, unlike `PUBLISH_TRUST_ENV_VAR`'s own empty-string kill switch.
  assert.equal(resolveCommittedConfigRoot({ TOVU_REPO_ROOT: "" }), process.cwd());
});

test("resolveCommittedConfigRoot defaults to the real process.env when called with no argument", () => {
  const previous = process.env.TOVU_REPO_ROOT;
  process.env.TOVU_REPO_ROOT = "/from/real/env";
  try {
    assert.equal(resolveCommittedConfigRoot(), "/from/real/env");
  } finally {
    if (previous === undefined) delete process.env.TOVU_REPO_ROOT;
    else process.env.TOVU_REPO_ROOT = previous;
  }
});
