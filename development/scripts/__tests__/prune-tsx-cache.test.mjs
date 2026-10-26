import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pruneTsxCache } from "../prune-tsx-cache.mjs";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const HOUR = 60 * 60 * 1000;

async function fixture({ t }, options = {}) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tovu-tsx-prune-"));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));
  const directory = path.join(tmpDir, "tsx-4242");
  await fs.mkdir(directory);
  const warnings = [];
  return { directory, warnings, options: {
    tmpDir, getuid: () => 4242, now: () => NOW, warn: line => warnings.push(line), ...options,
  } };
}

async function writeEntry({ directory, name, ageHours }, _options = {}) {
  const file = path.join(directory, name);
  await fs.writeFile(file, "cached transpilation");
  const modified = new Date(NOW - ageHours * HOUR);
  await fs.utimes(file, modified, modified);
  return file;
}

test("removes files older than two days while retaining pipes, non-files and recent entries", async t => {
  const { directory, options, warnings } = await fixture({ t });
  for (const [name, ageHours] of [["old", 49], ["boundary", 48], ["warm", 2],
    ["recent", 0.5], ["hour-boundary", 1], ["future", -1], ["live.pipe", 72], ["OTHER.PIPE", 72]]) {
    await writeEntry({ directory, name, ageHours });
  }
  const nested = path.join(directory, "subdirectory");
  await fs.mkdir(nested);
  await writeEntry({ directory: nested, name: "old-nested-file", ageHours: 72 });
  await pruneTsxCache({ env: {} }, options);
  assert.deepEqual((await fs.readdir(directory)).sort(),
    ["OTHER.PIPE", "boundary", "future", "hour-boundary", "live.pipe", "recent", "subdirectory", "warm"]);
  assert.equal(await fs.readFile(path.join(nested, "old-nested-file"), "utf8"), "cached transpilation");
  assert.deepEqual(warnings, []);
});

test("caps entries by modification time rather than filename and counts protected entries", async t => {
  const { directory, options } = await fixture({ t }, { maxEntries: 3 });
  for (const [name, ageHours] of [["z-oldest", 8], ["a-newest", 2], ["m-middle", 4],
    ["live.pipe", 72], ["recent", 0.5]]) {
    await writeEntry({ directory, name, ageHours });
  }
  await pruneTsxCache({ env: {} }, options);
  assert.deepEqual((await fs.readdir(directory)).sort(), ["a-newest", "live.pipe", "recent"]);
});

test("the cap never overrides the last-hour or pipe protections", async t => {
  const { directory, options } = await fixture({ t }, { maxEntries: 1 });
  for (const [name, ageHours] of [["recent-a", 0.1], ["recent-b", 0.5], ["live.pipe", 72]]) {
    await writeEntry({ directory, name, ageHours });
  }
  await pruneTsxCache({ env: {} }, options);
  assert.deepEqual((await fs.readdir(directory)).sort(), ["live.pipe", "recent-a", "recent-b"]);
});

test("the opt-out performs no filesystem work", async t => {
  const { directory, options, warnings } = await fixture({ t });
  await writeEntry({ directory, name: "old", ageHours: 72 });
  let reads = 0;
  await pruneTsxCache({ env: { TOVU_TSX_CACHE_PRUNE: "0" } }, { ...options,
    filesystem: { readdir: async () => { reads++; throw new Error("unexpected read"); } },
  });
  assert.equal(reads, 0);
  assert.deepEqual(await fs.readdir(directory), ["old"]);
  assert.deepEqual(warnings, []);
});

test("without a uid, discovers tsx-* directories and leaves other temp directories alone", async t => {
  const { directory, options } = await fixture({ t }, { getuid: () => undefined });
  for (const name of ["tsx-alpha", "tsx-beta", "unrelated"]) {
    const target = path.join(options.tmpDir, name);
    await fs.mkdir(target);
    await writeEntry({ directory: target, name: "old", ageHours: 72 });
  }
  await writeEntry({ directory, name: "old", ageHours: 72 });
  await writeEntry({ directory: options.tmpDir, name: "tsx-file", ageHours: 72 });
  await pruneTsxCache({ env: {} }, options);
  for (const name of ["tsx-4242", "tsx-alpha", "tsx-beta"]) {
    assert.deepEqual(await fs.readdir(path.join(options.tmpDir, name)), []);
  }
  assert.deepEqual(await fs.readdir(path.join(options.tmpDir, "unrelated")), ["old"]);
  assert.equal((await fs.stat(path.join(options.tmpDir, "tsx-file"))).isFile(), true);
});

