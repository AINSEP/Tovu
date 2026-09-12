/**
 * @file Filesystem-reading/writing helpers `scripts/stage-payload.mjs` uses to walk source trees,
 * resolve Jini's pnpm-hoisted transitive dependencies, and verify the staged tree is complete —
 * extracted for the same reason `shell-staleness.js` was: `stage-payload.mjs` itself runs its
 * entire staging pipeline (real `rmSync`/`cpSync` against the live repo) the moment it is
 * imported, so nothing defined inside it can be exercised by a test that imports the script
 * directly. **This module has no import-time side effects at all** — importing it does nothing to
 * the filesystem; every effectful function here only acts when called, with paths the caller
 * supplies.
 *
 * `stageTransitiveDependencies` and `assertClosureComplete` (added in later commits) take `outDir`
 * as an explicit parameter rather than closing over `scripts/stage-payload.mjs`'s module-level
 * constant of the same name, so a test can point them at a throwaway `fs.mkdtempSync` directory
 * instead of the real `staging/tovu-payload` tree.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import path from "node:path";

import { isBundleInput } from "./shell-staleness.js";

/**
 * Top-level `node_modules` entries never staged, each for a reason that was checked rather than
 * assumed:
 *
 * - `playwright` / `playwright-core` / `@playwright` — a production dependency of Tovu, but its ONLY
 *   importer is `apps/website/src/features/site-evidence/playwright-browser.ts:144`, which reaches
 *   it through a DYNAMIC `await import("playwright")` inside a try/catch and degrades to
 *   `{available: false, reason}`. A static import would crash the server at load; a dynamic one
 *   does not. The driver is ~12 MB and the browser it drives is a separate ~150 MB download that a
 *   desktop app has no business shipping.
 * - `@oven` — 132 MB of Bun runtimes, `optionalDependencies` of `@modelcontextprotocol/ext-apps`,
 *   which uses Bun only to build and test ITSELF. Reached only through the `@jini-ai/*` pnpm store.
 * - `@rollup` — same package, same root cause: every `@rollup/rollup-<platform>` native listed under
 *   its `optionalDependencies`.
 */
export const EXCLUDED_PACKAGES = new Set(["playwright", "playwright-core", "@playwright", "@oven", "@rollup"]);

export function isExcluded(name) {
  const [head] = name.split(path.sep);
  return EXCLUDED_PACKAGES.has(head) || EXCLUDED_PACKAGES.has(name);
}

export function stageDir(src, dest, dropNestedModules) {
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    dereference: true,
    filter: dropNestedModules ? (from) => path.basename(from) !== "node_modules" : undefined,
  });
}

export function declaredDependencies(packageDir) {
  const manifestPath = path.join(packageDir, "package.json");
  if (!existsSync(manifestPath)) return [];
  return Object.keys(JSON.parse(readFileSync(manifestPath, "utf8")).dependencies ?? {});
}

/** Node's own upward `node_modules` walk — the only way to find a package in pnpm's store. */
export function findPackageDir(fromDir, depName) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", depName);
    if (existsSync(path.join(candidate, "package.json"))) return realpathSync(candidate);
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Resolves one `from -> dep` dependency edge and, unless `dep` is excluded, already visited, or
 * unresolvable, stages it (skipping the copy — but not the walk — when its destination is already
 * staged). Returns `undefined` when there is nothing further to walk from this edge, or the
 * resolved package's real directory plus whether staging it actually copied anything (as opposed
 * to finding it already there).
 */
function resolveDependencyEdge(from, dep, { outDir, visited }) {
  if (isExcluded(dep)) return undefined;
  const resolved = findPackageDir(from, dep);
  if (resolved === undefined || visited.has(resolved)) return undefined;
  visited.add(resolved);
  const dest = path.join(outDir, "node_modules", dep);
  const alreadyStaged = existsSync(dest);
  if (!alreadyStaged) stageDir(resolved, dest, true);
  return { resolved, staged: !alreadyStaged };
}

/**
 * Jini's packages declare ordinary npm dependencies of their own — `@jini-ai/devops` needs `undici`
 * — that exist only inside Jini's pnpm store. Tovu never names them, so the caller's own
 * `productionDependencyPaths()` never sees them and stages none of them.
 *
 * Takes `outDir` explicitly (rather than closing over `scripts/stage-payload.mjs`'s module-level
 * constant of the same name) so a test can point it at a throwaway directory.
 */
