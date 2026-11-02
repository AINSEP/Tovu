/**
 * @file Drift guard for the runner split: which test globs run on bare node and which under tsx.
 *
 * The split is written down twice. `npm test` runs `package.json`'s `test` script, and
 * `scripts/check-coverage.ts` runs `TEST_PASSES` from `coverage-floors.ts`. If the two disagree, a
 * test file runs under a different runner in the gate than in the suite, or in only one of them.
 * The runner is not cosmetic: probe P4 showed tsx corrupts lcov counters. This fails naming every
 * glob the two disagree on.
 *
 * It also holds the checks on the REAL `coverage-floors.json` that need no coverage run: the source
 * inventory (every desktop source file in exactly one area or excluded with a why) runs here in
 * seconds, so a file that lands outside every area fails `npm test`, not only the slow gate.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TEST_PASSES, inventoryFailures, parseNodeTestScript, runnerSplitDrift } from "./coverage-floors.ts";
import { sourceInventory } from "../scripts/check-coverage.ts";

const PACKAGE_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const DESKTOP_ROOT = path.dirname(PACKAGE_JSON);

test("npm test builds the deployed preloads before either test pass on a clean checkout", () => {
  const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  // The speech VM checks the shipped CommonJS bundle, not a substitute transpilation. Build
  // just the preloads, without the renderer, before reading it; never skip on a missing dist.
  assert.equal(manifest.scripts.pretest, "npm run build:preload");
});

test("desktop declares the DOM dependency its real renderer hook tests need", () => {
  const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  // A hoisted admin install can hide this omission locally. Desktop Gates installs only root
  // and desktop, so resolving a DOM package somewhere on this machine is insufficient proof.
  assert.equal(manifest.devDependencies.jsdom, "^29.1.1");
});

test("package.json's test script runs the same globs under the same runners as TEST_PASSES", () => {
  const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  assert.deepEqual(runnerSplitDrift(TEST_PASSES, parseNodeTestScript(manifest.scripts.test)), []);
});

test("every suite and coverage pass using module mocks enables Node's module-mock flag", () => {
  const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  // Agreement alone would accept both runners dropping the flag. Inspect their actual inputs,
  // including the compiled-preload parity check that skips on a never-built CI checkout.
  for (const [runner, passes] of [
    ["npm test", parseNodeTestScript(manifest.scripts.test)],
    ["coverage", TEST_PASSES],
  ] as const) {
    const checked: string[] = [];
    for (const pass of passes) {
      const mockTests = globSync([...pass.globs], { cwd: DESKTOP_ROOT }).filter((file) =>
        /\bmock\.module\s*\(/.test(readFileSync(path.join(DESKTOP_ROOT, file), "utf8")),
      );
      for (const file of mockTests) {
        assert.ok(pass.nodeArgs.includes("--experimental-test-module-mocks"), `${runner} must enable module mocks for ${file}`);
        checked.push(file);
      }
    }
    assert.ok(checked.length > 0, `${runner} must include the module-mocking preload tests`);
  }
});

test("every real desktop source file is in exactly one coverage area, or excluded with a why", () => {
  const config = JSON.parse(readFileSync(path.join(DESKTOP_ROOT, "coverage-floors.json"), "utf8"));
  const files = sourceInventory({ root: DESKTOP_ROOT });
  // Anchors that the scan really walked src, the renderer components and the preloads: an empty or
  // misdirected scan would otherwise pass with no failures.
  for (const anchor of ["src/coverage-floors.ts", "src/renderer/App.tsx", "src/preload/preload.mts", "src/speech/preload-speech.cts"]) {
    assert.ok(files.includes(anchor), `the inventory must include ${anchor}`);
  }
  assert.deepEqual(inventoryFailures({ files, areas: config.areas }, { excluded: config.excluded ?? [] }), []);
});

test("the real per-file branch policy is well formed, and every debt entry sits under the floor", () => {
  const { perFileBranch } = JSON.parse(readFileSync(path.join(DESKTOP_ROOT, "coverage-floors.json"), "utf8"));
  assert.equal(typeof perFileBranch.floor, "number");
  assert.equal(typeof perFileBranch.enforced, "boolean");
  // A debt entry at or above the floor exempts nothing; one over 100 or under 0 is a typo.
  for (const [file, floor] of Object.entries(perFileBranch.debt ?? {})) {
    assert.ok(typeof floor === "number" && floor >= 0 && floor < perFileBranch.floor, `${file}: debt ${String(floor)} must be a number in [0, ${perFileBranch.floor})`);
  }
});
