import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";

import { writeFileAtomic } from "../../atomic-write.js";
import { createNodeAtomicFilesystem } from "@jini-ai/platform/fs";

/**
 * @file F1 (2026-09-05 site-dir env perms audit) — `writeFileAtomic` must not widen an existing
 * destination file's permissions, and must not hand a brand-new file the loose
 * `0666 & ~umask` default `fs.writeFileSync` gives it with no `mode` — the concrete case that
 * mattered: `active-site.ts`'s `persistActiveSite` writes the repo-root `.env` through this
 * primitive, so an existing `0600` `.env` was being replaced by a `0644` one on every site
 * activation.
 */

function mkFixtureDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-atomic-write-"));
}

function isRoot(): boolean {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

test("writeFileAtomic: a brand-new destination lands at 0600, not the loose fs.writeFileSync default", () => {
  const dir = mkFixtureDir();
  try {
    const target = path.join(dir, "fresh.env");
    writeFileAtomic({ filePath: target, content: "TOVU_SITE=my-site\n" }, {});
    assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("writeFileAtomic: overwriting an existing 0600 file (e.g. .env) preserves its mode", () => {
  const dir = mkFixtureDir();
  try {
    const target = path.join(dir, ".env");
    fs.writeFileSync(target, "TOVU_ADMIN_PASSWORD=secret\n");
    fs.chmodSync(target, 0o600);
    writeFileAtomic({ filePath: target, content: "TOVU_ADMIN_PASSWORD=secret\nTOVU_SITE=new-site\n" }, {});
    assert.equal(fs.statSync(target).mode & 0o777, 0o600, "activating a site must not widen .env's permissions");
    assert.equal(fs.readFileSync(target, "utf8"), "TOVU_ADMIN_PASSWORD=secret\nTOVU_SITE=new-site\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("writeFileAtomic: overwriting an existing 0644 file preserves 0644 (preserve, not force-tighten)", () => {
  const dir = mkFixtureDir();
  try {
    const target = path.join(dir, ".site-meta.json");
    fs.writeFileSync(target, "{}");
    fs.chmodSync(target, 0o644);
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      import { writeFileAtomic } from ${JSON.stringify(new URL("../../atomic-write.ts", import.meta.url).href)};
      process.umask(0o077);
      writeFileAtomic({ filePath: process.argv[1], content: '{"schemaVersion":2}' }, {});
    `, target]);
    assert.equal(fs.statSync(target).mode & 0o777, 0o644, "an unrelated already-0644 file must not be forced to 0600");
    assert.equal(fs.readFileSync(target, "utf8"), '{"schemaVersion":2}');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

for (const stage of ["statSync", "chmodSync", "renameSync"] as const) {
  test(`writeFileAtomic: ${stage} failure propagates and preserves destination bytes and mode`, () => {
    const dir = mkFixtureDir();
    const target = path.join(dir, ".env");
    fs.writeFileSync(target, "ORIGINAL\n", { mode: 0o640 });
    fs.chmodSync(target, 0o640);
    const error = Object.assign(new Error(`injected ${stage} failure`), { code: stage === "statSync" ? "EACCES" : "EIO" });
    const portMethod = { statSync: "stat", chmodSync: "chmod", renameSync: "rename" }[stage];
    const filesystem = { ...createNodeAtomicFilesystem({}, {}), [portMethod]: () => { throw error; } };
    try {
      assert.throws(() => writeFileAtomic({ filePath: target, content: "REPLACED\n" }, { filesystem }), (actual) => actual === error);
      assert.equal(fs.readFileSync(target, "utf8"), "ORIGINAL\n");
      assert.equal(fs.statSync(target).mode & 0o777, 0o640);
      assert.deepEqual(fs.readdirSync(dir), [".env"], "a failed replacement must not leave an owned temporary file");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("writeFileAtomic: a blocked write (INV-04) throws before any rename and leaves the destination untouched", (t) => {
  if (isRoot()) {
    t.skip("running as root ignores directory mode bits — this test cannot force EACCES");
    return;
  }
  const dir = mkFixtureDir();
  try {
    const target = path.join(dir, ".env");
    fs.writeFileSync(target, "ORIGINAL\n");
    fs.chmodSync(dir, 0o500); // read + execute, no write: blocks creating the temp file
    assert.throws(() => writeFileAtomic({ filePath: target, content: "REPLACED\n" }, {}));
    fs.chmodSync(dir, 0o700); // restore before reading/cleanup
    assert.equal(fs.readFileSync(target, "utf8"), "ORIGINAL\n", "a blocked temp-file write must never reach the rename");
  } finally {
    fs.chmodSync(dir, 0o700);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
