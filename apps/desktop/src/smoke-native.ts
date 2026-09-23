/**
 * @file Path resolution and result parsing for the native-module smoke check (release plan, S3):
 * proves `better-sqlite3`, `sharp`, and `argon2` actually load and run inside the SHIPPED, signed
 * binary on the CPU that just built it — not in the dev `node_modules` this repo's own tests run
 * against. `apps/desktop/build/entitlements.mac.plist`'s 2026-09-11 header comment records the
 * manual version of exactly this check (a real SQLite roundtrip, `sharp` + libvips load, `argon2`
 * load, all via `ELECTRON_RUN_AS_NODE=1` against the packaged binary from a cwd outside the repo);
 * this module is that method turned into a script `scripts/smoke-native.ts` runs on every release
 * build instead of by hand once.
 *
 * Kept pure and dependency-free (no `node:fs`, no `node:child_process`) so both the "where do the
 * binary and its staged native modules live" question and the "did the child process's JSON report
 * actually mean success" question are provable by unit test alone — the spawn itself is `scripts/
 * smoke-native.ts`'s job, deliberately outside this module, exactly as `resolveAsarPath` in
 * `scripts/verify-package.ts` stays outside `asar-verify.ts`.
 */
import path from "node:path";

/** Where the smoke check found the packaged executable and its staged `tovu/node_modules`. */
interface SmokeNativeTargets {
  executablePath: string;
  nodeModulesDir: string;
}

/** One native module's smoke result, as the spawned child process reports it. */
interface SmokeCheckOutcome {
  ok: boolean;
  error?: string;
}

/** {@link parseSmokeOutput}'s result: the per-module outcomes plus one overall verdict. */
interface SmokeCheckResult {
  ok: boolean;
  betterSqlite3: SmokeCheckOutcome;
  sharp: SmokeCheckOutcome;
  argon2: SmokeCheckOutcome;
}

/**
 * Locates the packaged executable and its staged `tovu/node_modules` under whichever layout
 * electron-builder actually produced beneath `platformDir` (CI passes `release`, the shared output
 * dir every matrix row builds into): a macOS bundle under any `mac`-prefixed output directory
 * (`<platformDir>/<mac-prefixed>/Tovu.app/Contents/MacOS/Tovu`, native modules staged at
 * `.../Contents/Resources/tovu/node_modules`, mirroring `electron-builder.yml`'s `extraResources`
 * "to: tovu/node_modules" entry), or a Windows unpacked build
 * (`<platformDir>/win-unpacked/Tovu.exe`, native modules at
 * `<platformDir>/win-unpacked/resources/tovu/node_modules`). A mac-prefixed directory is checked
 * first and wins if both shapes are somehow present — the real CI matrix only ever builds one OS
 * per runner, so this ordering only matters for determinism, not correctness.
 *
 * Pure: `entryNames` is the caller's already-`readdirSync`'d listing of `platformDir`'s immediate
 * children, so this function does no filesystem I/O itself and is testable with plain arrays.
 *
 * @param platformDir absolute or caller-resolved path to the shared build output directory.
 * @param entryNames the immediate child names of `platformDir` (not full paths).
 * @throws if no entry name matches either known layout.
 * @complexity O(n) in `entryNames`.
 */
export function resolveSmokeTargets(platformDir: string, entryNames: string[]): SmokeNativeTargets {
  const macDir = entryNames.find((name) => name.startsWith("mac"));
  if (macDir) {
    const appDir = path.join(platformDir, macDir, "Tovu.app");
    return {
      executablePath: path.join(appDir, "Contents", "MacOS", "Tovu"),
      nodeModulesDir: path.join(appDir, "Contents", "Resources", "tovu", "node_modules"),
    };
  }
  if (entryNames.includes("win-unpacked")) {
    const winDir = path.join(platformDir, "win-unpacked");
    return {
      executablePath: path.join(winDir, "Tovu.exe"),
      nodeModulesDir: path.join(winDir, "resources", "tovu", "node_modules"),
    };
  }
  throw new Error(
    `smoke-native: no mac-prefixed *.app layout or win-unpacked layout found under ${platformDir} — did electron-builder run?`,
  );
}

