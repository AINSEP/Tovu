import assert from "node:assert/strict";
import test from "node:test";

import { resolveCommittedConfigRoot } from "../provisioning.node-io.js";

/**
 * @file `resolveCommittedConfigRoot` — the absolute base every repo-relative committed-config path
 * (`PUBLISH_TRUST_CONFIG_PATH`, `DEPLOY_CONFIG_CANDIDATE_PATHS`) resolves against. Regression for
 * the 2026-09-19 desktop bug: those paths used to resolve against the bare `process.cwd()`, which
 * is wrong for the desktop shell's own-server mode (see this function's own doc).
 */

test("resolveCommittedConfigRoot prefers TOVU_REPO_ROOT when the caller's env sets it", () => {
  assert.equal(
    resolveCommittedConfigRoot({ TOVU_REPO_ROOT: "/repo/root" }),
    "/repo/root"
  );
});

test("resolveCommittedConfigRoot falls back to process.cwd() when TOVU_REPO_ROOT is unset", () => {
  assert.equal(resolveCommittedConfigRoot({}), process.cwd());
});

test("resolveCommittedConfigRoot falls back to process.cwd() when TOVU_REPO_ROOT is set but empty", () => {
  // An empty string is falsy, same treatment as unset — there is no meaningful "root is nowhere"
  // state for a filesystem base, unlike `PUBLISH_TRUST_ENV_VAR`'s own empty-string kill switch.
  assert.equal(resolveCommittedConfigRoot({ TOVU_REPO_ROOT: "" }), process.cwd());
});

test("resolveCommittedConfigRoot defaults to the real process.env when called with no argument", () => {
  const previous = process.env.TOVU_REPO_ROOT;
  process.env.TOVU_REPO_ROOT = "/from/real/env";
  try {
    assert.equal(resolveCommittedConfigRoot(), "/from/real/env");
  } finally {
    if (previous === undefined) delete process.env.TOVU_REPO_ROOT;
    else process.env.TOVU_REPO_ROOT = previous;
  }
});