export function stageTransitiveDependencies({ roots, outDir }) {
  const visited = new Set(roots);
  const queue = [...roots];
  let count = 0;
  while (queue.length > 0) {
    const from = queue.pop();
    for (const dep of declaredDependencies(from)) {
      const edge = resolveDependencyEdge(from, dep, { outDir, visited });
      if (edge === undefined) continue;
      queue.push(edge.resolved);
      if (edge.staged) count += 1;
    }
  }
  return count;
}

export function stagedPackageDirs(modulesDir) {
  return readdirSync(modulesDir)
    .filter((entry) => !entry.startsWith("."))
    .flatMap((entry) => {
      const full = path.join(modulesDir, entry);
      return entry.startsWith("@") ? readdirSync(full).map((scoped) => path.join(full, scoped)) : [full];
    });
}

/**
 * Every declared dependency of every staged package must resolve INSIDE the staged tree.
 *
 * Without this the tree can ship incomplete and still pass every local test: `staging/` sits inside
 * this repo, so Node's upward walk quietly satisfies a missing import from the repo's OWN
 * `node_modules`. The `.app` only breaks once it is moved somewhere else, which is every real
 * install. A static check is the honest guard, because no in-repo runtime test can distinguish
 * "resolved from the bundle" from "resolved from an ancestor".
 *
 * Deliberately excluded packages are exempt — they are absent on purpose, not by accident.
 *
 * Takes `outDir` explicitly (rather than closing over `scripts/stage-payload.mjs`'s module-level
 * constant of the same name) so a test can point it at a throwaway directory.
 *
 * Throws a plain `Error` on an incomplete closure, rather than calling
 * `scripts/stage-payload.mjs`'s own `fail()` (which writes to stderr and calls `process.exit(1)`) —
 * `process.exit` inside a function under test kills the test runner itself. The script's own call
 * site catches this and forwards the same message to `fail()`, so ITS observable behavior — stderr
 * text, exit code — is unchanged; only how the message gets there changed.
 *
 * @throws {Error} listing every `pkg -> dep` pair that did not resolve.
 */
export function assertClosureComplete({ outDir }) {
  const modulesDir = path.join(outDir, "node_modules");
  const unresolved = (packageDir, dep) => {
    const hoisted = path.join(modulesDir, dep, "package.json");
    const nested = path.join(packageDir, "node_modules", dep, "package.json");
    return !existsSync(hoisted) && !existsSync(nested);
  };
  // flatMap/filter/map preserve array order throughout, so this reports missing dependencies in
  // the same order the equivalent nested loop would have.
  const missing = stagedPackageDirs(modulesDir).flatMap((packageDir) =>
    declaredDependencies(packageDir)
      .filter((dep) => !isExcluded(dep) && unresolved(packageDir, dep))
      .map((dep) => `${path.relative(modulesDir, packageDir)} -> ${dep}`)
  );
  if (missing.length > 0) {
    throw new Error(
      `staged tree is missing ${missing.length} declared dependencies, so the packaged app would fail once installed outside this repo:\n  ${missing.join("\n  ")}`
    );
  }
}

/**
 * Package-name scopes whose `.map` files survive {@link stripNonRuntimeFiles}.
 *
 * `@jini-ai/*` is first-party, and a user crash report naming `dist/index.js:1:48210` is worth
 * nothing without the map that turns it back into a source position. Third-party maps buy no such
 * thing: nobody here is going to read a stack frame inside `drizzle-orm`.
 *
 * Keeping them is a PACKAGE DEAL with each package's own `src/`, and that is why nothing here
 * strips Jini sources. Jini's maps carry no `sourcesContent` — 400 of 400 `dist/**.js.map` sampled
 * under `staging/tovu-payload/node_modules/@jini-ai/` had the key absent entirely — so they resolve
 * a frame only by reading the `../src/*.ts` their `sources` array points at. Dropping `src/` would
 * leave 31 MB of maps that cannot name a single line.
 */
export const SOURCE_MAP_KEEP_SCOPES = new Set(["@jini-ai"]);

/** `.d.ts`, `.d.mts`, `.d.cts`, and the `.d.ts.map` that only exists to serve one. */
const DECLARATION_PATTERN = /\.d\.[cm]?ts(\.map)?$/;

