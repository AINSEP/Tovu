/**
 * @file Direct tests for `stage-payload-lib.ts`. Real directories throughout — `newestMtime` and
 * `stageTransitiveDependencies` each walk a real filesystem tree, and only the filesystem can
 * produce that honestly (see `project-delete-guard.test.ts`'s header for the same reasoning).
 * Every fixture lives under a fresh `fs.mkdtempSync` directory; nothing here ever touches the real
 * `apps/desktop/staging/tovu-payload` tree `scripts/stage-payload.ts` uses.
 *
 * `newestMtime` section: `touch()` returns the mtime the filesystem actually stored rather than the
 * millisecond value it was asked to set. `fs.utimesSync` round-trips some millisecond values through
 * a lossy seconds-as-a-double conversion (verified empirically — 555555 came back as 555554.999,
 * 9999999 as 9999998.999, while 8888888 and every whole-second value came back exact, with no
 * predictable pattern across those). Comparing against the actually-stored value keeps every
 * assertion an EXACT equality — never "greater than 0" or "changed" — without depending on which
 * millisecond values happen to survive the round trip on this filesystem.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertClosureComplete,
  diskBytes,
  newestMtime,
  parseNpmLsPaths,
  prebuildTarget,
  pruneNativePrebuilds,
  resolveNpmLsCommand,
  resolveTargets,
  stageTransitiveDependencies,
  strippableReason,
  stripNonRuntimeFiles,
} from "./stage-payload-lib.ts";

function tempDir() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-stage-payload-lib-")));
}

/** Writes a file (creating parent directories), stamps it with `mtimeMs`, and returns the mtime the
 *  filesystem actually stored — see the file header for why that can differ from `mtimeMs`. */
function touch(filePath: string, mtimeMs: number): number {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "x");
  fs.utimesSync(filePath, new Date(mtimeMs), new Date(mtimeMs));
  return fs.statSync(filePath).mtimeMs;
}

/** Writes a real `package.json` naming `dependencies`, the shape `declaredDependencies` reads. */
function writePackage(dir: string, dependencies: Record<string, string> = {}): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: path.basename(dir), dependencies }));
}

test("returns 0 for a path that does not exist", () => {
  const dir = tempDir();
  assert.equal(newestMtime(path.join(dir, "nope")), 0);
});

test("returns a bundle-input file's own mtime when given a plain file directly", () => {
  const dir = tempDir();
  const file = path.join(dir, "shell.tsx");
  const stored = touch(file, 1_700_000_010_000);
  assert.equal(newestMtime(file), stored);
});

test("returns 0 for a single file that is not a bundle input (a .test.js file)", () => {
  const dir = tempDir();
  const file = path.join(dir, "shell.test.js");
  touch(file, 1_700_000_010_000);
  assert.equal(newestMtime(file), 0);
});

test("returns the newest mtime among sibling files in a flat directory", () => {
  const dir = tempDir();
  touch(path.join(dir, "older.ts"), 1_000_000);
  const newer = touch(path.join(dir, "newer.ts"), 2_000_000);
  assert.equal(newestMtime(dir), newer);
});

test("excludes an entire node_modules subtree, even when it is the newest thing present", () => {
  const dir = tempDir();
  const source = touch(path.join(dir, "source.ts"), 1_000);
  touch(path.join(dir, "node_modules", "pkg", "index.js"), 9_999_999);
  assert.equal(newestMtime(dir), source);
});

test("excludes dotfile entries and dot-directories, even when newest", () => {
  const dir = tempDir();
  const source = touch(path.join(dir, "source.ts"), 1_000);
  touch(path.join(dir, ".git", "HEAD"), 9_999_999);
  touch(path.join(dir, ".env"), 8_888_888);
  assert.equal(newestMtime(dir), source);
});

test("excludes a __tests__ directory's contents entirely, even when newest", () => {
  const dir = tempDir();
  const source = touch(path.join(dir, "source.ts"), 1_000);
  touch(path.join(dir, "__tests__", "unit", "source.unit.test.ts"), 9_999_999);
  assert.equal(newestMtime(dir), source);
});

test("excludes a __measurements__ directory's contents entirely, even when newest", () => {
  const dir = tempDir();
  const source = touch(path.join(dir, "source.ts"), 1_000);
  touch(path.join(dir, "__measurements__", "run.json"), 9_999_999);
  assert.equal(newestMtime(dir), source);
});

test("excludes a stray *.test.js file sitting directly in a walked directory (not inside __tests__)", () => {
  const dir = tempDir();
  const source = touch(path.join(dir, "source.ts"), 1_000);
  touch(path.join(dir, "source.test.ts"), 9_999_999);
  assert.equal(newestMtime(dir), source);
});

