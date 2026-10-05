import assert from "node:assert/strict";
import test from "node:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { clearBlankSiteKeyEnv, LEGACY_SITE_KEY_ENV_VAR_NAME, planStart, probePortFree, resolveStartHost, startQuietEnvDefaults } from "../start.mjs";

/**
 * @file `planStart` — the pure port/env decision `development/scripts/start.mjs`'s `main()` makes
 * before importing the compiled server (npm-start-just-works-plan-2026-09-24, Slice 2, decision 4).
 *
 * `isPortFree` is retained as a legacy input only. Tests prove it is never called: availability
 * is decided by the actual HTTP(S) listener, with collision retries covered in Jini devops.
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

test("PORT unset, TOVU_PUBLIC_URL loopback:3000, port 3000 busy → defers binding and drops TOVU_PUBLIC_URL", async () => {
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

  assert.equal(result.port, 3000);
  assert.deepEqual(result.envOverrides, { TOVU_START_AUTO_PORT: "1" });
  assert.deepEqual(result.envRemovals, ["TOVU_PUBLIC_URL"]);
  assert.deepEqual(calls, [], "the launcher must never probe; the actual server binds");
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

test("3000-3019 all busy → let actual listener report exhaustion", async () => {
  const probed = [];
  const isPortFree = async (port) => {
    probed.push(port);
    return false;
  };

  const result = await planStart({ env: {}, dotenvLoaded: true, isPortFree });

  assert.equal(result.port, 3000);
  assert.deepEqual(result.envOverrides, { TOVU_START_AUTO_PORT: "1" });
  assert.equal(result.refuse, undefined);
  assert.deepEqual(probed, [], "a probe cannot determine whether the eventual bind will succeed");
});

test("PORT unset, TOVU_PUBLIC_URL unset, port 3000 free → enable direct binding", async () => {
  const result = await planStart({ env: {}, dotenvLoaded: true, isPortFree: alwaysFree });

  assert.equal(result.port, 3000);
  assert.deepEqual(result.envOverrides, { TOVU_START_AUTO_PORT: "1" });
});

test("PORT unset, TOVU_PUBLIC_URL loopback at a port OTHER than 3000, 3000 busy → defer binding, TOVU_PUBLIC_URL dropped", async () => {
  const isPortFree = async (port) => port !== 3000;

  const result = await planStart({
    env: { TOVU_PUBLIC_URL: "https://127.0.0.1:5173" },
    dotenvLoaded: true,
    isPortFree,
  });

  assert.equal(result.port, 3000);
  assert.deepEqual(result.envOverrides, { TOVU_START_AUTO_PORT: "1" });
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

test("port 3000 free, TOVU_PUBLIC_URL loopback → direct binding, TOVU_PUBLIC_URL dropped", async () => {
  const result = await planStart({ env: { TOVU_PUBLIC_URL: "http://127.0.0.1:3000" }, dotenvLoaded: true, isPortFree: alwaysFree });

  assert.equal(result.port, 3000);
  assert.deepEqual(result.envOverrides, { TOVU_START_AUTO_PORT: "1" });
  assert.deepEqual(result.envRemovals, ["TOVU_PUBLIC_URL"]);
});

test("non-loopback TOVU_PUBLIC_URL is never dropped", async () => {
  const result = await planStart({ env: { TOVU_PUBLIC_URL: "https://tovu.example.com" }, dotenvLoaded: true, isPortFree: alwaysFree });

  assert.deepEqual(result.envRemovals, []);
});

/**
 * `clearBlankSiteKeyEnv` runs BEFORE `.env` is loaded. `process.loadEnvFile` never overrides a
 * variable already present, even an empty one, and the keyring treats an empty value as absent — so
 * a blank shell `TOVU_SITE_KEY` would hide `.env`'s real key and let
 * `tovu root-key ensure` mint a second one.
 */
test("clearBlankSiteKeyEnv: blank TOVU_SITE_KEY is removed so .env can fill it", () => {
  const env = { TOVU_SITE_KEY: "" };
  clearBlankSiteKeyEnv(env);
  assert.equal("TOVU_SITE_KEY" in env, false);
});

test("clearBlankSiteKeyEnv: a set TOVU_SITE_KEY is left untouched", () => {
  const env = { TOVU_SITE_KEY: "abc" };
  clearBlankSiteKeyEnv(env);
  assert.equal(env.TOVU_SITE_KEY, "abc");
});

test("startQuietEnvDefaults: silences the site key wall and daemon lifecycle lines by default", () => {
  assert.deepEqual(startQuietEnvDefaults({}), { TOVU_SITE_KEY_NOTICE: "off", TOVU_DAEMON_LIFECYCLE_LOG: "off" });
});

