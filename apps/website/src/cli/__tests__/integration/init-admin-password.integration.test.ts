import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertSiteOwnerLogin } from "../../../platform/site-dir/__tests__/helpers/assert-site-owner-login.js";
import { runInitCommand } from "../../commands/init.js";

const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");
const INHERITED_PASSWORD = "cli-inherited-password-fixture";

test("CLI init with and without --admin-password ignores the parent env and persists the chosen login", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-owner-"));
  const previous = process.env.TOVU_ADMIN_PASSWORD;
  process.env.TOVU_ADMIN_PASSWORD = INHERITED_PASSWORD;
  try {
    for (const custom of [false, true]) {
      const dir = path.join(parent, custom ? "custom" : "default");
      const password = custom ? " CLI chosen password 🔑 " : "tovu-dev";
      const args = ["--import", "tsx", CLI_MAIN, "init", dir];
      if (custom) args.push("--admin-password", password);
      const result = spawnSync(process.execPath, args, {
        encoding: "utf8",
        env: { ...process.env, TOVU_ADMIN_USER: "admin", TOVU_ADMIN_PASSWORD: INHERITED_PASSWORD, TOVU_SITE_DIR: dir },
      });
      assert.equal(result.status, 0);
      assert.ok(!result.stdout.includes(INHERITED_PASSWORD) && !result.stderr.includes(INHERITED_PASSWORD));
      if (custom) assert.ok(!result.stdout.includes(password) && !result.stderr.includes(password));
      await assertSiteOwnerLogin({ dir, password, rejectedPassword: INHERITED_PASSWORD });
    }
  } finally {
    if (previous === undefined) delete process.env.TOVU_ADMIN_PASSWORD;
    else process.env.TOVU_ADMIN_PASSWORD = previous;
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("desktop stdin envelope accepts a password and service tokens together without changing either", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-stdin-owner-"));
  const dir = path.join(parent, "private");
  const password = " private 🔑 ";
  const token = "service-token-fixture";
  const checks: string[] = [];
  const sealed: string[] = [];
  try {
    await runInitCommand({ dir, createInputStdin: true,
      readCreateInput: async () => JSON.stringify({ adminPassword: password, agentPluginTokens: { supabase: token } }),
      checkAgentPluginToken: async ({ token }) => { checks.push(token); return "ok"; },
      sealAgentPluginTokens: async ({ tokens }) => { sealed.push(tokens.supabase!); },
    });
    assert.deepEqual(checks, [token]);
    assert.deepEqual(sealed, [token]);
    await assertSiteOwnerLogin({ dir, password, rejectedPassword: "tovu-dev" });
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("CLI refuses malformed credentials and conflicting stdin options before creating a site", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-stdin-owner-refused-"));
  const dir = path.join(parent, "refused");
  try {
    for (const raw of ["not json", "null", "[]"]) {
      await assert.rejects(runInitCommand({ dir, createInputStdin: true, readCreateInput: async () => raw }), { message: "init: --create-input-stdin expects a JSON object on stdin" });
    }
    await assert.rejects(runInitCommand({ dir, createInputStdin: true, readCreateInput: async () => '{"adminPassword":null}' }), { message: "Admin password must be a string." });
    await assert.rejects(runInitCommand({ dir, createInputStdin: true, adminPassword: "chosen" }), { message: "init: --create-input-stdin cannot be combined with --admin-password or --agent-plugin-tokens-stdin" });
    await assert.rejects(runInitCommand({ dir, createInputStdin: true, agentPluginTokensStdin: true }), { message: "init: --create-input-stdin cannot be combined with --admin-password or --agent-plugin-tokens-stdin" });
    await assert.rejects(runInitCommand({ dir, adminPassword: "" }), { message: "Password is required." });
    await assert.rejects(runInitCommand({ dir, storage: "postgres", createInputStdin: true, readCreateInput: async () => assert.fail("a conflicting stdin arm must refuse before reading") }), { message: "init: --create-input-stdin cannot share stdin with a Postgres connection string; use --storage-env" });
    assert.equal(fs.existsSync(dir), false);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