test("recurses into nested directories to find the newest mtime several levels deep", () => {
  const dir = tempDir();
  touch(path.join(dir, "shallow.ts"), 1_000);
  const deep = touch(path.join(dir, "a", "b", "c", "deep.ts"), 3_000_000);
  assert.equal(newestMtime(dir), deep);
});

test("returns 0 for an empty directory", () => {
  const dir = tempDir();
  fs.mkdirSync(dir, { recursive: true });
  assert.equal(newestMtime(dir), 0);
});

test("stageTransitiveDependencies: stages nothing and returns 0 when a root declares no dependencies", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  writePackage(pkgA, {});
  const outDir = path.join(tmp, "out");

  const count = stageTransitiveDependencies({ roots: [pkgA], outDir });

  assert.equal(count, 0);
  assert.equal(fs.existsSync(path.join(outDir, "node_modules")), false);
});

test("stageTransitiveDependencies: stages a single declared dependency found one node_modules level down", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  writePackage(pkgA, { foo: "^1.0.0" });
  const fooDir = path.join(pkgA, "node_modules", "foo");
  writePackage(fooDir, {});
  fs.writeFileSync(path.join(fooDir, "marker.txt"), "real-foo");
  const outDir = path.join(tmp, "out");

  const count = stageTransitiveDependencies({ roots: [pkgA], outDir });

  assert.equal(count, 1);
  const stagedFoo = path.join(outDir, "node_modules", "foo");
  assert.equal(fs.existsSync(path.join(stagedFoo, "package.json")), true);
  assert.equal(fs.readFileSync(path.join(stagedFoo, "marker.txt"), "utf8"), "real-foo");
});

test("stageTransitiveDependencies: follows a multi-level dependency chain, staging every link", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  writePackage(pkgA, { foo: "^1" });
  const fooDir = path.join(pkgA, "node_modules", "foo");
  writePackage(fooDir, { bar: "^1" });
  const barDir = path.join(fooDir, "node_modules", "bar");
  writePackage(barDir, {});
  const outDir = path.join(tmp, "out");

  const count = stageTransitiveDependencies({ roots: [pkgA], outDir });

  assert.equal(count, 2);
  assert.equal(fs.existsSync(path.join(outDir, "node_modules", "foo", "package.json")), true);
  assert.equal(fs.existsSync(path.join(outDir, "node_modules", "bar", "package.json")), true);
});

test("stageTransitiveDependencies: does not loop on a dependency cycle, staging each package exactly once", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  writePackage(pkgA, { foo: "^1" });
  const fooDir = path.join(pkgA, "node_modules", "foo");
  writePackage(fooDir, { bar: "^1" });
  const barDir = path.join(fooDir, "node_modules", "bar");
  writePackage(barDir, { foo: "^1" }); // cycles back to foo, already visited
  const outDir = path.join(tmp, "out");

  const count = stageTransitiveDependencies({ roots: [pkgA], outDir });

  assert.equal(count, 2); // foo + bar, each staged exactly once despite the cycle
});

test("stageTransitiveDependencies: skips an excluded package before ever resolving it", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  writePackage(pkgA, { playwright: "^1" });
  // A REAL, resolvable playwright package sits right where findPackageDir would find it — proving
  // the skip happens at the exclusion check, not merely because resolution failed.
  writePackage(path.join(pkgA, "node_modules", "playwright"), {});
  const outDir = path.join(tmp, "out");

  const count = stageTransitiveDependencies({ roots: [pkgA], outDir });

  assert.equal(count, 0);
  assert.equal(fs.existsSync(path.join(outDir, "node_modules", "playwright")), false);
});

test("stageTransitiveDependencies: skips lucide-react before ever resolving it", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  writePackage(pkgA, { "lucide-react": "^1" });
  // Resolvable, same as the playwright case above, so only the exclusion check can skip it.
  writePackage(path.join(pkgA, "node_modules", "lucide-react"), {});
  const outDir = path.join(tmp, "out");

  const count = stageTransitiveDependencies({ roots: [pkgA], outDir });

  assert.equal(count, 0);
  assert.equal(fs.existsSync(path.join(outDir, "node_modules", "lucide-react")), false);
});

test("stageTransitiveDependencies: does not re-copy a dependency whose staged destination already exists, but still walks its own dependencies", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  writePackage(pkgA, { foo: "^1" });
  const fooDir = path.join(pkgA, "node_modules", "foo");
  writePackage(fooDir, { bar: "^1" });
  fs.writeFileSync(path.join(fooDir, "marker.txt"), "real-foo");
  writePackage(path.join(fooDir, "node_modules", "bar"), {});
  const outDir = path.join(tmp, "out");

  // Pre-stage a STUB foo at the destination — proves the real foo is never copied over it.
  const stagedFoo = path.join(outDir, "node_modules", "foo");
  fs.mkdirSync(stagedFoo, { recursive: true });
  fs.writeFileSync(path.join(stagedFoo, "marker.txt"), "stub-foo");

  const count = stageTransitiveDependencies({ roots: [pkgA], outDir });

  assert.equal(count, 1); // only bar counted; foo's destination already existed
  assert.equal(fs.readFileSync(path.join(stagedFoo, "marker.txt"), "utf8"), "stub-foo"); // untouched
  // foo's own dependency (bar) was still walked and staged, despite foo itself being skipped.
  assert.equal(fs.existsSync(path.join(outDir, "node_modules", "bar", "package.json")), true);
});

