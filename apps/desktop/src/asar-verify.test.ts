/**
 * @file Tests for `asar-verify.js`. The last group here is the one the packaging incident actually
 * demands: it builds a REAL asar archive from a fixture tree, corrupts one entry's content IN PLACE
 * while preserving its exact byte length — reproducing the length-correct/content-wrong signature
 * from ADS-memory/reports/2026-09-12-packaging-asar-corruption.md by construction rather than by
 * racing a real build — and asserts `verifyAsarAgainstSource` fails non-zero-equivalent and names
 * exactly the corrupted file, no others.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPackageWithOptions } from "@electron/asar";

import { filesUnderPrefixes, formatMismatchReport, verifyAsarAgainstSource } from "./asar-verify.ts";

// --- filesUnderPrefixes: pure tree-walk, no real archive involved --------------------------------

test("collects nested files under a directory prefix", () => {
  const header = {
    src: { files: { "a.js": { size: 1, offset: "0" }, sub: { files: { "b.js": { size: 2, offset: "1" } } } } },
  };
  assert.deepEqual(filesUnderPrefixes(header, ["src"]).sort(), ["src/a.js", "src/sub/b.js"]);
});

test("a prefix naming a FILE directly (main.ts) is included as-is, not walked", () => {
  const header = { "main.ts": { size: 4, offset: "0" } };
  assert.deepEqual(filesUnderPrefixes(header, ["main.ts"]), ["main.ts"]);
});

test("symlinks are excluded — they carry no bytes of their own to compare", () => {
  const header = { src: { files: { "linked.js": { link: "elsewhere" }, "real.js": { size: 1, offset: "0" } } } };
  assert.deepEqual(filesUnderPrefixes(header, ["src"]), ["src/real.js"]);
});

test("a prefix absent from the archive is silently skipped, not an error", () => {
  const header = { src: { files: {} } };
  assert.deepEqual(filesUnderPrefixes(header, ["src", "bin", "main.ts"]), []);
});

test("only the requested prefixes are walked — an unrelated top-level entry (node_modules) never appears", () => {
  const header = {
    src: { files: { "a.js": { size: 1, offset: "0" } } },
    node_modules: { files: { "x.js": { size: 9, offset: "9" } } },
  };
  assert.deepEqual(filesUnderPrefixes(header, ["src"]), ["src/a.js"]);
});

// --- formatMismatchReport: pure formatting -------------------------------------------------------

test("the report names every mismatched file individually and explains the failure class", () => {
  const report = formatMismatchReport([{ relPath: "src/tracked-sites.ts", reason: "content differs from source" }]);
  assert.match(report, /MISMATCH\s+src\/tracked-sites\.ts/);
  assert.match(report, /length-correct\/content-wrong/);
  assert.match(report, /^1 file\(s\)/);
});

// --- verifyAsarAgainstSource: real archive, built and torn down per test -------------------------

/** Builds a small real fixture tree + packed .asar mirroring apps/desktop's own layout
 *  (src/, bin/, main.js at the archive root), and returns paths for the test to use. Content is
 *  made long and distinctive enough that `Buffer#indexOf` cannot find a spurious second match
 *  elsewhere in the packed archive (the asar header JSON, or another file's bytes). */
async function buildFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "tovu-asar-verify-"));
  mkdirSync(path.join(root, "src", "sub"), { recursive: true });
  mkdirSync(path.join(root, "bin"), { recursive: true });

  const files = {
    "src/a.js": "// fixture file A ".repeat(20) + "UNIQUE-MARKER-AAAA\n",
    "src/sub/b.js": "// fixture file B ".repeat(20) + "UNIQUE-MARKER-BBBB\n",
    "bin/c.mjs": "// fixture bin C ".repeat(20) + "UNIQUE-MARKER-CCCC\n",
    "main.ts": "// fixture main ".repeat(20) + "UNIQUE-MARKER-MMMM\n",
  };
  for (const [rel, content] of Object.entries(files)) {
    writeFileSync(path.join(root, rel), content);
  }

  const asarPath = path.join(root, "app.asar");
  await createPackageWithOptions(root, asarPath, {});
  return { root, asarPath, files };
}

test("a clean archive matches source on every file, byte-for-byte", async () => {
  const { root, asarPath, files } = await buildFixture();
  try {
    const { checkedCount, mismatches } = verifyAsarAgainstSource(asarPath, root, ["src", "bin", "main.ts"]);
    assert.equal(checkedCount, Object.keys(files).length);
    assert.deepEqual(mismatches, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("DELIBERATE CORRUPTION: one entry rewritten in place, same length, different content — caught and named, no other file flagged", async () => {
  const { root, asarPath, files } = await buildFixture();
  try {
    const target = "src/sub/b.js";
    const originalContent = Buffer.from(files[target]);

    const archiveBuf = readFileSync(asarPath);
    const at = archiveBuf.indexOf(originalContent);
    assert.notEqual(at, -1, "fixture content must be found in the packed archive");
    assert.equal(archiveBuf.indexOf(originalContent, at + 1), -1, "fixture content must be unique in the archive");

    // Same LENGTH, different bytes — the exact signature the incident report names: the header
    // still says the right size at the right offset, but the data underneath is wrong.
    const corrupted = Buffer.alloc(originalContent.length, 0x58 /* 'X' */);
    assert.equal(corrupted.length, originalContent.length);
    archiveBuf.set(corrupted, at);
    writeFileSync(asarPath, archiveBuf);

    const { checkedCount, mismatches } = verifyAsarAgainstSource(asarPath, root, ["src", "bin", "main.ts"]);
    assert.equal(checkedCount, Object.keys(files).length, "corruption must not change which files are checked");
    assert.equal(mismatches.length, 1, "exactly one file was corrupted — exactly one mismatch must be reported");
    assert.equal(mismatches[0].relPath, target, "the gate must name the actual corrupted file");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file present in the archive but deleted from source is reported as missing, not silently skipped", async () => {
  const { root, asarPath, files } = await buildFixture();
  try {
    rmSync(path.join(root, "bin", "c.mjs"));
    const { mismatches } = verifyAsarAgainstSource(asarPath, root, ["src", "bin", "main.ts"]);
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].relPath, "bin/c.mjs");
    assert.match(mismatches[0].reason, /missing from the source tree/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
