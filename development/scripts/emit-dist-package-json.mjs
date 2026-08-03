/**
 * Emit `dist/package.json` so the compiled output can resolve `#src/*` specifiers.
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