test("stageTransitiveDependencies: does not stage a dependency that resolves to one of the roots itself", () => {
  const tmp = tempDir();
  const pkgA = path.join(tmp, "pkgA");
  const pkgB = path.join(tmp, "pkgB");
  writePackage(pkgB, {});
  writePackage(pkgA, { pkgB: "^1" });
  fs.mkdirSync(path.join(pkgA, "node_modules"), { recursive: true });
  fs.symlinkSync(pkgB, path.join(pkgA, "node_modules", "pkgB"));
  const outDir = path.join(tmp, "out");

  const count = stageTransitiveDependencies({ roots: [pkgA, pkgB], outDir });

  assert.equal(count, 0);
  assert.equal(fs.existsSync(path.join(outDir, "node_modules", "pkgB")), false);
});

test("assertClosureComplete: does not throw when every declared dependency resolves in the staged tree (hoisted)", () => {
  const tmp = tempDir();
  const outDir = path.join(tmp, "out");
  const modulesDir = path.join(outDir, "node_modules");
  writePackage(path.join(modulesDir, "pkgA"), { pkgB: "^1" });
  writePackage(path.join(modulesDir, "pkgB"), {});

  assert.doesNotThrow(() => assertClosureComplete({ outDir }));
});

test("assertClosureComplete: throws with the exact pkg -> dep message when a dependency is missing", () => {
  const tmp = tempDir();
  const outDir = path.join(tmp, "out");
  const modulesDir = path.join(outDir, "node_modules");
  writePackage(path.join(modulesDir, "pkgA"), { missingDep: "^1" });

  assert.throws(() => assertClosureComplete({ outDir }), (err) => {
    assert.equal(
      // `as`: assertClosureComplete only ever throws a plain Error.
      (err as Error).message,
      "staged tree is missing 1 declared dependencies, so the packaged app would fail once installed outside this repo:\n  pkgA -> missingDep"
    );
    return true;
  });
});

test("assertClosureComplete: an excluded package is exempt from the check even when it is absent", () => {
  const tmp = tempDir();
  const outDir = path.join(tmp, "out");
  const modulesDir = path.join(outDir, "node_modules");
  writePackage(path.join(modulesDir, "pkgA"), { playwright: "^1" });

  assert.doesNotThrow(() => assertClosureComplete({ outDir }));
});

test("assertClosureComplete: an absent lucide-react is exempt even when a staged package still declares it", () => {
  const tmp = tempDir();
  const outDir = path.join(tmp, "out");
  const modulesDir = path.join(outDir, "node_modules");
  writePackage(path.join(modulesDir, "@jini-ai", "ui"), { "lucide-react": "^1.32.0" });

  assert.doesNotThrow(() => assertClosureComplete({ outDir }));
});

test("assertClosureComplete: walks a scoped (@scope/name) staged package and names it correctly when reporting a missing dependency", () => {
  const tmp = tempDir();
  const outDir = path.join(tmp, "out");
  const modulesDir = path.join(outDir, "node_modules");
  writePackage(path.join(modulesDir, "@scope", "pkg"), { missingDep: "^1" });

  assert.throws(() => assertClosureComplete({ outDir }), (err) => {
    assert.equal(
      // `as`: assertClosureComplete only ever throws a plain Error.
      (err as Error).message,
      `staged tree is missing 1 declared dependencies, so the packaged app would fail once installed outside this repo:\n  ${path.join("@scope", "pkg")} -> missingDep`
    );
    return true;
  });
});

test("assertClosureComplete: a dependency resolved via the package's own nested node_modules (not hoisted) does not count as missing", () => {
  const tmp = tempDir();
  const outDir = path.join(tmp, "out");
  const modulesDir = path.join(outDir, "node_modules");
  const pkgADir = path.join(modulesDir, "pkgA");
  writePackage(pkgADir, { nestedDep: "^1" });
  writePackage(path.join(pkgADir, "node_modules", "nestedDep"), {});

  assert.doesNotThrow(() => assertClosureComplete({ outDir }));
});

