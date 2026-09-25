/**
 * @file Tests for `asar-verify.ts`. The last group here is the one the packaging incident actually
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

import {
  VERIFIED_PREFIXES,
  filesUnderPrefixes,
  formatMismatchReport,
  bundledNpmFailures,
  isEmptyVerification,
  toArchiveEntryPath,
  verifyAsarAgainstSource,
} from "./asar-verify.ts";

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
 *  (src/, bin/, main.ts at the archive root), and returns paths for the test to use. Content is
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
    assert.equal(mismatches[0]!.relPath, target, "the gate must name the actual corrupted file");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a checked prefix with NOTHING shipped under it is a mismatch, not a partial pass", async () => {
  // The past incident: `bin/` left out of `files:` shipped an app whose launcher named a missing
  // bridge. `src` alone still yields a non-zero checkedCount, so only a per-prefix check catches it.
  const { root, asarPath } = await buildFixture();
  try {
    const { mismatches } = verifyAsarAgainstSource(asarPath, root, ["src", "bin", "main.ts", "dist"]);
    assert.deepEqual(mismatches, [{ relPath: "dist", reason: "nothing under this checked prefix is in app.asar" }]);
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
    assert.equal(mismatches[0]!.relPath, "bin/c.mjs");
    assert.match(mismatches[0]!.reason, /missing from the source tree/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- dist/ coverage: the compiled preloads (and the contracts they import) ship inside app.asar via
// electron-builder.yml's `dist/**` entry, exactly like src/bin/main.ts — see VERIFIED_PREFIXES's own doc
// comment for why they belong in the same "shell's own code" scope rather than the staged Tovu payload. ------

/** Same file shape as {@link buildFixture} plus a `dist/` tree mirroring apps/desktop's real
 *  compiled-preload layout: `dist/preload/preload.mjs`, `dist/speech/preload-speech.cjs`, and
 *  `dist/contracts/x.js` (a shared module the compiled preload imports at runtime — main.ts:523 loads
 *  dist/renderer too, but one representative nested dist/ file per real shipped subdirectory is enough
 *  to prove the tree-walk, which is already covered generically by the "nested directory prefix" test
 *  above).
 *
 *  Unlike {@link buildFixture} (packed once, never touched again), several tests below add MORE files
 *  to `root` after this returns and re-pack. `buildFixture` writes its archive to `path.join(root,
 *  "app.asar")` — fine for a single pack, but re-packing `root` a SECOND time would then include that
 *  first archive's own bytes as a file named "app.asar" inside the tree being packed, corrupting every
 *  entry's offset (confirmed empirically: an earlier version of this helper did exactly that and every
 *  fixture file, not just the intentionally-corrupted one, came back mismatched). So this helper keeps
 *  the archive OUTSIDE the packed directory — a sibling under `outer` — so it can be re-packed any
 *  number of times safely. `teardown()` removes both. */
async function buildFixtureWithDist() {
  const outer = mkdtempSync(path.join(os.tmpdir(), "tovu-asar-verify-dist-"));
  const root = path.join(outer, "payload");
  mkdirSync(path.join(root, "src", "sub"), { recursive: true });
  mkdirSync(path.join(root, "bin"), { recursive: true });
  mkdirSync(path.join(root, "dist", "preload"), { recursive: true });
  mkdirSync(path.join(root, "dist", "speech"), { recursive: true });
  mkdirSync(path.join(root, "dist", "contracts"), { recursive: true });

  const files = {
    "src/a.js": "// fixture file A ".repeat(20) + "UNIQUE-MARKER-AAAA\n",
    "src/sub/b.js": "// fixture file B ".repeat(20) + "UNIQUE-MARKER-BBBB\n",
    "bin/c.mjs": "// fixture bin C ".repeat(20) + "UNIQUE-MARKER-CCCC\n",
    "main.ts": "// fixture main ".repeat(20) + "UNIQUE-MARKER-MMMM\n",
    "dist/preload/preload.mjs": "// fixture compiled preload ".repeat(20) + "UNIQUE-MARKER-PPPP\n",
    "dist/speech/preload-speech.cjs": "// fixture compiled speech preload ".repeat(20) + "UNIQUE-MARKER-SSSS\n",
    "dist/contracts/x.js": "// fixture compiled contract ".repeat(20) + "UNIQUE-MARKER-CCCC2\n",
  };
  for (const [rel, content] of Object.entries(files)) {
    writeFileSync(path.join(root, rel), content);
  }

  const asarPath = path.join(outer, "app.asar"); // sibling to `root`, never inside it — see doc comment above
  await createPackageWithOptions(root, asarPath, {});
  return { root, asarPath, files, teardown: () => rmSync(outer, { recursive: true, force: true }) };
}

