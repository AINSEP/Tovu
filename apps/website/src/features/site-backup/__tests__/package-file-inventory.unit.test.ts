/**
 * The bundled package inventory is built only when a share actually holds a package-shaped path, and
 * then once per unchanged bundled source root: every export and import used to repack and rehash
 * every bundled plugin even for a share with no installed packages.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createPackageInventoryCache, packageFilesForPaths, readBundledPackageFiles, type PackageInventoryCache } from "../package-file-inventory.js";

const PACKAGE_PATH = `agent-plugins/ws/w/p/package/sha256/${"a".repeat(64)}/plugin.json`;

async function sourceRoot(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "package-inventory-cache-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "p"));
  await writeFile(join(root, "p", "plugin.json"), '{"name":"p"}');
  return root;
}

/** A memo that counts every lookup and store, over a real single-slot cache. */
function countingCache(): PackageInventoryCache & { gets: number; sets: number } {
  const inner = createPackageInventoryCache();
  const counted = {
    gets: 0,
    sets: 0,
    get: (required: { key: string }) => { counted.gets++; return inner.get(required); },
    set: (required: Parameters<PackageInventoryCache["set"]>[0]) => { counted.sets++; inner.set(required); },
    delete: (required: { key: string }) => inner.delete(required),
  };
  return counted;
}

test("an unchanged bundled source root is packed once and then served from the memo", async t => {
  const root = await sourceRoot(t);
  const cache = countingCache();
  const first = await readBundledPackageFiles({}, { sourceRoot: root, cache });
  const second = await readBundledPackageFiles({}, { sourceRoot: root, cache });
  assert.equal(first.size, 1);
  assert.equal(second, first);
  assert.equal(cache.sets, 1);
});

test("a source root whose stamp changed is packed again", async t => {
  const root = await sourceRoot(t);
  const cache = createPackageInventoryCache();
  const first = await readBundledPackageFiles({}, { sourceRoot: root, cache });
  await writeFile(join(root, "q-not-a-folder.md"), "x");
  await utimes(root, new Date("2030-01-01T00:00:00Z"), new Date("2030-01-01T00:00:00Z"));
  const second = await readBundledPackageFiles({}, { sourceRoot: root, cache });
  assert.notEqual(second, first);
  assert.deepEqual([...second.keys()], [...first.keys()]);
});

test("a missing source root verifies nothing and is never memoized", async t => {
  const root = await sourceRoot(t);
  const cache = countingCache();
  assert.equal((await readBundledPackageFiles({}, { sourceRoot: join(root, "missing"), cache })).size, 0);
  assert.equal(cache.gets + cache.sets, 0);
});

test("share paths with no package-shaped path never build or consult the inventory", async t => {
  const root = await sourceRoot(t);
  const cache = countingCache();
  const inventory = await packageFilesForPaths({ paths: ["themes/static/a.html", "database/content.db", "agent-plugins/ws/w/activations.json"] }, { sourceRoot: root, cache });
  assert.equal(inventory.size, 0);
  assert.equal(cache.gets + cache.sets, 0);
});

test("one package-shaped path builds the inventory", async t => {
  const root = await sourceRoot(t);
  const cache = countingCache();
  const inventory = await packageFilesForPaths({ paths: ["themes/a.html", PACKAGE_PATH.toUpperCase()] }, { sourceRoot: root, cache });
  assert.equal(inventory.size, 1);
  assert.equal(cache.sets, 1);
});

test("a caller's own inventory is used as given, without touching the bundled sources", async t => {
  const root = await sourceRoot(t);
  const cache = countingCache();
  const given = new Map();
  assert.equal(await packageFilesForPaths({ paths: [PACKAGE_PATH] }, { packageFiles: given, sourceRoot: root, cache }), given);
  assert.equal(cache.gets + cache.sets, 0);
});

test("an already-aborted export refuses before building anything", async t => {
  const root = await sourceRoot(t);
  const cache = countingCache();
  const controller = new AbortController();
  const reason = new Error("cancelled");
  controller.abort(reason);
  await assert.rejects(packageFilesForPaths({ paths: [PACKAGE_PATH] }, { sourceRoot: root, cache, signal: controller.signal }), error => error === reason);
  assert.equal(cache.gets + cache.sets, 0);
});

test("an export cancelled while the inventory builds stops waiting, and the memo still finishes for the next one", async t => {
  const root = await sourceRoot(t);
  const cache = createPackageInventoryCache();
  const controller = new AbortController();
  const reason = new Error("cancelled");
  const cancelled = readBundledPackageFiles({}, { sourceRoot: root, cache, signal: controller.signal });
  controller.abort(reason);
  await assert.rejects(cancelled, error => error === reason);
  const next = await readBundledPackageFiles({}, { sourceRoot: root, cache });
  assert.equal(next.size, 1);
  assert.equal(await readBundledPackageFiles({}, { sourceRoot: root, cache }), next);
});
