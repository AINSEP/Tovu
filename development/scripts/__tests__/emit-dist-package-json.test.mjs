import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

test("CLI writes both manifests from configuration and its imports load compiled files", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dist-manifest-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = path.join(root, "development/scripts/emit-dist-package-json.mjs");
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(path.resolve(import.meta.dirname, "../emit-dist-package-json.mjs"), script);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: "fixture-runtime", version: "7.8.9", type: "module",
    imports: { "#entry": "./app/lib/entry.ts", "#conditional": { node: { import: "./app/lib/node.ts", default: "./app/lib/fallback.ts" }, default: "./app/lib/fallback.ts" } },
    bin: { tovu: "dist/lib/entry.js" }, engines: { node: ">=22.0.0" },
  }));
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { rootDir: "app" } }));
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", env: { ...process.env, TOVU_BUILD_SHA: "  fixture-sha  " } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "dist/package.json"), "utf8")), {
    name: "fixture-runtime-dist", version: "7.8.9", private: true, type: "module",
    imports: { "#entry": "./lib/entry.js", "#conditional": { node: { import: "./lib/node.js", default: "./lib/fallback.js" }, default: "./lib/fallback.js" } },
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "dist/runtime-manifest.json"), "utf8")), {
    schemaVersion: 1, cliEntry: "dist/lib/entry.js", tovuVersion: "7.8.9", tovuSha: "fixture-sha", minNodeMajor: 22,
  });
  fs.mkdirSync(path.join(root, "dist/lib"));
  fs.writeFileSync(path.join(root, "dist/lib/entry.js"), 'export default "compiled-entry";');
  fs.writeFileSync(path.join(root, "dist/lib/node.js"), 'export default "node-condition";');
  fs.writeFileSync(path.join(root, "dist/lib/fallback.js"), 'export default "fallback";');
  const probe = path.join(root, "dist/probe.js");
  fs.writeFileSync(probe, 'import entry from "#entry"; import conditional from "#conditional"; console.log(JSON.stringify([entry, conditional]));');
  const loaded = spawnSync(process.execPath, [probe], { cwd: root, encoding: "utf8" });
  assert.equal(loaded.status, 0, loaded.stderr);
  assert.deepEqual(JSON.parse(loaded.stdout), ["compiled-entry", "node-condition"]);
});
