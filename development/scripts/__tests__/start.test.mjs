import assert from "node:assert/strict";
import test from "node:test";

import { clearBlankRootKeyEnv, planStart, resolveStartHost, startQuietEnvDefaults } from "../start.mjs";

/**
 * @file `planStart` — the pure port/env decision `development/scripts/start.mjs`'s `main()` makes
 * before importing the compiled server (npm-start-just-works-plan-2026-09-24, Slice 2, decision 4).
 *
 * `isPortFree` is an injected (possibly async) predicate, the same "pure planner, real I/O supplied
 * by the caller" shape `prepare-start.mjs`'s `planStartSteps` already uses for `input.has`. A test
 * double never touches a real socket; `main()` supplies a real `net`-backed one.
 *
 * `dotenvLoaded` is accepted for parity with the object `main()` builds once and threads through —
 * decision 4's "PORT unset in the shell AND in .env" is already fully reflected in `env` by the time
 * `main()` calls this (`.env` is loaded into `process.env` before this runs, and
 * `load-repo-root-env.mjs`'s own contract is that a shell-set var always wins), so this function's
 * own decision never needs to ask separately which source `env.PORT` came from.
 */

function alwaysFree() {
  return true;
}

test("PORT unset, TOVU_PUBLIC_URL loopback:3000, port 3000 busy → picks 3001 and drops TOVU_PUBLIC_URL", async () => {
  const calls = [];
  const isPortFree = async (port) => {
    calls.push(port);
    return port !== 3000;
  };

  const result = await planStart({
    env: { TOVU_PUBLIC_URL: "https://localhost:3000" },
    dotenvLoaded: true,
    isPortFree,
  });

  assert.equal(result.port, 3001);
  assert.deepEqual(result.envOverrides, { PORT: "3001" });
  assert.deepEqual(result.envRemovals, ["TOVU_PUBLIC_URL"]);
  assert.deepEqual(calls, [3000, 3001]);
  assert.equal(result.refuse, undefined);
});

test("PORT set → port is used untouched, and the probe is never called", async () => {
  const isPortFree = async () => {
    throw new Error("must not probe when PORT is already set");
  };

  const result = await planStart({ env: { PORT: "4321" }, dotenvLoaded: true, isPortFree });

  assert.equal(result.port, 4321);
  assert.deepEqual(result.envOverrides, {});
  assert.equal(result.refuse, undefined);
});

test("non-loopback TOVU_PUBLIC_URL → no auto-pick; the refusal is left to index.ts", async () => {
  const isPortFree = async () => {
    throw new Error("must not probe when TOVU_PUBLIC_URL is non-loopback");
  };

  const result = await planStart({
    env: { TOVU_PUBLIC_URL: "https://tovu.example.com" },
    dotenvLoaded: true,
    isPortFree,
  });

  assert.equal(result.port, 3000);
  assert.deepEqual(result.envOverrides, {});
  assert.equal(result.refuse, "non-loopback-public-url");
});

test("3000-3019 all busy → no auto-pick", async () => {
  const probed = [];
  const isPortFree = async (port) => {
    probed.push(port);
    return false;
  };

  const result = await planStart({ env: {}, dotenvLoaded: true, isPortFree });

  assert.equal(result.port, 3000);
  assert.deepEqual(result.envOverrides, {});
  assert.equal(result.refuse, "no-free-port-in-range");
  assert.deepEqual(
    probed,
    Array.from({ length: 20 }, (_, i) => 3000 + i)
  );
});

test("PORT unset, TOVU_PUBLIC_URL unset, port 3000 free → no overrides at all (nothing to change)", async () => {
  const result = await planStart({ env: {}, dotenvLoaded: true, isPortFree: alwaysFree });

  assert.equal(result.port, 3000);
  assert.deepEqual(result.envOverrides, {});
});

test("PORT unset, TOVU_PUBLIC_URL loopback at a port OTHER than 3000, 3000 busy → PORT overridden, TOVU_PUBLIC_URL dropped", async () => {
  const isPortFree = async (port) => port !== 3000;

  const result = await planStart({
    env: { TOVU_PUBLIC_URL: "https://127.0.0.1:5173" },
    dotenvLoaded: true,
    isPortFree,
  });

  assert.equal(result.port, 3001);
  assert.deepEqual(result.envOverrides, { PORT: "3001" });
  assert.deepEqual(result.envRemovals, ["TOVU_PUBLIC_URL"]);
});