test("a known uid limits pruning to that user's cache", async t => {
  const { directory, options } = await fixture({ t });
  const other = path.join(options.tmpDir, "tsx-9999");
  await fs.mkdir(other);
  await writeEntry({ directory: other, name: "old", ageHours: 72 });
  await writeEntry({ directory, name: "old", ageHours: 72 });
  await pruneTsxCache({ env: {} }, options);
  assert.deepEqual(await fs.readdir(directory), []);
  assert.deepEqual(await fs.readdir(other), ["old"]);
});

test("a missing cache is a silent no-op", async t => {
  const { directory, options, warnings } = await fixture({ t });
  await fs.rmdir(directory);
  await assert.doesNotReject(pruneTsxCache({ env: {} }, options));
  assert.deepEqual(warnings, []);
});

for (const operation of ["readdir", "lstat", "unlink"]) {
  test(`${operation} errors are swallowed with one warning`, async t => {
    const { directory, options, warnings } = await fixture({ t });
    await writeEntry({ directory, name: "old-a", ageHours: 72 });
    await writeEntry({ directory, name: "old-b", ageHours: 72 });
    const filesystem = { ...fs, [operation]: async () => {
      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    } };
    await assert.doesNotReject(pruneTsxCache({ env: {} }, { ...options, filesystem }));
    assert.deepEqual(warnings, ["tovu dev: tsx cache pruning failed; continuing."]);
  });
}

test("a broken logger and a failing clock cannot prevent launch", async t => {
  const { options } = await fixture({ t });
  await assert.doesNotReject(pruneTsxCache({ env: {} }, { ...options,
    now: () => { throw new Error("clock failed"); },
    warn: () => { throw new Error("logger failed"); },
  }));
});

test("rechecks modification times before deleting a file refreshed during the scan", async t => {
  const { directory, options } = await fixture({ t });
  await writeEntry({ directory, name: "refreshed", ageHours: 72 });
  let reads = 0;
  await pruneTsxCache({ env: {} }, { ...options, filesystem: { ...fs, lstat: async file => {
    if (++reads === 2) await fs.utimes(file, new Date(NOW), new Date(NOW));
    return fs.lstat(file);
  } } });
  assert.deepEqual(await fs.readdir(directory), ["refreshed"]);
});

for (const operation of ["lstat", "unlink"]) {
  test(`files disappearing during ${operation} do not abort other deletions or warn`, async t => {
    const { directory, options, warnings } = await fixture({ t });
    const vanished = await writeEntry({ directory, name: "vanished", ageHours: 72 });
    await writeEntry({ directory, name: "old", ageHours: 72 });
    await pruneTsxCache({ env: {} }, { ...options, filesystem: { ...fs, [operation]: async file => {
      if (file === vanished) await fs.unlink(file);
      return fs[operation](file);
    } } });
    assert.deepEqual(await fs.readdir(directory), []);
    assert.deepEqual(warnings, []);
  });
}

test("large scans complete across bounded, concurrent stat batches", async t => {
  const { directory, options } = await fixture({ t });
  for (let index = 0; index < 260; index++) {
    await writeEntry({ directory, name: `old-${index}`, ageHours: 72 });
  }
  let active = 0;
  let maximum = 0;
  await pruneTsxCache({ env: {} }, { ...options, filesystem: { ...fs, lstat: async file => {
    active++;
    maximum = Math.max(maximum, active);
    try { return await fs.lstat(file); }
    finally { active--; }
  } } });
  assert.deepEqual(await fs.readdir(directory), []);
  assert.ok(maximum > 1, "stats should overlap rather than serialize");
  assert.ok(maximum <= 256, "stats must stay bounded");
});

test("symlink entries and symlinked cache directories are left untouched", {
  skip: process.platform === "win32" ? "symlink creation may require Windows privileges" : false,
}, async t => {
  const { directory, options } = await fixture({ t }, { getuid: () => undefined });
  const outside = path.join(options.tmpDir, "outside");
  await fs.mkdir(outside);
  const target = await writeEntry({ directory: outside, name: "old", ageHours: 72 });
  await fs.symlink(target, path.join(directory, "linked-file"));
  await fs.symlink(outside, path.join(options.tmpDir, "tsx-linked"));
  await pruneTsxCache({ env: {} }, options);
  assert.equal(await fs.readFile(target, "utf8"), "cached transpilation");
  assert.equal((await fs.lstat(path.join(directory, "linked-file"))).isSymbolicLink(), true);
  assert.equal((await fs.lstat(path.join(options.tmpDir, "tsx-linked"))).isSymbolicLink(), true);
});
