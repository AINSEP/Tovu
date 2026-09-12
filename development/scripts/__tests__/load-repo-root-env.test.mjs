import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadRepoRootEnvFile } from "../load-repo-root-env.mjs";

/**
 * @file Regression coverage for the shared `.env` loader both `development/scripts/dev.mjs`
 * (`npm run dev`) and `development/scripts/dev-desktop.mjs` (`npm run desktop`) call before anything
 * reads `process.env`. Before this, `dev-desktop.mjs` never loaded `.env` at all, so a repo-root
 * secret like `TOVU_INTEGRATIONS_ROOT_KEY` never reached a desktop-launched site server's environment
 * — a stored OAuth MCP server (e.g. Higgsfield) then failed to decrypt with "no root key" and was
 * silently skipped, while the same secret worked fine under `npm run dev`.
 *
 * Uses real temp-dir fixture `.env` files (never the repo's own `.env`) and process-env keys that are
 * unique per test and cleaned up afterward, per the "never print/log/commit a real `.env` value" rule
 * for this task.
 */

function makeTempEnvFile(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "load-repo-root-env-"));
  fs.writeFileSync(path.join(dir, ".env"), contents);
  return dir;
}

test("loadRepoRootEnvFile: returns false and never calls loadEnvFile when no .env exists at repoRoot", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "load-repo-root-env-empty-"));
  let loadCalled = false;
  const result = loadRepoRootEnvFile(dir, {
    existsSync: () => false,
    loadEnvFile: () => {
      loadCalled = true;
    },
  });
  assert.equal(result, false);
  assert.equal(loadCalled, false, "must not attempt to load a file that does not exist");
});

test("loadRepoRootEnvFile: returns true and loads the exact repoRoot/.env path when it exists", () => {
  let loadedPath = null;
  const result = loadRepoRootEnvFile("/fake/repo/root", {
    existsSync: (p) => p === path.join("/fake/repo/root", ".env"),
    loadEnvFile: (p) => {
      loadedPath = p;
    },
  });
  assert.equal(result, true);
  assert.equal(loadedPath, path.join("/fake/repo/root", ".env"));
});

test("loadRepoRootEnvFile: a variable only defined in the file reaches process.env", () => {
  const key = "TOVU_ENVFIX_TEST_FILE_ONLY";
  assert.equal(process.env[key], undefined, "precondition: key must not already be set");
  const dir = makeTempEnvFile(`${key}=from-file\n`);
  try {
    const result = loadRepoRootEnvFile(dir);
    assert.equal(result, true);
    assert.equal(process.env[key], "from-file");
  } finally {
    delete process.env[key];
  }
});

test("loadRepoRootEnvFile: a variable already set in process.env (shell export) wins over the file's value", () => {
  const key = "TOVU_ENVFIX_TEST_PRECEDENCE";
  process.env[key] = "from-shell";
  const dir = makeTempEnvFile(`${key}=from-file\n`);
  try {
    loadRepoRootEnvFile(dir);
    assert.equal(process.env[key], "from-shell", ".env must fill gaps, never override an already-set shell value");
  } finally {
    delete process.env[key];
  }
});