test("assertClosureComplete: preserves declaration order across multiple missing dependencies", () => {
  const tmp = tempDir();
  const outDir = path.join(tmp, "out");
  const modulesDir = path.join(outDir, "node_modules");
  writePackage(path.join(modulesDir, "pkgA"), { zeta: "^1", alpha: "^1" });

  assert.throws(() => assertClosureComplete({ outDir }), (err) => {
    assert.equal(
      // `as`: assertClosureComplete only ever throws a plain Error.
      (err as Error).message,
      "staged tree is missing 2 declared dependencies, so the packaged app would fail once installed outside this repo:\n  pkgA -> zeta\n  pkgA -> alpha"
    );
    return true;
  });
});

test("assertClosureComplete: ignores dotfile-prefixed entries under node_modules, even ones with their own package.json", () => {
  const tmp = tempDir();
  const outDir = path.join(tmp, "out");
  const modulesDir = path.join(outDir, "node_modules");
  writePackage(path.join(modulesDir, "pkgA"), {});
  writePackage(path.join(modulesDir, ".hidden"), { missingDep: "^1" });

  assert.doesNotThrow(() => assertClosureComplete({ outDir }));
});

/** Writes `files` (paths relative to `<outDir>/node_modules`) and returns that modules directory. */
function writeStagedFiles(outDir: string, files: readonly string[]): string {
  const modulesDir = path.join(outDir, "node_modules");
  for (const relative of files) {
    const full = path.join(modulesDir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "x".repeat(64));
  }
  return modulesDir;
}

const survives = (relative: string) => strippableReason(relative) === undefined;

test("strippableReason: every declaration extension is condemned, in any scope", () => {
  assert.equal(strippableReason("drizzle-orm/index.d.ts"), "declaration");
  assert.equal(strippableReason("drizzle-orm/index.d.mts"), "declaration");
  assert.equal(strippableReason("drizzle-orm/index.d.cts"), "declaration");
  // First-party too: the keep-list is about source maps, not declarations. Nothing reads a .d.ts at runtime.
  assert.equal(strippableReason("@jini-ai/ui/dist/index.d.ts"), "declaration");
});

test("strippableReason: a .d.ts.map goes with the declaration it serves, even under a kept scope", () => {
  // Ordering matters -- the declaration rule has to win over the source-map keep-list, or 10k
  // declaration maps would survive with nothing left for them to map.
  assert.equal(strippableReason("@jini-ai/ui/dist/index.d.ts.map"), "declaration");
  assert.equal(strippableReason("drizzle-orm/index.d.ts.map"), "declaration");
});

test("strippableReason: third-party source maps go, @jini-ai source maps stay", () => {
  assert.equal(strippableReason("drizzle-orm/index.js.map"), "sourceMap");
  assert.equal(strippableReason("recharts/lib/chart/LineChart.js.map"), "sourceMap");
  assert.equal(strippableReason("@jini-ai/ui/dist/index.js.map"), undefined);
  assert.equal(strippableReason("@jini-ai/agent-runtime/dist/deep/nested/run.js.map"), undefined);
});

test("strippableReason: the keep-list matches the scope, not a prefix of it", () => {
  assert.equal(strippableReason("@jini-ai-fork/ui/dist/index.js.map"), "sourceMap");
  assert.equal(strippableReason("jini-ai/dist/index.js.map"), "sourceMap");
  // A kept package's own nested copy of a third-party one is NOT first-party source.
  assert.equal(strippableReason("es-toolkit/node_modules/@jini-ai/x/index.js.map"), "sourceMap");
});

test("strippableReason: executable code and data survive, including near-miss names", () => {
  assert.ok(survives("drizzle-orm/index.js"));
  assert.ok(survives("drizzle-orm/package.json"));
  assert.ok(survives("better-sqlite3/prebuilds/darwin-x64.node"));
  assert.ok(survives("drizzle-orm/LICENSE"));
  // Not a declaration: the `d` is part of the basename, not a `.d.ts` suffix.
  assert.ok(survives("some-pkg/embed.ts"));
  assert.ok(survives("some-pkg/dts.js"));
  assert.ok(survives("some-pkg/sourcemap.js"));
  // A directory named like a map is not one; only the basename decides.
  assert.ok(survives("some-pkg/index.js.map.js"));
});