/**
 * Builds the inline script the CLI spawns inside the packaged, signed binary
 * (`ELECTRON_RUN_AS_NODE=1 <executablePath> -e <this script>`): opens an in-memory
 * `better-sqlite3` database and does a real CREATE/INSERT/SELECT roundtrip, calls
 * `sharp().metadata()` on a 1x1 PNG buffer, and does an `argon2.hash`/`argon2.verify` roundtrip.
 * Always prints exactly one JSON line and sets its own exit code — never throws uncaught, since an
 * uncaught throw would give the CLI wrapper an empty stdout and no per-module detail to report.
 *
 * Each package is `require()`d by an ABSOLUTE path under `nodeModulesDir` rather than a bare
 * specifier — the packaged binary's own `require` has no reason to resolve `"better-sqlite3"` to
 * the staged payload location, and a bare specifier would instead silently resolve (or fail to
 * resolve) against whatever `node_modules` happens to be on the module search path from the
 * spawned cwd. Every embedded path is `JSON.stringify`d, never string-concatenated, so a
 * `nodeModulesDir` containing a quote or backslash cannot break out of the string literal it is
 * embedded in (see the test covering a deliberately adversarial path).
 *
 * @param nodeModulesDir absolute path to the staged `tovu/node_modules`, as {@link resolveSmokeTargets} resolves it.
 * @complexity O(1) — fixed-size template, independent of input length beyond the embedded path itself.
 */
export function buildSmokeScript(nodeModulesDir: string): string {
  const requirePath = (packageName: string): string => JSON.stringify(path.join(nodeModulesDir, packageName));
  // A 1x1 transparent PNG, base64-encoded, so `sharp` has real image bytes to decode without
  // shipping a binary fixture file alongside this source module.
  const onePixelPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

  return `
(async () => {
  const result = {};

  try {
    const Database = require(${requirePath("better-sqlite3")});
    const db = new Database(":memory:");
    db.exec("CREATE TABLE smoke (id INTEGER, v TEXT)");
    db.prepare("INSERT INTO smoke (id, v) VALUES (?, ?)").run(1, "smoke-native");
    const row = db.prepare("SELECT v FROM smoke WHERE id = ?").get(1);
    db.close();
    result.betterSqlite3 = { ok: Boolean(row && row.v === "smoke-native") };
  } catch (error) {
    result.betterSqlite3 = { ok: false, error: String((error && error.message) || error) };
  }

  try {
    const sharp = require(${requirePath("sharp")});
    const onePixelPng = Buffer.from(${JSON.stringify(onePixelPngBase64)}, "base64");
    const meta = await sharp(onePixelPng).metadata();
    result.sharp = { ok: Boolean(meta && meta.width === 1 && meta.height === 1) };
  } catch (error) {
    result.sharp = { ok: false, error: String((error && error.message) || error) };
  }

  try {
    const argon2 = require(${requirePath("argon2")});
    const hash = await argon2.hash("smoke-native-check");
    const matches = await argon2.verify(hash, "smoke-native-check");
    result.argon2 = { ok: matches === true };
  } catch (error) {
    result.argon2 = { ok: false, error: String((error && error.message) || error) };
  }

  console.log(JSON.stringify(result));
  process.exit(Object.values(result).every((r) => r.ok) ? 0 : 1);
})().catch((error) => {
  console.error(String((error && error.message) || error));
  process.exit(1);
});
`;
}

/**
 * Parses the one JSON line {@link buildSmokeScript}'s spawned process prints, and decides the
 * overall verdict: every one of `betterSqlite3`, `sharp`, `argon2` must report `ok: true`. Malformed
 * stdout (empty, non-JSON, or JSON that is not an object — e.g. the process crashed before or
 * between checks, or printed unrelated noise) is a parse failure for the whole result, not a silent
 * pass; and a key genuinely absent from an otherwise-valid object is treated as that check having
 * failed, not skipped, so a child that dies partway through cannot look like partial success.
 *
 * @param stdout the spawned process's captured stdout.
 * @throws if `stdout` cannot be parsed as a JSON value at all.
 * @complexity O(1) — fixed three keys.
 */
export function parseSmokeOutput(stdout: string): SmokeCheckResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch (error) {
    throw new Error(`smoke-native: could not parse smoke output as JSON (${(error as Error).message})\n---\n${stdout}`);
  }

  const record: Record<string, unknown> =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};

  const readOutcome = (key: string): SmokeCheckOutcome => {
    const raw = record[key];
    if (raw !== null && typeof raw === "object" && "ok" in (raw as object)) {
      const candidate = raw as { ok?: unknown; error?: unknown };
      return {
        ok: candidate.ok === true,
        error: typeof candidate.error === "string" ? candidate.error : undefined,
      };
    }
    return { ok: false, error: `missing "${key}" result in smoke output` };
  };

  const betterSqlite3 = readOutcome("betterSqlite3");
  const sharp = readOutcome("sharp");
  const argon2 = readOutcome("argon2");

  return { ok: betterSqlite3.ok && sharp.ok && argon2.ok, betterSqlite3, sharp, argon2 };
}

export type { SmokeCheckOutcome, SmokeCheckResult, SmokeNativeTargets };
