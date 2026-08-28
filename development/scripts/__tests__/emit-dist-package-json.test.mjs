import assert from "node:assert/strict";
import test from "node:test";

import { deriveDistImports, stripRootDirPrefix, toCompiled } from "../emit-dist-package-json.mjs";

/**
 * @file Regression test for the Phase 2 (`src/` -> `apps/website/src/`) rename breaking
 * `npm start`: `dist/package.json`'s derived `#src/*` mapping pointed at
 * `./apps/website/src/*.js`, a path that never exists under `dist/` -- `tsc`'s `rootDir` is
 * `apps/website`, so compiled output mirrors relative to THAT, landing at `dist/src/*.js`. The
 * bug was in the relationship between two independently-correct strings (the source import
 * target and `rootDir`), not in either string alone, so a plain grep for stale `src/` literals
 * would never have caught it.
 */

test("stripRootDirPrefix removes a matching ./<rootDir>/ prefix", () => {
  assert.equal(stripRootDirPrefix("./apps/website/src/index.js", "apps/website"), "./src/index.js");
});

test("stripRootDirPrefix is a no-op when the target doesn't start with the rootDir prefix", () => {
  assert.equal(stripRootDirPrefix("./src/index.js", "apps/website"), "./src/index.js");
});

test("stripRootDirPrefix is a no-op when rootDir is the repo root itself", () => {
  assert.equal(stripRootDirPrefix("./src/index.js", "."), "./src/index.js");
});

test("toCompiled retargets a .ts source import to its actual dist/ location, not a naive .ts->.js swap", () => {
  // This is the exact mapping from the live root package.json/tsconfig.json today. The naive
  // (pre-fix) implementation returned "./apps/website/src/*.js" here -- a path dist/ never has.
  assert.equal(toCompiled("./apps/website/src/*.ts", "apps/website"), "./src/*.js");
});

test("toCompiled throws on a non-.ts string target", () => {
  assert.throws(() => toCompiled("./apps/website/src/*.js", "apps/website"), /expected it to point at a \.ts source file/);
});

test("deriveDistImports retargets every entry and matches the real dist/src/ layout", () => {
  const distImports = deriveDistImports({ "#src/*": "./apps/website/src/*.ts" }, "apps/website");
  assert.deepEqual(distImports, { "#src/*": "./src/*.js" });
});