/**
 * A loopback `TOVU_PUBLIC_URL` (the repo's own `.env` ships `https://localhost:3000`) is dropped
 * under `npm start`, whatever port is picked: the server refuses a loopback value as a public origin
 * anyway (one noisy boot line), and without it the OAuth callback falls back to the request's own
 * Host and protocol, which is always the port and scheme the browser actually used.
 */
test("PORT set, TOVU_PUBLIC_URL loopback → PORT untouched, TOVU_PUBLIC_URL still dropped", async () => {
  const result = await planStart({
    env: { PORT: "4321", TOVU_PUBLIC_URL: "https://localhost:3000" },
    dotenvLoaded: true,
    isPortFree: alwaysFree,
  });

  assert.equal(result.port, 4321);
  assert.deepEqual(result.envOverrides, {});
  assert.deepEqual(result.envRemovals, ["TOVU_PUBLIC_URL"]);
});

test("port 3000 free, TOVU_PUBLIC_URL loopback → no overrides, TOVU_PUBLIC_URL dropped", async () => {
  const result = await planStart({ env: { TOVU_PUBLIC_URL: "http://127.0.0.1:3000" }, dotenvLoaded: true, isPortFree: alwaysFree });

  assert.equal(result.port, 3000);
  assert.deepEqual(result.envOverrides, {});
  assert.deepEqual(result.envRemovals, ["TOVU_PUBLIC_URL"]);
});

test("non-loopback TOVU_PUBLIC_URL is never dropped", async () => {
  const result = await planStart({ env: { TOVU_PUBLIC_URL: "https://tovu.example.com" }, dotenvLoaded: true, isPortFree: alwaysFree });

  assert.deepEqual(result.envRemovals, []);
});

/**
 * `clearBlankRootKeyEnv` runs BEFORE `.env` is loaded. `process.loadEnvFile` never overrides a
 * variable already present, even an empty one, and the keyring treats an empty value as absent — so
 * a blank shell `TOVU_INTEGRATIONS_ROOT_KEY` would hide `.env`'s real key and let
 * `tovu root-key ensure` mint a second one.
 */
test("clearBlankRootKeyEnv: blank TOVU_INTEGRATIONS_ROOT_KEY is removed so .env can fill it", () => {
  const env = { TOVU_INTEGRATIONS_ROOT_KEY: "" };
  clearBlankRootKeyEnv(env);
  assert.equal("TOVU_INTEGRATIONS_ROOT_KEY" in env, false);
});

test("clearBlankRootKeyEnv: a set TOVU_INTEGRATIONS_ROOT_KEY is left untouched", () => {
  const env = { TOVU_INTEGRATIONS_ROOT_KEY: "abc" };
  clearBlankRootKeyEnv(env);
  assert.equal(env.TOVU_INTEGRATIONS_ROOT_KEY, "abc");
});

test("startQuietEnvDefaults: silences the root-key wall and daemon lifecycle lines by default", () => {
  assert.deepEqual(startQuietEnvDefaults({}), { TOVU_ROOT_KEY_NOTICE: "off", TOVU_DAEMON_LIFECYCLE_LOG: "off" });
});

test("startQuietEnvDefaults: an operator's own TOVU_DAEMON_LIFECYCLE_LOG wins", () => {
  assert.deepEqual(startQuietEnvDefaults({ TOVU_DAEMON_LIFECYCLE_LOG: "on" }), { TOVU_ROOT_KEY_NOTICE: "off" });
});

/**
 * `resolveStartHost` — the value `main()` both probes with AND (security-critical) writes back to
 * `process.env.TOVU_HOST` before importing `dist/src/index.js` in-process. `index.ts`'s own default
 * (`resolveBindHost(process.env.TOVU_HOST, undefined)`) is Node's all-interfaces bind when
 * `TOVU_HOST` is unset — correct for its OTHER caller, the container entrypoint, but wrong for a
 * developer's plain `npm start`, which must default to loopback-only unless the user opted in.
 */
test("resolveStartHost: TOVU_HOST unset → defaults to loopback-only 127.0.0.1", () => {
  assert.equal(resolveStartHost({}), "127.0.0.1");
});

test("resolveStartHost: TOVU_HOST empty string → still defaults to 127.0.0.1 (blank is not a value)", () => {
  assert.equal(resolveStartHost({ TOVU_HOST: "" }), "127.0.0.1");
});

test("resolveStartHost: TOVU_HOST explicitly set → the user's value wins untouched", () => {
  assert.equal(resolveStartHost({ TOVU_HOST: "0.0.0.0" }), "0.0.0.0");
});
