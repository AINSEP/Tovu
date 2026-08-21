import assert from "node:assert/strict";
import test from "node:test";

import { childProcessCoverageEnv } from "../../child-process-coverage-env.js";

/**
 * @file Direct coverage for `childProcessCoverageEnv`: it must redirect `NODE_V8_COVERAGE` to the
 * given directory, never leave it at whatever the ambient (parent runner's) value is, and must
 * not otherwise disturb the rest of the env it copies from `process.env`.
 */

test("childProcessCoverageEnv: sets NODE_V8_COVERAGE to exactly the given directory", () => {
  const env = childProcessCoverageEnv("/tmp/tovu-coverage-probe/child-a");
  assert.equal(env.NODE_V8_COVERAGE, "/tmp/tovu-coverage-probe/child-a");
});

test("childProcessCoverageEnv: overrides an ambient NODE_V8_COVERAGE rather than inheriting it", () => {
  const previous = process.env.NODE_V8_COVERAGE;
  process.env.NODE_V8_COVERAGE = "/tmp/tovu-coverage-probe/ambient-parent-dir";
  try {
    const env = childProcessCoverageEnv("/tmp/tovu-coverage-probe/child-b");
    assert.equal(env.NODE_V8_COVERAGE, "/tmp/tovu-coverage-probe/child-b");
    assert.notEqual(env.NODE_V8_COVERAGE, "/tmp/tovu-coverage-probe/ambient-parent-dir");
  } finally {
    if (previous === undefined) delete process.env.NODE_V8_COVERAGE;
    else process.env.NODE_V8_COVERAGE = previous;
  }
});

test("childProcessCoverageEnv: carries the rest of process.env through unchanged", () => {
  const previous = process.env.TOVU_COVERAGE_ENV_PROBE;
  process.env.TOVU_COVERAGE_ENV_PROBE = "carried-through";
  try {
    const env = childProcessCoverageEnv("/tmp/tovu-coverage-probe/child-c");
    assert.equal(env.TOVU_COVERAGE_ENV_PROBE, "carried-through");
    assert.equal(env.PATH, process.env.PATH);
  } finally {
    if (previous === undefined) delete process.env.TOVU_COVERAGE_ENV_PROBE;
    else process.env.TOVU_COVERAGE_ENV_PROBE = previous;
  }
});
