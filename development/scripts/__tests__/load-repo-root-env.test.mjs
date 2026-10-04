import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

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

for (const script of ["dev.mjs", "dev-desktop.mjs"]) {
  test(`${script}: loads the fixture .env before reading the admin port`, () => {
    const dir = makeTempEnvFile("TOVU_ADMIN_DEV_PORT=6517\n");
    const preload = path.join(dir, "env-order.mjs");
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    try {
      fs.writeFileSync(preload, `
        import assert from "node:assert/strict";
        import fs from "node:fs";
        import { syncBuiltinESMExports } from "node:module";
        const exists = fs.existsSync;
        fs.existsSync = file => String(file) === ${JSON.stringify(path.join(repoRoot, ".env"))} || exists(file);
        const load = process.loadEnvFile.bind(process);
        let loaded = false, reads = 0;
        process.loadEnvFile = file => {
          assert.equal(file, ${JSON.stringify(path.join(repoRoot, ".env"))});
          load(${JSON.stringify(path.join(dir, ".env"))});
          loaded = true;
        };
        const env = process.env;
        process.env = new Proxy(env, { get(target, key) {
          if (key === "TOVU_ADMIN_DEV_PORT") {
            reads++;
            assert.equal(loaded, true, "port read before .env was loaded");
            assert.equal(target[key], "6517");
          }
          return target[key];
        }});
        process.on("exit", () => assert.ok(reads > 0, "the real entry point must read the admin port"));
        syncBuiltinESMExports();
      `);
      const env = { ...process.env };
      delete env.TOVU_ADMIN_DEV_PORT;
      const result = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href,
        "--input-type=module", "-e", `process.argv[1] = "/fixture-import"; await import(${JSON.stringify(new URL(`../${script}`, import.meta.url).href)})`],
        { encoding: "utf8", env, timeout: 10_000 });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
