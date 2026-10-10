import assert from "node:assert/strict";
import test from "node:test";
import { buildApiEnv, siteEnvForRestart } from "../dev.mjs";

/** devsignin: every supervised API boot/restart gets the local admission flag, never a token. */
const api = { scheme: "https", apiPort: 3001, vitePort: 5174, supervisorPid: 42 };
test("fxdev: ordinary browser dev preserves LAN binding and passwordless owner sign-in defaults OFF", () => {
  const env = buildApiEnv(api, { env: {} });
  assert.equal(Object.hasOwn(env, "NODE_ENV"), false);
  assert.equal(Object.hasOwn(env, "TOVU_HOST"), false);
  assert.equal(env.TOVU_DEV_OWNER_SIGNIN, "0");
  assert.equal(env.TOVU_DEV_SUPERVISOR_PID, "42");
  assert.equal(env.TOVU_ADMIN_DEV_PROXY_URL, "https://localhost:5174");
  assert.equal(Object.keys(env).some((key) => /TOKEN|PASSWORD/.test(key)), false);
});

test("fxdev: only explicit owner sign-in opt-in defaults the API to development", () => {
  const optedIn = buildApiEnv(api, { env: { TOVU_DEV_OWNER_SIGNIN: "1" } });
  assert.equal(optedIn.NODE_ENV, "development");
  assert.equal(optedIn.TOVU_DEV_OWNER_SIGNIN, "1");
  assert.equal(optedIn.TOVU_HOST, "127.0.0.1");
  for (const flag of [undefined, "0", ""]) {
    const env = buildApiEnv(api, { env: { TOVU_DEV_OWNER_SIGNIN: flag } });
    assert.equal(Object.hasOwn(env, "NODE_ENV"), false);
    assert.equal(Object.hasOwn(env, "TOVU_HOST"), false);
    assert.equal(buildApiEnv(api, { env: { TOVU_DEV_OWNER_SIGNIN: flag, NODE_ENV: "test" } }).NODE_ENV, "test");
  }
  assert.equal(buildApiEnv(api, { env: { TOVU_DEV_OWNER_SIGNIN: "1", NODE_ENV: "production" } }).NODE_ENV, "production");
});

test("devsignin: explicit disable, production mode and LAN address remain visible to the hard guard", () => {
  const env = buildApiEnv(api, { env: { NODE_ENV: "production", TOVU_HOST: "0.0.0.0", TOVU_DEV_OWNER_SIGNIN: "0" } });
  assert.equal(env.NODE_ENV, "production");
  assert.equal(env.TOVU_HOST, "0.0.0.0");
  assert.equal(env.TOVU_DEV_OWNER_SIGNIN, "0");
});

test("devsignin: a requested switch keeps the bootstrap capability on the new site's API child", () => {
  const boot = buildApiEnv(api, { env: { TOVU_DEV_OWNER_SIGNIN: "1" } });
  const next = siteEnvForRestart({ shellSite: undefined, envFileText: "TOVU_SITE=second-site\n" });
  const env = { ...boot, ...next.env };
  assert.equal(env.TOVU_SITE, "second-site");
  assert.equal(env.TOVU_DEV_OWNER_SIGNIN, "1");
  assert.equal(env.TOVU_HOST, "127.0.0.1");
});
