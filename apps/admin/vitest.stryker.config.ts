// Stryker-only Vitest config (trial 2026-10-19). Stryker refuses to start when any test fails on
// unmutated code. Running the WHOLE admin suite under Stryker hit flaky timing tests and a test
// that fails on HEAD (dictionary-lookup-sinks), so the run is limited to the test files that import
// the modules being mutated (stryker-tests.json, regenerated per batch).
import { readFileSync } from "node:fs";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

const include: string[] = JSON.parse(readFileSync(new URL("./stryker-tests.json", import.meta.url), "utf8"));

// Tests that fail on HEAD (real bugs, tracked in the tovu-65 task list) are skipped by name so the
// mutation run can start; remove each one once it is fixed.
const FAILING_ON_HEAD: string[] = [];
const testNamePattern = FAILING_ON_HEAD.length > 0
  ? new RegExp(`^(?!.*(?:${FAILING_ON_HEAD.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`)
  : undefined;

export default mergeConfig(base, defineConfig({ test: { include, testNamePattern } }));