/**
 * Why one staged `node_modules` file cannot be executed by the packaged app, or `undefined` to keep
 * it. `relPath` is POSIX-relative to the staged `node_modules` directory.
 *
 * Declarations are unconditional: `tsc` reads them at COMPILE time and no runtime ever opens one.
 * Their `.d.ts.map` siblings go with them by the same argument plus a stronger one — a declaration
 * map whose `.d.ts` is gone can be read by nothing at all.
 *
 * Source maps are conditional on {@link SOURCE_MAP_KEEP_SCOPES}. A `//# sourceMappingURL=` comment
 * pointing at a file that is not there is not an error in Node or Electron: the comment is only
 * consulted when something asks for a source position, and a miss degrades to the generated
 * position. It is how every `--omit=dev`-style install already behaves.
 *
 * @complexity O(1).
 */
export function strippableReason(relPath) {
  const name = path.posix.basename(relPath);
  if (DECLARATION_PATTERN.test(name)) return "declaration";
  if (!name.endsWith(".map")) return undefined;
  return SOURCE_MAP_KEEP_SCOPES.has(relPath.split("/")[0]) ? undefined : "sourceMap";
}

/** On-disk bytes of a file or tree — `st_blocks`, not `st_size`, because that is what the installed
 *  app costs. The payload's declarations average 4 KB apparent but a full block each.
 *  @complexity O(n) in entries walked. */
export function diskBytes(abs) {
  const stat = lstatSync(abs);
  if (!stat.isDirectory()) return stat.blocks * 512;
  let total = 0;
  for (const entry of readdirSync(abs)) total += diskBytes(path.join(abs, entry));
  return total;
}

/** Deletes every file under `modulesDir` that {@link strippableReason} condemns, tallying by reason.
 *  @complexity O(n) in entries walked. */
function stripGeneratedFiles(modulesDir, tally) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const reason = strippableReason(path.relative(modulesDir, full).split(path.sep).join("/"));
      if (reason === undefined) continue;
      tally.bytes += diskBytes(full);
      tally[reason] += 1;
      rmSync(full, { force: true });
    }
  };
  walk(modulesDir);
}

/**
 * Deletes each staged package's own top-level `coverage/` directory.
 *
 * These are vitest HTML reports — 12.6 MB across the `@jini-ai/*` tree, 5.7 MB of it in
 * `@jini-ai/ui` alone. They are present because those packages are pnpm-linked local checkouts
 * that stage whole, not published tarballs whose `files:` would have excluded them.
 *
 * Only a package's OWN top-level `coverage/` is touched, never an arbitrary nested directory that
 * happens to share the name — a package is free to ship a runtime module called `coverage`.
 *
 * @complexity O(n) in staged packages.
 */
function stripCoverageReports(modulesDir, tally) {
  for (const packageDir of stagedPackageDirs(modulesDir)) {
    const coverage = path.join(packageDir, "coverage");
    if (!existsSync(coverage) || !statSync(coverage).isDirectory()) continue;
    tally.bytes += diskBytes(coverage);
    tally.coverage += 1;
    rmSync(coverage, { recursive: true, force: true });
  }
}

/**
 * Remove from the STAGED tree what the packaged app can never execute: type declarations, most
 * source maps, and vitest coverage reports. Roughly a third of the staged `node_modules`.
 *
 * This operates on `outDir` — the staging output — and NEVER on the repo's own `node_modules`.
 * Stripping declarations there would break `tsc` on the next typecheck, which is why the deletion
 * belongs in the staging step and nowhere earlier.
 *
 * @returns counts by reason plus the on-disk bytes freed.
 * @complexity O(n) in files under the staged `node_modules`.
 */
export function stripNonRuntimeFiles({ outDir }) {
  const modulesDir = path.join(outDir, "node_modules");
  const tally = { declaration: 0, sourceMap: 0, coverage: 0, bytes: 0 };
  if (!existsSync(modulesDir)) return tally;
  stripCoverageReports(modulesDir, tally);
  stripGeneratedFiles(modulesDir, tally);
  return tally;
}

/** Whether to descend into / consider one directory entry at all.
 *  @complexity O(1). */
function isWalkable(entry) {
  if (entry.name === "node_modules" || entry.name.startsWith(".")) return false;
  return isBundleInput(entry.isDirectory() ? `${entry.name}/` : entry.name);
}

/** Newest mtime under a directory tree, or 0 if it does not exist.
 *  @complexity O(n) in files walked. */
export function newestMtime(abs) {
  if (!existsSync(abs)) return 0;
  const stat = statSync(abs);
  if (!stat.isDirectory()) return isBundleInput(abs) ? stat.mtimeMs : 0;
  let newest = 0;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (isWalkable(entry)) newest = Math.max(newest, newestMtime(path.join(abs, entry.name)));
  }
  return newest;
}
