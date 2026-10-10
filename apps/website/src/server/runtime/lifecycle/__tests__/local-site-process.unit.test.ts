import assert from "node:assert/strict";
import test from "node:test";
import { localSiteChildEnv } from "../local-site-process.js";

test("local child uses an allowlist: deploy/admin/provider secrets and owner paths never inherit", () => {
  const env = localSiteChildEnv({ parent: { PATH: "/bin", HOME: "/home/operator", TOVU_ADMIN_PASSWORD: "secret",
    AWS_SECRET_ACCESS_KEY: "secret", OPENAI_API_KEY: "secret", DATABASE_URL: "secret", NODE_OPTIONS: "--require owner-hook",
    TOVU_CONTENT_DB: "/owner/content.db", TOVU_ADMIN_DEV_PROXY_URL: "https://localhost:5173", TOVU_DEV_RESTART_REQUEST_FILE: "/owner/restart" },
    siteDir: "/repo/sites/alpha", name: "alpha", port: 3101, daemonPort: 3102, repoRoot: "/repo", buildRoot: "/tmp/build" });
  assert.equal(env.HOME, "/home/operator");
  assert.equal(env.TOVU_SITE_DIR, "/repo/sites/alpha");
  assert.equal(env.JINI_AGENT_DAEMON_URL, "http://127.0.0.1:3102");
  assert.equal(env.TOVU_ENABLE_SITE_SWITCHER, "0");
  assert.equal(env.TOVU_DEV_OWNER_SIGNIN, "0");
  for (const key of ["TOVU_ADMIN_PASSWORD", "AWS_SECRET_ACCESS_KEY", "OPENAI_API_KEY", "DATABASE_URL", "NODE_OPTIONS", "TOVU_CONTENT_DB", "TOVU_ADMIN_DEV_PROXY_URL", "TOVU_DEV_RESTART_REQUEST_FILE"]) {
    assert.equal(env[key], undefined, key);
  }
});

test("devsignin: managed children inherit only a safely admitted local owner capability", () => {
  const dev = { NODE_ENV: "development", TOVU_HOST: "127.0.0.1", TOVU_DEV_OWNER_SIGNIN: "1", TOVU_DEV_SUPERVISOR_PID: "42" };
  const make = (parent: NodeJS.ProcessEnv) => localSiteChildEnv({ parent,
    siteDir: "/repo/sites/beta", name: "beta", port: 3103, daemonPort: 3104, repoRoot: "/repo", buildRoot: "/tmp/build" }, { pathExists: () => false });
  assert.equal(make(dev).TOVU_DEV_OWNER_SIGNIN, "1");
  for (const override of [{ TOVU_DEV_OWNER_SIGNIN: "0" }, { NODE_ENV: "production" }, { TOVU_RUNTIME_MODE: "production" }, { FLY_APP_NAME: "live" }, { TOVU_HOST: "0.0.0.0" }]) {
    assert.equal(make({ ...dev, ...override }).TOVU_DEV_OWNER_SIGNIN, "0");
  }
});