test("stripNonRuntimeFiles: deletes exactly the condemned files and tallies them by reason", () => {
  const outDir = path.join(tempDir(), "out");
  const modulesDir = writeStagedFiles(outDir, [
    path.join("drizzle-orm", "index.js"),
    path.join("drizzle-orm", "index.js.map"),
    path.join("drizzle-orm", "index.d.ts"),
    path.join("drizzle-orm", "index.d.ts.map"),
    path.join("@jini-ai", "ui", "dist", "index.js"),
    path.join("@jini-ai", "ui", "dist", "index.js.map"),
    path.join("@jini-ai", "ui", "dist", "index.d.ts"),
  ]);

  const tally = stripNonRuntimeFiles({ outDir });

  assert.equal(tally.declaration, 3);
  assert.equal(tally.sourceMap, 1);
  assert.equal(tally.coverage, 0);
  assert.ok(tally.bytes > 0, "must report the on-disk bytes it freed");
  assert.ok(fs.existsSync(path.join(modulesDir, "drizzle-orm", "index.js")));
  assert.ok(fs.existsSync(path.join(modulesDir, "@jini-ai", "ui", "dist", "index.js")));
  assert.ok(fs.existsSync(path.join(modulesDir, "@jini-ai", "ui", "dist", "index.js.map")));
  assert.ok(!fs.existsSync(path.join(modulesDir, "drizzle-orm", "index.js.map")));
  assert.ok(!fs.existsSync(path.join(modulesDir, "drizzle-orm", "index.d.ts")));
  assert.ok(!fs.existsSync(path.join(modulesDir, "drizzle-orm", "index.d.ts.map")));
  assert.ok(!fs.existsSync(path.join(modulesDir, "@jini-ai", "ui", "dist", "index.d.ts")));
});

test("stripNonRuntimeFiles: deletes a package's own coverage/ report but not a nested directory sharing the name", () => {
  const outDir = path.join(tempDir(), "out");
  const modulesDir = writeStagedFiles(outDir, [
    path.join("@jini-ai", "ui", "package.json"),
    path.join("@jini-ai", "ui", "coverage", "index.html"),
    path.join("@jini-ai", "ui", "coverage", "lcov-report", "base.css"),
    // A runtime module a package is entitled to ship under that name.
    path.join("some-pkg", "package.json"),
    path.join("some-pkg", "dist", "coverage", "report.js"),
  ]);

  const tally = stripNonRuntimeFiles({ outDir });

  assert.equal(tally.coverage, 1);
  assert.ok(!fs.existsSync(path.join(modulesDir, "@jini-ai", "ui", "coverage")));
  assert.ok(fs.existsSync(path.join(modulesDir, "@jini-ai", "ui", "package.json")));
  assert.ok(fs.existsSync(path.join(modulesDir, "some-pkg", "dist", "coverage", "report.js")));
});

test("stripNonRuntimeFiles: leaves the staged closure complete, so the app still resolves every dependency", () => {
  const outDir = path.join(tempDir(), "out");
  const modulesDir = path.join(outDir, "node_modules");
  writePackage(path.join(modulesDir, "pkgA"), { pkgB: "^1" });
  writePackage(path.join(modulesDir, "pkgB"), {});
  writeStagedFiles(outDir, [path.join("pkgA", "index.d.ts"), path.join("pkgB", "index.js.map")]);

  stripNonRuntimeFiles({ outDir });

  // package.json is what the closure check reads; a strip that touched it would break resolution.
  assert.doesNotThrow(() => assertClosureComplete({ outDir }));
});

test("stripNonRuntimeFiles: a staged tree with no node_modules at all is a no-op, not a crash", () => {
  const outDir = path.join(tempDir(), "out");
  fs.mkdirSync(outDir, { recursive: true });

  assert.deepEqual(stripNonRuntimeFiles({ outDir }), { declaration: 0, sourceMap: 0, coverage: 0, bytes: 0 });
});

test("stripNonRuntimeFiles: never reaches outside node_modules — dist/ and apps/ are untouched", () => {
  // The staged dist/ and the two SPA builds carry no declarations or maps today (measured: 0 of
  // 1453 files), but nothing about the strip should depend on that staying true.
  const outDir = path.join(tempDir(), "out");
  writeStagedFiles(outDir, [path.join("pkgA", "index.js")]);
  for (const relative of [path.join("dist", "src", "cli", "main.d.ts"), path.join("apps", "admin", "dist", "app.js.map")]) {
    const full = path.join(outDir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "x");
  }

  const tally = stripNonRuntimeFiles({ outDir });

  assert.deepEqual(tally, { declaration: 0, sourceMap: 0, coverage: 0, bytes: 0 });
  assert.ok(fs.existsSync(path.join(outDir, "dist", "src", "cli", "main.d.ts")));
  assert.ok(fs.existsSync(path.join(outDir, "apps", "admin", "dist", "app.js.map")));
});

/** The exact eight prebuilds `better-sqlite3@13.0.3` ships, as flat `.node` files. */
const BETTER_SQLITE3_PREBUILDS = [
  "darwin-arm64.node",
  "darwin-x64.node",
  "linux-arm64.node",
  "linux-x64.node",
  "linuxmusl-arm64.node",
  "linuxmusl-x64.node",
  "win32-arm64.node",
  "win32-x64.node",
];