test("VERIFIED_PREFIXES includes dist — the compiled preloads and the contracts they import are in scope", () => {
  assert.ok(VERIFIED_PREFIXES.includes("dist"), "production config must cover dist/, not just src/bin/main.ts");
});

test("a corrupted compiled preload under dist/ IS caught, using the real production prefix list", async () => {
  const { root, asarPath, files, teardown } = await buildFixtureWithDist();
  try {
    const target = "dist/preload/preload.mjs";
    const originalContent = Buffer.from(files[target]);

    const archiveBuf = readFileSync(asarPath);
    const at = archiveBuf.indexOf(originalContent);
    assert.notEqual(at, -1, "fixture content must be found in the packed archive");
    const corrupted = Buffer.alloc(originalContent.length, 0x59 /* 'Y' */);
    archiveBuf.set(corrupted, at);
    writeFileSync(asarPath, archiveBuf);

    // Uses the REAL exported production constant, not a hand-copied list — so this test tracks
    // scripts/verify-package.ts's actual wiring and cannot silently drift out of sync with it.
    const { mismatches } = verifyAsarAgainstSource(asarPath, root, VERIFIED_PREFIXES);
    assert.equal(mismatches.length, 1, "the corrupted compiled preload must be reported");
    assert.equal(mismatches[0]!.relPath, target);
  } finally {
    teardown();
  }
});

test("REGRESSION DOCUMENTATION: the pre-fix prefix list (src, bin, main.ts only) misses the same corruption", async () => {
  const { root, asarPath, files, teardown } = await buildFixtureWithDist();
  try {
    const target = "dist/preload/preload.mjs";
    const originalContent = Buffer.from(files[target]);
    const archiveBuf = readFileSync(asarPath);
    const at = archiveBuf.indexOf(originalContent);
    assert.notEqual(at, -1);
    archiveBuf.set(Buffer.alloc(originalContent.length, 0x59), at);
    writeFileSync(asarPath, archiveBuf);

    // This mirrors scripts/verify-package.ts's VERIFIED_PREFIXES value BEFORE this fix. It is a fixed
    // literal on purpose — it documents the historical gap, not current production wiring (that is the
    // job of the test above, which imports VERIFIED_PREFIXES directly).
    const { mismatches } = verifyAsarAgainstSource(asarPath, root, ["src", "bin", "main.ts"]);
    assert.deepEqual(mismatches, [], "without dist/, the corrupted compiled preload goes undetected");
  } finally {
    teardown();
  }
});

test("a .map file present in dist/ on disk but excluded from packing is never checked — not counted, not flagged missing", async () => {
  const { root, asarPath, files, teardown } = await buildFixtureWithDist();
  try {
    // electron-builder.yml's `!**/*.map` means a .map never enters the packed tree, even though `tsc`'s
    // `sourceMap: true` always emits one next to its .mjs/.cjs/.js sibling on disk (the real repo has
    // dist/preload/preload.mjs.map right now). Written AFTER buildFixtureWithDist already packed
    // asarPath, so it exists under `root` (what this test's sourceRoot inspects) but was never part of
    // what got packed — the exact shape electron-builder's own exclusion leaves behind.
    writeFileSync(path.join(root, "dist", "preload", "preload.mjs.map"), '{"version":3,"fixture":true}\n');

    const { checkedCount, mismatches } = verifyAsarAgainstSource(asarPath, root, VERIFIED_PREFIXES);
    // filesUnderPrefixes walks the ARCHIVE header only (never scans the source directory), so a file
    // that was never packed cannot appear in the checked set at all.
    assert.equal(checkedCount, Object.keys(files).length, "the .map file must not be added to the checked set");
    assert.deepEqual(mismatches, [], "an on-disk-only .map file must never be reported as a mismatch");
  } finally {
    teardown();
  }
});

