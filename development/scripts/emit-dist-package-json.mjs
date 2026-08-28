/**
 * Emit `dist/package.json` (so the compiled output can resolve `#src/*` specifiers) and
 * `dist/runtime-manifest.json` (so an external host — today, only Tovu-Runner — can locate
 * the CLI entry point and check compatibility without hardcoding a path into its own source).
 *
 * WHY THE MANIFEST HAS TO EXIST (Phase 0 restructure, 2026-08-27, ADS-memory consensus report
 * 2026-08-27-tovu-apps-website-restructure-consensus-report.md): Tovu-Runner's `tovu-cli.ts`
 * used to hardcode the literal path `dist/src/cli/main.js` in two places (dev and packaged mode),
 * which breaks the moment `src/` is renamed in a later phase. `runtime-manifest.json`'s `cliEntry`
 * is read from THIS package's own `bin.tovu` field, so a rename that updates `bin.tovu` updates
 * every consumer automatically — no second place to remember. `cliEntry` is relative to the Tovu
 * repo root (the same convention `bin.tovu` itself uses), which resolves correctly whether joined
 * onto a dev-mode sibling checkout's root or onto a packaged app's staged `Resources/tovu/` root,
 * since `development/scripts/stage-tovu-runtime.mjs` stages `dist/` (and therefore this manifest,
 * which lives inside it) as a unit.
 *
 * WHY THIS FILE HAS TO EXIST:
 * Node resolves a `#`-prefixed specifier against the closest package.json above the *importing
 * file*. Source files under `src/` therefore resolve against the repo-root package.json, whose
 * mapping points at TypeScript (`"#src/*": "./src/*.ts"`) — correct for `tsx` in dev and for
 * `tsc`'s own resolution. The compiled files under `dist/src/` would resolve against that same
 * root mapping and try to `require()` a `.ts` file, which fails at boot. Dropping a second
 * package.json into `dist/` re-scopes them: `dist/src/**` now resolves against `dist/package.json`
 * and its `"#src/*": "./src/*.js"` mapping (relative to `dist/`, i.e. `dist/src/*.js`).
 *
 * The result is one specifier that is correct in both trees with no conditions, no `--conditions`
 * flag, and no per-script opt-in that someone can forget.
 *
 * The mapping is DERIVED from the root package.json rather than hardcoded, so adding or renaming
 * an `imports` entry cannot leave the two out of sync. `type` is carried over for the same reason:
 * a nested package.json establishes a new package scope, and if it disagreed with the root about
 * CommonJS vs ESM the built output would load under the wrong module system.
 *
 * Run by `npm run build` after `tsc`.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const rootPkgPath = path.join(repoRoot, "package.json");
const distDir = path.join(repoRoot, "dist");

const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));

if (rootPkg.imports === undefined) {
  throw new Error(
    `No "imports" field in ${rootPkgPath}. The #src/* subpath mapping is required for the ` +
      `compiled output to resolve; refusing to emit a dist/package.json that would silently ` +
      `resolve nothing.`,
  );
}

/** Retarget every mapping from the TypeScript sources to their compiled JavaScript siblings. */
function toCompiled(target) {
  if (typeof target === "string") {
    if (!target.endsWith(".ts")) {
      throw new Error(
        `Unexpected imports target ${JSON.stringify(target)} in package.json: expected it to ` +
          `point at a .ts source file so it could be retargeted to .js for dist/.`,
      );
    }
    return `${target.slice(0, -".ts".length)}.js`;
  }
  if (target !== null && typeof target === "object") {
    return Object.fromEntries(Object.entries(target).map(([cond, v]) => [cond, toCompiled(v)]));
  }
  throw new Error(`Unsupported imports target: ${JSON.stringify(target)}`);
}

const distPkg = {
  name: `${rootPkg.name}-dist`,
  version: rootPkg.version,
  private: true,
  type: rootPkg.type ?? "commonjs",
  imports: Object.fromEntries(
    Object.entries(rootPkg.imports).map(([key, target]) => [key, toCompiled(target)]),
  ),
};

mkdirSync(distDir, { recursive: true });
writeFileSync(path.join(distDir, "package.json"), `${JSON.stringify(distPkg, null, 2)}\n`, "utf8");

console.log(`Wrote dist/package.json (imports: ${Object.keys(distPkg.imports).join(", ")})`);

if (rootPkg.bin?.tovu === undefined) {
  throw new Error(`No "bin.tovu" field in ${rootPkgPath}. runtime-manifest.json's cliEntry has nowhere to read from.`);
}

const minNodeMajor = /^>=\s*(\d+)\./.exec(rootPkg.engines?.node ?? "")?.[1];
if (minNodeMajor === undefined) {
  throw new Error(`Could not parse a ">=<major>." minimum from ${rootPkgPath}'s engines.node (${rootPkg.engines?.node}).`);
}

const tovuSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();

/** Bumped only when the manifest's own shape changes in a way a consumer must branch on. */
const RUNTIME_MANIFEST_SCHEMA_VERSION = 1;

const runtimeManifest = {
  schemaVersion: RUNTIME_MANIFEST_SCHEMA_VERSION,
  cliEntry: rootPkg.bin.tovu,
  tovuVersion: rootPkg.version,
  tovuSha,
  minNodeMajor: Number(minNodeMajor),
};

writeFileSync(path.join(distDir, "runtime-manifest.json"), `${JSON.stringify(runtimeManifest, null, 2)}\n`, "utf8");

console.log(`Wrote dist/runtime-manifest.json (cliEntry: ${runtimeManifest.cliEntry}, tovuVersion: ${runtimeManifest.tovuVersion})`);
