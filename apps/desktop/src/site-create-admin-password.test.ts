import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import { adoptSiteDir, initSiteDir, resolveOrInitSiteDir, resolveSiteDir, stateFilePath } from "./site-dir-store.ts";

test("every desktop create arm passes an explicit default or private custom password and strips inherited credentials", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-owner-spawn-"));
  fs.mkdirSync(path.join(root, "dist", "src", "cli"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ bin: { tovu: "dist/src/cli/main.js" } }));
  fs.writeFileSync(path.join(root, "dist", "src", "cli", "main.js"), "");
  const baseEnv = { TOVU_ADMIN_PASSWORD: "desktop-inherited-password-fixture", TOVU_ADMIN_USER: "deployed-owner" };
  try {
    for (const adminPassword of [undefined, " desktop chosen 🔑 "]) {
      for (const arm of ["init", "resolve", "adopt", "env", "picker"] as const) {
        const dir = path.join(root, `${arm}-${adminPassword === undefined ? "default" : "custom"}`);
        const statePath = stateFilePath(path.join(root, `${arm}-state`));
        let payload = "";
        let argv: string[] = [];
        let childEnv: NodeJS.ProcessEnv = {};
        const input = { repoRoot: root, dir, adminPassword, statePath, baseEnv, spawnFn: (_command: string, args: string[], options: SpawnOptions) => {
          argv = args;
          assert.ok(options.env, "site creation must supply an explicit child environment");
          childEnv = options.env;
          const child = Object.assign(new EventEmitter(), {
            stdout: new PassThrough(), stderr: new PassThrough(),
            stdin: new Writable({ write: (chunk, _encoding, done) => { payload += String(chunk); done(); } }),
          });
          queueMicrotask(() => child.emit("exit", 0, null));
          return child;
        } };
        if (arm === "init") await initSiteDir(input);
        if (arm === "resolve") await resolveOrInitSiteDir({ ...input, onMissingSite: "init" });
        if (arm === "adopt") await adoptSiteDir(input);
        if (arm === "env") await resolveSiteDir({ ...input, envDir: dir, onMissingSite: "init" });
        if (arm === "picker") await resolveSiteDir({ ...input, pickDir: () => dir });
        assert.equal(childEnv.TOVU_ADMIN_PASSWORD, undefined);
        assert.equal(childEnv.TOVU_ADMIN_USER, undefined);
        assert.equal(baseEnv.TOVU_ADMIN_PASSWORD, "desktop-inherited-password-fixture");
        if (adminPassword === undefined) {
          assert.deepEqual(argv.slice(1), ["init", dir, "--admin-password", "tovu-dev"]);
          assert.equal(payload, "");
        } else {
          assert.deepEqual(argv.slice(1), ["init", dir, "--create-input-stdin"]);
          assert.ok(!argv.includes(adminPassword));
          assert.deepEqual(JSON.parse(payload), { adminPassword, agentPluginTokens: {} });
        }
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("REGRESSION: desktop source CLI creation ignores the parent production password and authenticates with tovu-dev", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-owner-real-"));
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  const inherited = "desktop-inherited-password-fixture";
  const previous = process.env.TOVU_ADMIN_PASSWORD;
  process.env.TOVU_ADMIN_PASSWORD = inherited;
  try {
    for (const adminPassword of [undefined, "private-desktop-password-fixture"]) {
      const dir = path.join(parent, adminPassword === undefined ? "default" : "custom");
      await initSiteDir({ repoRoot, dir, cliMode: "source", adminPassword,
        baseEnv: { ...process.env, TOVU_ADMIN_PASSWORD: inherited, TOVU_ADMIN_USER: "production-owner" },
      });
      // Reuse the website's real login assertions in its own TSX process: importing them here
      // pulls the server into the desktop's stricter type-stripping compiler contract.
      // Passwords travel only on stdin; child output is kept out of test diagnostics.
      const ownerLogin = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), "--input-type=module", "--eval", `
        import fs from "node:fs";
        import { assertSiteOwnerLogin } from "./apps/website/src/platform/site-dir/__tests__/helpers/assert-site-owner-login.ts";
        await assertSiteOwnerLogin(JSON.parse(fs.readFileSync(0, "utf8")));
      `], {
        cwd: repoRoot,
        input: JSON.stringify({ dir, password: adminPassword ?? "tovu-dev", rejectedPassword: inherited }),
        stdio: ["pipe", "ignore", "ignore"],
        timeout: 60_000,
      });
      assert.equal(ownerLogin.error, undefined);
      assert.equal(ownerLogin.status, 0, "the shared website helper must accept the site password and reject the inherited password");
    }
  } finally {
    if (previous === undefined) delete process.env.TOVU_ADMIN_PASSWORD;
    else process.env.TOVU_ADMIN_PASSWORD = previous;
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
