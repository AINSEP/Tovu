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
  for (const key of ["TOVU_ADMIN_PASSWORD", "AWS_SECRET_ACCESS_KEY", "OPENAI_API_KEY", "DATABASE_URL", "NODE_OPTIONS", "TOVU_CONTENT_DB", "TOVU_ADMIN_DEV_PROXY_URL", "TOVU_DEV_RESTART_REQUEST_FILE"]) {
    assert.equal(env[key], undefined, key);
  }
});
