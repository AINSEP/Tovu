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
 * file*. Source files under `apps/website/src/` therefore resolve against the repo-root
 * package.json, whose mapping points at TypeScript (`"#src/*": "./apps/website/src/*.ts"`) —
 * correct for `tsx` in dev and for `tsc`'s own resolution. The compiled files under `dist/src/`
 * would resolve against that same root mapping and try to `require()` a `.ts` file, which fails
 * at boot. Dropping a second package.json into `dist/` re-scopes them: `dist/src/**` now resolves
 * against `dist/package.json` and its own `"#src/*"` mapping (relative to `dist/`).
 *
 * The result is one specifier that is correct in both trees with no conditions, no `--conditions`
 * flag, and no per-script opt-in that someone can forget.
 *
 * The mapping is DERIVED from the root package.json rather than hardcoded, so adding or renaming
 * an `imports` entry cannot leave the two out of sync. `type` is carried over for the same reason:
 * a nested package.json establishes a new package scope, and if it disagreed with the root about
 * CommonJS vs ESM the built output would load under the wrong module system.
 *
 * `tsconfig.json`'s `rootDir` also has to be read, not assumed: `tsc` mirrors compiled output
 * relative to `rootDir`, not relative to the repo root, so a source target one directory level
 * "deeper" than `rootDir` (e.g. `./apps/website/src/*.ts` with `rootDir: "apps/website"`) compiles
 * to `dist/src/*.js`, not `dist/apps/website/src/*.js`. A naive `.ts` -> `.js` swap on the raw
 * import target string produces the latter, wrong path — this bit a rename once already (Phase 2
 * of the restructure above moved the source target from `./src/*.ts` to `./apps/website/src/*.ts`
 * without `rootDir` changing shape at the same time, at which point the two stopped coincidentally
 * matching). Deriving from `rootDir` instead of hardcoding a prefix-strip keeps this correct
 * through the *next* rename too, not just this one.
 *
 * Run by `npm run build` after `tsc`.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Strips a `./<rootDir>/` prefix from a compiled (`.js`) import target, mirroring how `tsc`
 * emits output relative to `rootDir` rather than relative to the repo root. No-op if the target
 * doesn't start with that prefix (nothing to strip, or `rootDir` is the repo root itself).
 */
export function stripRootDirPrefix(compiledTarget, rootDir) {
  const normalizedRootDir = rootDir.replace(/^\.?\/+/, "").replace(/\/+$/, "");
  if (normalizedRootDir === "") {
    return compiledTarget;
  }
  const prefix = `./${normalizedRootDir}/`;
  return compiledTarget.startsWith(prefix) ? `./${compiledTarget.slice(prefix.length)}` : compiledTarget;
}

/**
 * Retargets one `imports` mapping entry from its TypeScript source to the path its compiled
 * `.js` sibling actually lands at under `dist/`, given `tsconfig.json`'s `rootDir`.
 */
export function toCompiled(target, rootDir) {
  if (typeof target === "string") {
    if (!target.endsWith(".ts")) {
      throw new Error(
        `Unexpected imports target ${JSON.stringify(target)} in package.json: expected it to ` +
          `point at a .ts source file so it could be retargeted to .js for dist/.`,
      );
    }
    const compiled = `${target.slice(0, -".ts".length)}.js`;
    return stripRootDirPrefix(compiled, rootDir);
  }
  if (target !== null && typeof target === "object") {
    return Object.fromEntries(Object.entries(target).map(([cond, v]) => [cond, toCompiled(v, rootDir)]));
  }
  throw new Error(`Unsupported imports target: ${JSON.stringify(target)}`);
}

/** Retargets every entry in a root package.json's `imports` field for dist/'s package.json. */
export function deriveDistImports(rootPkgImports, rootDir) {
  return Object.fromEntries(
    Object.entries(rootPkgImports).map(([key, target]) => [key, toCompiled(target, rootDir)]),
  );
}


/**
 * Resolves the commit SHA recorded in `runtime-manifest.json`. `git rev-parse HEAD` only works
 * when a `.git` directory is present, which the Docker build stage deliberately excludes
 * (`Dockerfile.dockerignore`'s `.git` line) -- so CI passes it in as `TOVU_BUILD_SHA` (see
 * `fly-deploy.yml`, forwarded into the image via the Dockerfile's matching `ARG`/`ENV`) and this
 * prefers that over shelling out to git. Local dev builds never set the env var, so they fall
 * through to `git rev-parse HEAD` exactly as before. If neither is available, the SHA degrades to
 * `"unknown"` LOUDLY (a warning on stderr) rather than either crashing the build or writing that
 * placeholder into the manifest with no trace of why -- the field is a provenance guarantee
 * (ADR-020 5), so a reader must be able to tell the difference between "verified" and "unknown".
 */
function resolveTovuSha(repoRoot) {
  const envSha = process.env.TOVU_BUILD_SHA;
  if (envSha) {
    return envSha.trim();
  }
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch (err) {
    console.warn(
      `WARNING: could not resolve tovuSha for runtime-manifest.json -- no TOVU_BUILD_SHA env var, ` +
        `and \`git rev-parse HEAD\` failed (${err.message.trim().split("\n")[0]}). Writing "unknown".`,
    );
    return "unknown";
  }
}


function main() {
  const repoRoot = path.resolve(import.meta.dirname, "..", "..");
  const rootPkgPath = path.join(repoRoot, "package.json");
  const tsconfigPath = path.join(repoRoot, "tsconfig.json");
  const distDir = path.join(repoRoot, "dist");

  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));

  if (rootPkg.imports === undefined) {
    throw new Error(
      `No "imports" field in ${rootPkgPath}. The #src/* subpath mapping is required for the ` +
        `compiled output to resolve; refusing to emit a dist/package.json that would silently ` +
        `resolve nothing.`,
    );
  }

  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  const rootDir = tsconfig.compilerOptions?.rootDir;
  if (rootDir === undefined) {
    throw new Error(
      `No compilerOptions.rootDir in ${tsconfigPath}. dist/package.json's imports mapping needs ` +
        `it to know where tsc's compiled output actually lands relative to dist/.`,
    );
  }

  const distPkg = {
    name: `${rootPkg.name}-dist`,
    version: rootPkg.version,
    private: true,
    type: rootPkg.type ?? "commonjs",
    imports: deriveDistImports(rootPkg.imports, rootDir),
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

  const tovuSha = resolveTovuSha(repoRoot);

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
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