/** Stages a fake better-sqlite3 (flat prebuild files) and argon2 (prebuild DIRECTORIES) under `outDir`. */
function stageNativePackages(outDir: string, { sqlitePrebuilds = BETTER_SQLITE3_PREBUILDS }: { sqlitePrebuilds?: readonly string[] } = {}): string {
  const modulesDir = path.join(outDir, "node_modules");
  const sqlite = path.join(modulesDir, "better-sqlite3");
  writePackage(sqlite, {});
  writeStagedFiles(outDir, [
    ...sqlitePrebuilds.map((file) => path.join("better-sqlite3", "prebuilds", file)),
    path.join("better-sqlite3", "lib", "binding.js"),
    path.join("better-sqlite3", "deps", "sqlite3", "sqlite3.c"),
    path.join("better-sqlite3", "binding.gyp"),
  ]);
  writePackage(path.join(modulesDir, "argon2"), {});
  writeStagedFiles(outDir, [
    path.join("argon2", "prebuilds", "darwin-x64", "argon2.glibc.node"),
    path.join("argon2", "prebuilds", "darwin-arm64", "argon2.armv8.glibc.node"),
    path.join("argon2", "prebuilds", "freebsd-x64", "argon2.glibc.node"),
    path.join("argon2", "prebuilds", "linux-arm", "argon2.glibc.node"),
    path.join("argon2", "argon2.cjs"),
  ]);
  return modulesDir;
}

const listPrebuilds = (modulesDir: string, pkg: string) => fs.readdirSync(path.join(modulesDir, pkg, "prebuilds")).sort();

test("prebuildTarget: parses both prebuildify layouts, a flat .node file and a directory", () => {
  assert.deepEqual(prebuildTarget("darwin-x64.node"), { platform: "darwin", architectures: ["x64"] });
  assert.deepEqual(prebuildTarget("darwin-x64"), { platform: "darwin", architectures: ["x64"] });
  assert.deepEqual(prebuildTarget("linuxmusl-arm64.node"), { platform: "linuxmusl", architectures: ["arm64"] });
  assert.deepEqual(prebuildTarget("linux-arm"), { platform: "linux", architectures: ["arm"] });
});

test("prebuildTarget: a multi-architecture tag is a LIST, the way node-gyp-build's parseTuple splits it", () => {
  // Read as the single arch "x64+arm64" it would match no target, and the universal binary serving
  // every target would be the one thing deleted.
  assert.deepEqual(prebuildTarget("darwin-x64+arm64"), { platform: "darwin", architectures: ["x64", "arm64"] });
  assert.deepEqual(prebuildTarget("darwin-x64+arm64.node"), { platform: "darwin", architectures: ["x64", "arm64"] });
});

test("prebuildTarget: an unrecognized shape is undefined, never a guessed platform", () => {
  assert.equal(prebuildTarget("node-v127-darwin-x64"), undefined);
  assert.equal(prebuildTarget("README.md"), undefined);
  assert.equal(prebuildTarget("darwin"), undefined);
  assert.equal(prebuildTarget("-x64.node"), undefined);
  assert.equal(prebuildTarget("darwin-.node"), undefined);
  assert.equal(prebuildTarget("darwin-x64+.node"), undefined);
});

test("resolveTargets: defaults to the host, which is what electron-builder packs with no arch flag", () => {
  assert.deepEqual(resolveTargets({}, { platform: "darwin", arch: "x64" }), [{ platform: "darwin", arch: "x64" }]);
  assert.deepEqual(resolveTargets({}, { platform: "darwin", arch: "arm64" }), [{ platform: "darwin", arch: "arm64" }]);
});

test("resolveTargets: an explicit env target overrides the host, so a cross-arch build is not packed for the wrong machine", () => {
  // The case the brief named: an x64 host building for arm64 must NOT keep the host's x64 binary.
  assert.deepEqual(resolveTargets({ TOVU_TARGET_ARCH: "arm64" }, { platform: "darwin", arch: "x64" }), [{ platform: "darwin", arch: "arm64" }]);
  assert.deepEqual(resolveTargets({ TOVU_TARGET_PLATFORM: "linux", TOVU_TARGET_ARCH: "x64" }, { platform: "darwin", arch: "arm64" }), [
    { platform: "linux", arch: "x64" },
  ]);
});

test("resolveTargets: universal keeps BOTH macOS architectures", () => {
  assert.deepEqual(resolveTargets({ TOVU_TARGET_ARCH: "universal" }, { platform: "darwin", arch: "x64" }), [
    { platform: "darwin", arch: "x64" },
    { platform: "darwin", arch: "arm64" },
  ]);
});

test("pruneNativePrebuilds: an x64 target keeps exactly darwin-x64, in both layouts", () => {
  const outDir = path.join(tempDir(), "out");
  const modulesDir = stageNativePackages(outDir);

  const tally = pruneNativePrebuilds({ outDir, targets: [{ platform: "darwin", arch: "x64" }] });

  assert.deepEqual(listPrebuilds(modulesDir, "better-sqlite3"), ["darwin-x64.node"]);
  assert.deepEqual(listPrebuilds(modulesDir, "argon2"), ["darwin-x64"]);
  assert.equal(tally.prebuilds, 7 + 3);
  assert.ok(tally.bytes > 0);
});