test("a stale dist/ file left behind by an incremental build (no current .ts source) still verifies cleanly — dead code, not a false gate failure", async () => {
  const { root, asarPath, files, teardown } = await buildFixtureWithDist();
  try {
    // Mirrors what the real repo has right now: apps/desktop/dist/contracts/ contains BOTH
    // fleet-conversations.js and workspace-conversations.js after the fleet -> workspace rename, because
    // `tsc -p tsconfig.preload.json` (plain, non-incremental-cache, non-composite) recompiles every
    // matched input on each run but never deletes an outDir file whose source was renamed or removed —
    // `npm run build` does not clean dist/ first. Add one such orphan straight into root/dist (no .ts
    // sibling needed: this module only ever compares dist/ to itself, never to src/contracts) and repack,
    // exactly as `npm run build` -> `electron-builder` would leave it.
    const orphanRel = "dist/contracts/orphaned-old-name.js";
    writeFileSync(path.join(root, orphanRel), "// orphaned build output, no current .ts source\n");
    await createPackageWithOptions(root, asarPath, {});

    const { checkedCount, mismatches } = verifyAsarAgainstSource(asarPath, root, VERIFIED_PREFIXES);
    assert.equal(checkedCount, Object.keys(files).length + 1, "the orphan was genuinely packed, so it IS checked");
    assert.deepEqual(
      mismatches,
      [],
      "it self-matches (packed dist/ vs the same dist/ on disk) — staleness relative to .ts source is invisible " +
        "here by design; this check only ever proves 'asar == the dist/ that fed it', not 'dist/ == current .ts'",
    );
  } finally {
    teardown();
  }
});

// --- isEmptyVerification: pure decision, no fs -------------------------------------------------
// W5 (release plan): "false-green risk if asar path separators misbehave and 0 files get checked" —
// checkedCount === 0 must be a hard failure in scripts/verify-package.ts, never a silent pass.

test("isEmptyVerification is true only when checkedCount is exactly 0", () => {
  assert.equal(isEmptyVerification(0), true);
  assert.equal(isEmptyVerification(1), false);
  assert.equal(isEmptyVerification(4), false);
});

// --- toArchiveEntryPath: pure separator conversion, no fs ---------------------------------------
// `extractFile`'s own `searchNodeFromDirectory` splits the path it is given on the HOST OS's
// `path.sep` (see the doc comment on the `extractFile` call in verifyAsarAgainstSource). Every
// relPath this module produces is POSIX (`filesUnderPrefixes` always joins with "/"), so on a win32
// host that string has no backslash to split on and the lookup finds nothing — this function is the
// fix, and it is injectable-separator so the win32 branch is provable on any host OS.

test("toArchiveEntryPath is a no-op for POSIX separators (the default on this host)", () => {
  assert.equal(toArchiveEntryPath("src/sub/b.js", "/"), "src/sub/b.js");
});

test("toArchiveEntryPath converts every POSIX segment separator to the given separator (win32 simulation)", () => {
  assert.equal(toArchiveEntryPath("src/sub/b.js", "\\"), "src\\sub\\b.js");
  assert.equal(toArchiveEntryPath("main.ts", "\\"), "main.ts", "a path with no separator is unchanged either way");
});

test("toArchiveEntryPath defaults to the real host path.sep when none is passed", () => {
  // On this test's host (macOS/Linux CI), path.sep is "/", so the default call must equal the
  // explicit POSIX case above — pins the default without hard-coding which OS the suite runs on.
  assert.equal(toArchiveEntryPath("src/a.js"), path.sep === "/" ? "src/a.js" : "src\\a.js");
});

// --- bundledNpmFailures: the bundled npm must be present in every resources dir -----------------

test("bundledNpmFailures: no resources dir to check is a failure, never a vacuous pass", () => {
  assert.deepEqual(bundledNpmFailures([]), ["no packaged resources directory was found to check for the bundled npm"]);
});

test("bundledNpmFailures: passes when npx-cli.js and npm's own node_modules are both present, names each one missing otherwise", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "bundled-npm-verify-"));
  try {
    const complete = path.join(root, "complete");
    const noDeps = path.join(root, "no-deps");
    for (const dir of [complete, noDeps]) {
      mkdirSync(path.join(dir, "npm", "bin"), { recursive: true });
      writeFileSync(path.join(dir, "npm", "bin", "npx-cli.js"), "");
    }
    mkdirSync(path.join(complete, "npm", "node_modules", "@npmcli", "arborist"), { recursive: true });
    writeFileSync(path.join(complete, "npm", "node_modules", "@npmcli", "arborist", "package.json"), "{}");

    assert.deepEqual(bundledNpmFailures([complete]), []);
    const arborist = path.join(noDeps, "npm", "node_modules", "@npmcli", "arborist", "package.json");
    assert.deepEqual(bundledNpmFailures([complete, noDeps]), [`${arborist} (under ${noDeps})`]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
