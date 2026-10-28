import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = "development/scripts/check-architecture.ts";

// Run the real CLI and installed dependency-cruiser on two fixture modules: a value edge from
// server to feature, and a configurable return edge. No exports or alternate graph owner needed.
for (const { name, feature, runtimeEdges } of [
  {
    name: "type-only import",
    feature: 'import type { App } from "../../server/runtime/composition/app.js"; export type Shape = App;',
    runtimeEdges: 0,
  },
  {
    name: "inline type-import query",
    feature: 'export type Shape = import("../../server/runtime/composition/app.js").App;',
    runtimeEdges: 0,
  },
  {
    name: "mixed value and type import",
    feature: 'import { app, type App } from "../../server/runtime/composition/app.js"; export const read = () => app; export type Shape = App;',
    runtimeEdges: 1,
  },
  {
    name: "dynamic value import",
    feature: 'export const read = () => import("../../server/runtime/composition/app.js");',
    runtimeEdges: 1,
  },
]) {
  test(`runtime metrics exclude erased edges and retain values: ${name}`, (t) => {
    const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "architecture-edges-")));
    t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
    const script = path.join(scratch, SCRIPT);
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, SCRIPT), script);
    fs.symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(scratch, "node_modules"), "dir");
    fs.writeFileSync(path.join(scratch, "package.json"), '{"type":"module"}');
    const tsConfig = path.join(scratch, "tsconfig.json");
    fs.writeFileSync(tsConfig, '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext"}}');
    const featurePath = path.join(scratch, "apps/website/src/features/sample/value.ts");
    const serverPath = path.join(scratch, "apps/website/src/server/runtime/composition/app.ts");
    fs.mkdirSync(path.dirname(featurePath), { recursive: true });
    fs.mkdirSync(path.dirname(serverPath), { recursive: true });
    fs.writeFileSync(featurePath, `${feature}\nexport const value = 1;\n`);
    fs.writeFileSync(serverPath, 'import { value } from "../../../features/sample/value.js"; export const app = value; export type App = { ready: boolean };\n');

    const output = execFileSync(process.execPath, ["--import", "tsx", script, "--update", "--list"], {
      cwd: scratch,
      env: { ...process.env, TSX_TSCONFIG_PATH: tsConfig },
      encoding: "utf8",
      timeout: 30_000,
    });
    const metrics = JSON.parse(fs.readFileSync(path.join(path.dirname(script), "check-architecture.baseline.json"), "utf8"));
    assert.equal(metrics.meta.fileCount, 2, "the fixture must resolve both source files");
    assert.equal(metrics.backEdgesIntoServer, 1, "type edges remain in the all-import graph");
    assert.equal(metrics.backEdgesIntoServerRuntimeOnly, runtimeEdges);
    assert.equal(metrics.moduleCycles.mutualCycleCount, runtimeEdges);
    assert.equal(metrics.moduleCycles.largestScc, runtimeEdges * 2);
    assert.match(output, /back-edges into src\/server\/\*\*, by target file \(all-import\)/);
    assert.match(output, /1 → apps\/website\/src\/server\/runtime\/composition\/app\.ts/);
  });
}