test("pruneNativePrebuilds: an arm64 target keeps darwin-arm64 — the filter follows the target, not the host", () => {
  // Run on whatever machine this is: the result must not depend on process.arch.
  const outDir = path.join(tempDir(), "out");
  const modulesDir = stageNativePackages(outDir);

  pruneNativePrebuilds({ outDir, targets: [{ platform: "darwin", arch: "arm64" }] });

  assert.deepEqual(listPrebuilds(modulesDir, "better-sqlite3"), ["darwin-arm64.node"]);
  assert.deepEqual(listPrebuilds(modulesDir, "argon2"), ["darwin-arm64"]);
});

test("pruneNativePrebuilds: a universal target keeps both macOS binaries and nothing else", () => {
  const outDir = path.join(tempDir(), "out");
  const modulesDir = stageNativePackages(outDir);

  pruneNativePrebuilds({ outDir, targets: resolveTargets({ TOVU_TARGET_ARCH: "universal" }, { platform: "darwin", arch: "x64" }) });

  assert.deepEqual(listPrebuilds(modulesDir, "better-sqlite3"), ["darwin-arm64.node", "darwin-x64.node"]);
});

test("pruneNativePrebuilds: a linux target also keeps the musl build, whose libc is only known at runtime", () => {
  const outDir = path.join(tempDir(), "out");
  const modulesDir = stageNativePackages(outDir);

  // argon2's fixture has no linux-x64, so give it nothing to refuse on: only better-sqlite3 is asserted.
  fs.mkdirSync(path.join(modulesDir, "argon2", "prebuilds", "linux-x64"), { recursive: true });
  pruneNativePrebuilds({ outDir, targets: [{ platform: "linux", arch: "x64" }] });

  assert.deepEqual(listPrebuilds(modulesDir, "better-sqlite3"), ["linux-x64.node", "linuxmusl-x64.node"]);
});

test("pruneNativePrebuilds: keeps a multi-architecture binary that serves the target", () => {
  const outDir = path.join(tempDir(), "out");
  const modulesDir = stageNativePackages(outDir, { sqlitePrebuilds: ["darwin-x64+arm64.node", "win32-x64.node"] });

  pruneNativePrebuilds({ outDir, targets: [{ platform: "darwin", arch: "arm64" }] });

  assert.deepEqual(listPrebuilds(modulesDir, "better-sqlite3"), ["darwin-x64+arm64.node"]);
});

test("pruneNativePrebuilds: removes the from-source build inputs but not the runtime JS beside them", () => {
  const outDir = path.join(tempDir(), "out");
  const modulesDir = stageNativePackages(outDir);

  const tally = pruneNativePrebuilds({ outDir, targets: [{ platform: "darwin", arch: "x64" }] });

  assert.ok(!fs.existsSync(path.join(modulesDir, "better-sqlite3", "deps")));
  assert.ok(!fs.existsSync(path.join(modulesDir, "better-sqlite3", "binding.gyp")));
  assert.ok(fs.existsSync(path.join(modulesDir, "better-sqlite3", "lib", "binding.js")));
  assert.ok(fs.existsSync(path.join(modulesDir, "argon2", "argon2.cjs")));
  assert.equal(tally.buildInputs, 2);
});

test("pruneNativePrebuilds: a package with NO prebuilds/ keeps its binding.gyp — it may compile at install", () => {
  const outDir = path.join(tempDir(), "out");
  const modulesDir = path.join(outDir, "node_modules");
  writePackage(path.join(modulesDir, "compiles-itself"), {});
  writeStagedFiles(outDir, [path.join("compiles-itself", "binding.gyp"), path.join("compiles-itself", "deps", "lib.c")]);

  const tally = pruneNativePrebuilds({ outDir, targets: [{ platform: "darwin", arch: "x64" }] });

  assert.ok(fs.existsSync(path.join(modulesDir, "compiles-itself", "binding.gyp")));
  assert.ok(fs.existsSync(path.join(modulesDir, "compiles-itself", "deps", "lib.c")));
  assert.deepEqual(tally, { prebuilds: 0, buildInputs: 0, bytes: 0 });
});

test("pruneNativePrebuilds: an entry it cannot identify is kept, never read as a mismatch", () => {
  const outDir = path.join(tempDir(), "out");
  const modulesDir = stageNativePackages(outDir);
  writeStagedFiles(outDir, [path.join("better-sqlite3", "prebuilds", "node-v127-darwin-x64.node")]);

  pruneNativePrebuilds({ outDir, targets: [{ platform: "darwin", arch: "x64" }] });

  assert.ok(fs.existsSync(path.join(modulesDir, "better-sqlite3", "prebuilds", "node-v127-darwin-x64.node")));
});

