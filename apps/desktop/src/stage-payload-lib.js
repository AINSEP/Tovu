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
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
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