test("startQuietEnvDefaults: an operator's own TOVU_DAEMON_LIFECYCLE_LOG wins", () => {
  assert.deepEqual(startQuietEnvDefaults({ TOVU_DAEMON_LIFECYCLE_LOG: "on" }), { TOVU_SITE_KEY_NOTICE: "off" });
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

test("IPv6 loopback TOVU_PUBLIC_URL → enables direct binding and drops the stale URL", async () => {
  const calls = [];
  const result = await planStart({
    env: { TOVU_PUBLIC_URL: "http://[::1]:3000" },
    dotenvLoaded: true,
    isPortFree: async (port) => { calls.push(port); return port !== 3000; },
  });
  assert.equal(result.port, 3000);
  assert.deepEqual(result.envOverrides, { TOVU_START_AUTO_PORT: "1" });
  assert.deepEqual(result.envRemovals, ["TOVU_PUBLIC_URL"]);
  assert.deepEqual(calls, [], "the launcher must never probe; the actual server binds");
  assert.equal(result.refuse, undefined);
});

test("main supplies the imported server with loopback binding and the final env after .env and port planning", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "tovu-start-wiring-"));
  try {
    mkdirSync(path.join(fixture, "development", "scripts"), { recursive: true });
    mkdirSync(path.join(fixture, "dist", "src"), { recursive: true });
    for (const name of ["start.mjs", "load-repo-root-env.mjs"]) {
      copyFileSync(new URL(`../${name}`, import.meta.url), path.join(fixture, "development", "scripts", name));
    }
    writeFileSync(path.join(fixture, "package.json"), '{"type":"module"}');
    writeFileSync(path.join(fixture, ".env"), "TOVU_SITE_KEY=fixture-root-key\nTOVU_PUBLIC_URL=http://localhost:3000\n");
    // Any port probe fails this regression. The stub reads the exact env main supplied; no
    // repository .env or existing compiled server is touched.
    writeFileSync(path.join(fixture, "runner.mjs"), `
      import { mock } from "node:test";
      import { EventEmitter } from "node:events";
      import { fileURLToPath } from "node:url";
      mock.module("node:net", { namedExports: {
        connect: () => { throw new Error("launcher must not probe"); },
        createServer: () => { throw new Error("launcher must not bind a probe"); },
      }});
      const entry = new URL("./development/scripts/start.mjs", import.meta.url);
      process.argv[1] = fileURLToPath(entry);
      await import(entry);
    `);
    writeFileSync(path.join(fixture, "dist", "src", "index.js"), `
        console.log("LAUNCHER_RESULT " + JSON.stringify({
          host: process.env.TOVU_HOST,
          port: process.env.PORT,
          autoStartPort: process.env.TOVU_START_AUTO_PORT,
          publicUrlPresent: "TOVU_PUBLIC_URL" in process.env,
          siteKey: process.env.TOVU_SITE_KEY,
          siteKeyNotice: process.env.TOVU_SITE_KEY_NOTICE,
          lifecycleLog: process.env.TOVU_DAEMON_LIFECYCLE_LOG,
        }));
    `);
    const env = { ...process.env, TOVU_SITE_KEY: "", [LEGACY_SITE_KEY_ENV_VAR_NAME]: "" };
    for (const key of ["TOVU_HOST", "PORT", "TOVU_PUBLIC_URL", "TOVU_SITE_KEY_NOTICE", "TOVU_DAEMON_LIFECYCLE_LOG", "TOVU_START_AUTO_PORT"]) delete env[key];
    if (env.NODE_V8_COVERAGE) env.NODE_V8_COVERAGE = path.join(fixture, "coverage");
    const child = spawnSync(process.execPath, ["--experimental-test-module-mocks", "runner.mjs"], {
      cwd: fixture, env, encoding: "utf8", timeout: 10_000,
    });
    assert.equal(child.status, 0, child.stderr);
    const line = child.stdout.split("\n").find((value) => value.startsWith("LAUNCHER_RESULT "));
    assert.ok(line, "the compiled server stub must actually be imported");
    assert.deepEqual(JSON.parse(line.slice("LAUNCHER_RESULT ".length)), {
      host: "127.0.0.1", autoStartPort: "1", publicUrlPresent: false,
      siteKey: "fixture-root-key", siteKeyNotice: "off", lifecycleLog: "off",
    });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

for (const [listenerHost, probeHost] of [["127.0.0.1", "::1"], ["::1", "127.0.0.1"]]) {
  test(`probePortFree notices an occupied ${listenerHost} port even when probing a bind on ${probeHost}`, async (t) => {
    const listener = createServer((socket) => socket.destroy());
    t.after(() => new Promise((resolve) => listener.close(() => resolve())));
    await new Promise((resolve, reject) => {
      listener.once("error", reject);
      listener.listen({ port: 0, host: listenerHost, ipv6Only: true }, resolve);
    });
    const port = listener.address().port;
    assert.equal(await probePortFree(port, probeHost), false);
    await new Promise((resolve) => listener.close(resolve));
    assert.equal(await probePortFree(port, probeHost), true, "a released port is usable again");
  });
}

test("unparsable TOVU_PUBLIC_URL → refuses auto-pick without probing or changing env", async () => {
  const result = await planStart({
    env: { TOVU_PUBLIC_URL: "not a url" },
    dotenvLoaded: true,
    isPortFree: () => { throw new Error("must not probe a malformed public URL"); },
  });
  assert.deepEqual(result, { port: 3000, envOverrides: {}, envRemovals: [], refuse: "unparsable-public-url" });
});

for (const name of ["TOVU_SITE_KEY", LEGACY_SITE_KEY_ENV_VAR_NAME]) {
  test(`clearBlankSiteKeyEnv clears whitespace under ${name} and preserves set keys`, () => {
    for (const blank of ["", " ", "\t\n"]) {
      const env = { [name]: blank };
      clearBlankSiteKeyEnv(env);
      assert.equal(name in env, false);
    }
    const env = { [name]: "ab".repeat(32) };
    clearBlankSiteKeyEnv(env);
    assert.equal(env[name], "ab".repeat(32));
  });
}