test("pruneNativePrebuilds: refuses a target no prebuild serves, with the exact message, rather than shipping an unloadable app", () => {
  const outDir = path.join(tempDir(), "out");
  stageNativePackages(outDir);

  assert.throws(
    () => pruneNativePrebuilds({ outDir, targets: [{ platform: "darwin", arch: "ppc64" }] }),
    (err) => {
      assert.equal(
        // `as`: pruneNativePrebuilds only ever throws a plain Error.
        (err as Error).message,
        "argon2 ships no prebuild for darwin-ppc64, so the packaged app could not load it. Set TOVU_TARGET_PLATFORM / TOVU_TARGET_ARCH to the architecture electron-builder will pack."
      );
      return true;
    }
  );
});

test("pruneNativePrebuilds: a staged tree with no node_modules at all is a no-op, not a crash", () => {
  const outDir = path.join(tempDir(), "out");
  fs.mkdirSync(outDir, { recursive: true });

  assert.deepEqual(pruneNativePrebuilds({ outDir, targets: [{ platform: "darwin", arch: "x64" }] }), { prebuilds: 0, buildInputs: 0, bytes: 0 });
});

test("diskBytes: a single file returns its on-disk block size, not its apparent content length", () => {
  const dir = tempDir();
  const file = path.join(dir, "small.txt");
  fs.writeFileSync(file, "x");

  // Reference value taken from the SAME stat call diskBytes makes, not a hardcoded block size —
  // see the file header on why this suite never assumes a filesystem's block size.
  assert.equal(diskBytes(file), fs.lstatSync(file).blocks * 512);
});

test("diskBytes: a directory sums the on-disk size of its files, recursing into subdirectories", () => {
  const dir = tempDir();
  const top = path.join(dir, "top.txt");
  const nested = path.join(dir, "nested", "deep.txt");
  fs.writeFileSync(top, "top");
  fs.mkdirSync(path.dirname(nested), { recursive: true });
  fs.writeFileSync(nested, "deep-content");

  const expected = fs.lstatSync(top).blocks * 512 + fs.lstatSync(nested).blocks * 512;
  assert.equal(diskBytes(dir), expected);
});

test("resolveNpmLsCommand: prefers execPath + npm_execpath when npm set it, on every platform", () => {
  const win = resolveNpmLsCommand({ execPath: "/usr/bin/node", platform: "win32", env: { npm_execpath: "/usr/lib/npm-cli.js" } });
  assert.deepEqual(win, { command: "/usr/bin/node", args: ["/usr/lib/npm-cli.js", "ls", "--omit=dev", "--parseable", "--all"], shell: false });

  const mac = resolveNpmLsCommand({ execPath: "/usr/bin/node", platform: "darwin", env: { npm_execpath: "/usr/lib/npm-cli.js" } });
  assert.deepEqual(mac, { command: "/usr/bin/node", args: ["/usr/lib/npm-cli.js", "ls", "--omit=dev", "--parseable", "--all"], shell: false });
});

test("resolveNpmLsCommand: falls back to a shell-less npm off win32 when npm_execpath is unset", () => {
  assert.deepEqual(resolveNpmLsCommand({ execPath: "/usr/bin/node", platform: "darwin", env: {} }), {
    command: "npm",
    args: ["ls", "--omit=dev", "--parseable", "--all"],
    shell: false,
  });
});

test("resolveNpmLsCommand: falls back to npm through the platform shell on win32 when npm_execpath is unset", () => {
  assert.deepEqual(resolveNpmLsCommand({ execPath: "C:\\node.exe", platform: "win32", env: {} }), {
    command: "npm",
    args: ["ls", "--omit=dev", "--parseable", "--all"],
    shell: true,
  });
});

test("parseNpmLsPaths reads LF output: unique, sorted, relative to node_modules, other lines ignored", () => {
  const stdout = ["/repo", "/repo/node_modules/zod", "/repo/node_modules/@scope/pkg", "/repo/node_modules/zod", ""].join("\n");
  assert.deepEqual(parseNpmLsPaths(stdout, "/repo/node_modules", "/"), ["@scope/pkg", "zod"]);
});

test("parseNpmLsPaths reads CRLF output (npm on Windows) without a trailing carriage return on any name", () => {
  const stdout = ["C:\\repo", "C:\\repo\\node_modules\\zod", "C:\\repo\\node_modules\\@scope\\pkg", ""].join("\r\n");
  assert.deepEqual(parseNpmLsPaths(stdout, "C:\\repo\\node_modules", "\\"), ["@scope\\pkg", "zod"]);
});
