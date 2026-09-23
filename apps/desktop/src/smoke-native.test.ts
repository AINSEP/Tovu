/**
 * @file Tests for `smoke-native.ts`. Per the release plan (S3): unit-test the path resolution and
 * the result parsing, not the spawn — no real executable is ever run here, and no packaged bundle
 * is required to exist on disk. `scripts/smoke-native.ts` (untested by this suite, like
 * `scripts/verify-package.ts`'s own `resolveAsarPath`) is the thin CLI that does the actual
 * `readdirSync` + `spawnSync` against those pure functions.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildSmokeScript, parseSmokeOutput, resolveSmokeTargets } from "./smoke-native.ts";

// --- resolveSmokeTargets: pure path resolution from an already-listed directory -----------------

test("resolves a mac-prefixed *.app layout (e.g. release/mac-arm64/Tovu.app)", () => {
  const targets = resolveSmokeTargets("/release", ["mac-arm64", "mac-arm64.blockmap"]);
  assert.equal(targets.executablePath, path.join("/release", "mac-arm64", "Tovu.app", "Contents", "MacOS", "Tovu"));
  assert.equal(
    targets.nodeModulesDir,
    path.join("/release", "mac-arm64", "Tovu.app", "Contents", "Resources", "tovu", "node_modules"),
  );
});

test("resolves a plain 'mac' output directory the same way as 'mac-arm64'", () => {
  const targets = resolveSmokeTargets("/release", ["mac"]);
  assert.equal(targets.executablePath, path.join("/release", "mac", "Tovu.app", "Contents", "MacOS", "Tovu"));
});

test("resolves a win-unpacked layout when no mac-prefixed directory is present", () => {
  const targets = resolveSmokeTargets("/release", ["win-unpacked", "builder-effective-config.yaml"]);
  assert.equal(targets.executablePath, path.join("/release", "win-unpacked", "Tovu.exe"));
  assert.equal(
    targets.nodeModulesDir,
    path.join("/release", "win-unpacked", "resources", "tovu", "node_modules"),
  );
});

test("a mac-prefixed directory takes precedence over win-unpacked when both are present", () => {
  // Never happens in the real CI matrix (one OS per runner), but the choice must be deterministic
  // rather than dependent on directory-listing order.
  const targets = resolveSmokeTargets("/release", ["win-unpacked", "mac-x64"]);
  assert.equal(targets.executablePath, path.join("/release", "mac-x64", "Tovu.app", "Contents", "MacOS", "Tovu"));
});

test("throws a clear error when neither layout is found under platformDir", () => {
  assert.throws(
    () => resolveSmokeTargets("/release", ["builder-debug.yml", "some-other-dir"]),
    /no mac.* or win-unpacked.* layout found under \/release/,
  );
});

test("an entry merely starting with 'mac' as a substring elsewhere is not mistaken for the mac layout (e.g. 'macos-notes')", () => {
  // Guards the prefix match itself: `startsWith("mac")` on the raw entry name, not a substring
  // search, so an unrelated leftover directory sharing a "mac" substring never triggers a wrong
  // resolution path silently.
  assert.throws(() => resolveSmokeTargets("/release", ["not-macos-related"]), /no mac.* or win-unpacked.* layout found/);
});

// --- parseSmokeOutput: pure result parsing, no spawn ---------------------------------------------

test("all three checks ok -> overall ok true", () => {
  const stdout = JSON.stringify({
    betterSqlite3: { ok: true },
    sharp: { ok: true },
    argon2: { ok: true },
  });
  const result = parseSmokeOutput(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.betterSqlite3.ok, true);
  assert.equal(result.sharp.ok, true);
  assert.equal(result.argon2.ok, true);
});

test("any single check failing makes the overall result false, and the failing check's error is preserved", () => {
  const stdout = JSON.stringify({
    betterSqlite3: { ok: true },
    sharp: { ok: false, error: "libvips not found" },
    argon2: { ok: true },
  });
  const result = parseSmokeOutput(stdout);
  assert.equal(result.ok, false);
  assert.equal(result.sharp.ok, false);
  assert.equal(result.sharp.error, "libvips not found");
  assert.equal(result.betterSqlite3.ok, true, "an unrelated passing check must not be dragged down");
});

test("malformed JSON is a parse failure, not a silent pass -- the raw stdout is included for diagnosis", () => {
  assert.throws(() => parseSmokeOutput("not json at all"), /could not parse smoke output as JSON/);
  try {
    parseSmokeOutput("not json at all");
    assert.fail("expected a throw");
  } catch (error) {
    assert.match((error as Error).message, /not json at all/);
  }
});

test("empty stdout (process crashed before printing) is a parse failure", () => {
  assert.throws(() => parseSmokeOutput(""), /could not parse smoke output as JSON/);
});

test("a missing check key (e.g. the child process died between checks) is treated as a failure, not skipped", () => {
  const stdout = JSON.stringify({ betterSqlite3: { ok: true }, sharp: { ok: true } }); // argon2 absent
  const result = parseSmokeOutput(stdout);
  assert.equal(result.ok, false);
  assert.equal(result.argon2.ok, false);
  assert.match(result.argon2.error ?? "", /missing/);
});

test("JSON that parses but is not an object (e.g. a bare number or array) is treated as every check missing, not a crash", () => {
  const result = parseSmokeOutput("42");
  assert.equal(result.ok, false);
  assert.equal(result.betterSqlite3.ok, false);
  assert.equal(result.sharp.ok, false);
  assert.equal(result.argon2.ok, false);
});

// --- buildSmokeScript: pure string generation -- syntax-checked, never executed -------------------

test("embeds the resolved node_modules dir as a JSON-quoted absolute require path for each package", () => {
  const script = buildSmokeScript("/release/mac-arm64/Tovu.app/Contents/Resources/tovu/node_modules");
  for (const pkg of ["better-sqlite3", "sharp", "argon2"]) {
    const expectedRequire = JSON.stringify(path.join("/release/mac-arm64/Tovu.app/Contents/Resources/tovu/node_modules", pkg));
    assert.ok(script.includes(expectedRequire), `script must require ${pkg} from the resolved node_modules dir`);
  }
});

test("a node_modules dir containing a quote or backslash is embedded safely (JSON.stringify escaping), not string-concatenated raw", () => {
  const dodgy = String.raw`C:\Program Files\Tovu"; process.exit(0); //`;
  const script = buildSmokeScript(dodgy);
  // `new Function` only PARSES the body; the top-level IIFE inside is never invoked because the
  // returned function is never called. A syntax error here means the embedding broke out of the
  // string literal it was meant to stay inside.
  assert.doesNotThrow(() => new Function(script), "the generated script must remain syntactically valid");
});

test("the generated script is syntactically valid JavaScript (constructible, never invoked)", () => {
  const script = buildSmokeScript("/some/node_modules");
  assert.doesNotThrow(() => new Function(script));
});
