import assert from "node:assert/strict";
import test from "node:test";
import { allowsLocalOwnerSignInRequest, consumeLocalOwnerSignIn, resolveLocalOwnerSignIn, warnOnLocalOwnerSignIn } from "../local-owner-signin.js";

/** devsignin: production/LAN/deployed configurations never enable browser owner bootstrap. */
const dev = { NODE_ENV: "development", TOVU_DEV_OWNER_SIGNIN: "1", TOVU_HOST: "127.0.0.1", TOVU_DEV_SUPERVISOR_PID: "42" };
const noContainer = { pathExists: () => false };

test("devsignin: an explicit local launcher enables sign-in and an absent/disabled flag never does", () => {
  assert.deepEqual(resolveLocalOwnerSignIn({ env: dev }, noContainer), { enabled: true });
  assert.deepEqual(resolveLocalOwnerSignIn({ env: {} }, noContainer), { enabled: false });
  assert.deepEqual(resolveLocalOwnerSignIn({ env: { ...dev, TOVU_DEV_OWNER_SIGNIN: "0" } }, noContainer), { enabled: false });
  assert.equal(resolveLocalOwnerSignIn({ env: { ...dev, TOVU_DEV_SUPERVISOR_PID: undefined, TOVU_LOCAL_SITE_OWNER_PID: "99" } }, noContainer).enabled, true);
});

test("devsignin: every production/remote/deployment signal refuses, even when the flag was copied", () => {
  for (const override of [
    { NODE_ENV: "production" }, { NODE_ENV: undefined }, { TOVU_RUNTIME_MODE: "production" },
    { TOVU_HOST: "0.0.0.0" }, { TOVU_HOST: "::" }, { TOVU_HOST: undefined },
    { TOVU_HOST: "localhost" },
    { TOVU_DEV_SUPERVISOR_PID: undefined }, { TOVU_DEV_SUPERVISOR_PID: "oops" },
    { TOVU_PUBLIC_URL: "https://example.com" }, { TOVU_PUBLIC_URL: "broken" },
    { FLY_APP_NAME: "deployed" }, { KUBERNETES_SERVICE_HOST: "10.0.0.1" },
  ]) {
    const policy = resolveLocalOwnerSignIn({ env: { ...dev, ...override } }, noContainer);
    assert.equal(policy.enabled, false, JSON.stringify(override));
    assert.match(policy.warning ?? "", /^\[local-owner-signin\] WARNING: TOVU_DEV_OWNER_SIGNIN is disabled:/);
  }
  assert.equal(resolveLocalOwnerSignIn({ env: dev }, { pathExists: () => true }).enabled, false);
  assert.equal(resolveLocalOwnerSignIn({ env: dev }, { pathExists: () => { throw new Error("probe unavailable"); } }).enabled, false);
});

test("devsignin: boot warning has an exact reason and no configuration values", () => {
  const lines: string[] = [];
  warnOnLocalOwnerSignIn({ env: { ...dev, TOVU_PUBLIC_URL: "https://example.com/private" } }, { ...noContainer, warn: (line) => lines.push(line) });
  assert.deepEqual(lines, ["[local-owner-signin] WARNING: TOVU_DEV_OWNER_SIGNIN is disabled: public origin is not loopback. Local owner sign-in requires a loopback dev launcher; deployed sites keep per-site accounts."]);
  warnOnLocalOwnerSignIn({ env: dev }, { ...noContainer, warn: (line) => lines.push(line) });
  assert.equal(lines.length, 1);
});

test("devsignin: local browser origins must match Host exactly; rebinding and cross-site requests refuse", () => {
  for (const host of ["localhost:5173", "127.0.0.1:3001", "[::1]:3001"]) {
    assert.equal(allowsLocalOwnerSignInRequest({ host, origin: `https://${host}`, fetchSite: "same-origin", fetchMode: "cors", headers: {} }), true);
  }
  for (const request of [
    { host: "evil.example:3000", origin: "https://evil.example:3000", fetchSite: "same-origin" },
    { host: "localhost:3000", origin: "https://evil.example", fetchSite: "cross-site" },
    { host: "localhost:3000", origin: "https://localhost:3001", fetchSite: "same-site" },
    { host: "localhost:3000", origin: "https://localhost:3000", fetchSite: "cross-site" },
    { host: "localhost:3000", origin: undefined, fetchSite: "same-origin" },
    { host: undefined, origin: "https://localhost:3000", fetchSite: "same-origin" },
    { host: "localhost:3000", origin: "null", fetchSite: undefined },
    { host: "localhost:3000", origin: "https://user:password@localhost:3000", fetchSite: "same-origin" },
    { host: "localhost:3000", origin: "https://localhost:3000/path", fetchSite: "same-origin" },
  ]) assert.equal(allowsLocalOwnerSignInRequest({ ...request, fetchMode: "cors", headers: {} }), false);
});

test("fxdev: only same-origin CORS fetches can bootstrap the browser session", () => {
  const request = { host: "localhost:3000", origin: "http://localhost:3000", fetchSite: "same-origin", fetchMode: "cors", headers: {} };
  for (const fetchSite of [undefined, "", "none", "same-site", "cross-site", "same-origin, same-origin"]) {
    assert.equal(allowsLocalOwnerSignInRequest({ ...request, fetchSite }), false);
  }
  for (const fetchMode of [undefined, "", "navigate", "no-cors", "websocket", "cors, cors"]) {
    assert.equal(allowsLocalOwnerSignInRequest({ ...request, fetchMode }), false);
  }
  assert.equal(allowsLocalOwnerSignInRequest(request), true);
});

test("fxdev: proxy markers refuse even with loopback Host, matching Origin and forged fetch metadata", () => {
  const request = { host: "localhost:3000", origin: "http://localhost:3000", fetchSite: "same-origin", fetchMode: "cors" };
  for (const name of ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port", "x-forwarded-prefix", "x-forwarded-custom", "x-real-ip", "via", "cf-connecting-ip", "true-client-ip", "x-original-host", "X-Forwarded-For", "x-client-ip", "x-cluster-client-ip", "fastly-client-ip", "tailscale-user-login", "x-original-forwarded-for", "x-envoy-external-address", "x-ms-client-principal"]) {
    for (const value of ["", "127.0.0.1", ["127.0.0.1"]]) {
      assert.equal(allowsLocalOwnerSignInRequest({ ...request, headers: { [name]: value } }), false, name);
    }
  }
});


test("deskfx S1: a desktop capability admits a loopback launch without a development flag", () => {
  const env = { TOVU_DESKTOP_OWNER_SIGNIN: "a".repeat(64), TOVU_DESKTOP_OWNER_PID: String(process.ppid), TOVU_HOST: "127.0.0.1" };
  assert.equal(resolveLocalOwnerSignIn({ env }, noContainer).enabled, true);
  assert.equal(resolveLocalOwnerSignIn({ env: { ...env, NODE_ENV: "production" } }, noContainer).enabled, true);
  for (const override of [
    { TOVU_DESKTOP_OWNER_SIGNIN: "1" }, { TOVU_DESKTOP_OWNER_PID: undefined }, { TOVU_DESKTOP_OWNER_PID: "bad" },
    { TOVU_HOST: "0.0.0.0" }, { TOVU_PUBLIC_URL: "https://remote.example" },
    { TOVU_RUNTIME_MODE: "production" }, { FLY_APP_NAME: "live" }, { KUBERNETES_SERVICE_HOST: "live" },
  ]) assert.equal(resolveLocalOwnerSignIn({ env: { ...env, ...override } }, noContainer).enabled, false, JSON.stringify(override));
  assert.equal(resolveLocalOwnerSignIn({ env }, { pathExists: () => true }).enabled, false);
  assert.equal(resolveLocalOwnerSignIn({ env: { NODE_ENV: "development", TOVU_HOST: "127.0.0.1", TOVU_DEV_SUPERVISOR_PID: "42" } }, noContainer).enabled, false);
});


test("deskfx2 MUST-1: desktop capability is captured, scrubbed and requires the actual parent", () => {
  const secret = "a".repeat(64);
  const env = { NODE_ENV: "production", TOVU_DESKTOP_OWNER_SIGNIN: secret, TOVU_DESKTOP_OWNER_PID: "42", TOVU_HOST: "127.0.0.1" };
  const policy = consumeLocalOwnerSignIn({ env }, { ...noContainer, parentPid: 42 });
  assert.equal(policy.enabled, true);
  assert.equal("TOVU_DESKTOP_OWNER_SIGNIN" in env, false);
  assert.equal("TOVU_DESKTOP_OWNER_PID" in env, false);
  for (const capability of [undefined, "", "b".repeat(64), "a".repeat(63), "a".repeat(65)]) {
    assert.equal(policy.acceptsCapability?.({ capability }), false);
  }
  assert.equal(policy.acceptsCapability?.({ capability: secret }), true);
  assert.equal(consumeLocalOwnerSignIn({ env }, { ...noContainer, parentPid: 42 }).enabled, false);
  const wrongParent = consumeLocalOwnerSignIn({ env: { ...env, TOVU_DESKTOP_OWNER_SIGNIN: secret, TOVU_DESKTOP_OWNER_PID: "41" } }, { ...noContainer, parentPid: 42 });
  assert.equal(wrongParent.enabled, false);
  assert.match(wrongParent.warning ?? "", /TOVU_DESKTOP_OWNER_SIGNIN is disabled/);
  assert.equal(JSON.stringify(wrongParent).includes(secret), false);
});

test("deskfx2 MUST-1: a server child inherits no desktop capability", async () => {
  const { spawnSync } = await import("node:child_process");
  const moduleUrl = new URL("../local-owner-signin.ts", import.meta.url).href;
  const source = `import { bootLocalOwnerSignIn } from ${JSON.stringify(moduleUrl)};
    import { spawnSync } from "node:child_process";
    const child = spawnSync(process.execPath, ["-e", 'process.stdout.write(JSON.stringify({secret:process.env.TOVU_DESKTOP_OWNER_SIGNIN,pid:process.env.TOVU_DESKTOP_OWNER_PID}))'], {encoding:"utf8"});
    process.stdout.write(JSON.stringify({captured:typeof bootLocalOwnerSignIn.enabled === "boolean", child:JSON.parse(child.stdout), status:child.status}));`;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], {
    encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "production", TOVU_HOST: "127.0.0.1",
      TOVU_DESKTOP_OWNER_SIGNIN: "a".repeat(64), TOVU_DESKTOP_OWNER_PID: String(process.pid) },
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { captured: true, child: {}, status: 0 });
});

test("TW2: launch refusal reasons and precedence describe the existing policy", () => {
  const cases: readonly [Record<string, string | undefined>, string][] = [
    [{ TOVU_DESKTOP_OWNER_PID: "42" }, "invalid desktop capability or launcher parent"],
    [{ NODE_ENV: "test" }, "production or non-development mode"],
    [{ FLY_APP_NAME: "live", TOVU_DEV_SUPERVISOR_PID: "bad" }, "deployment detected"],
    [{ TOVU_DEV_SUPERVISOR_PID: "0" }, "no local dev launcher"],
    [{ TOVU_DEV_SUPERVISOR_PID: "1.5" }, "no local dev launcher"],
    [{ TOVU_DEV_SUPERVISOR_PID: "9007199254740992" }, "no local dev launcher"],
    [{ TOVU_DEV_SUPERVISOR_PID: "", TOVU_LOCAL_SITE_OWNER_PID: "42" }, "no local dev launcher"],
    [{ TOVU_HOST: "0.0.0.0", TOVU_PUBLIC_URL: "bad" }, "listener is not loopback-only"],
    [{ TOVU_HOST: "bad" }, "listener address is invalid"],
    [{ TOVU_PUBLIC_URL: "https://example.com" }, "public origin is not loopback"],
    [{ TOVU_PUBLIC_URL: "bad" }, "public origin is invalid"],
  ];
  for (const [override, reason] of cases) {
    const policy = resolveLocalOwnerSignIn({ env: { ...dev, ...override } }, noContainer);
    assert.equal(policy.enabled, false);
    assert.ok(policy.warning?.includes(`is disabled: ${reason}.`), reason);
  }
  const probeFailure = resolveLocalOwnerSignIn({ env: dev }, { pathExists: () => { throw new Error("probe"); } });
  assert.ok(probeFailure.warning?.includes("deployment status could not be verified"));
  for (const TOVU_PUBLIC_URL of ["", "http://localhost/path", "https://[::1]:4000"]) {
    assert.deepEqual(resolveLocalOwnerSignIn({ env: { ...dev, TOVU_PUBLIC_URL } }, noContainer), { enabled: true });
  }
});

test("TW2: request admission pins proxy prefix, origin parsing and canonical spelling guards", () => {
  const request = { host: "localhost:3000", origin: "http://localhost:3000", fetchSite: "same-origin", fetchMode: "cors", headers: {} };
  for (const name of ["X-Envoy-Custom", "X-MS-Custom", "X-Forwarded-Custom"]) {
    assert.equal(allowsLocalOwnerSignInRequest({ ...request, headers: { [name]: undefined } }), false);
  }
  assert.equal(allowsLocalOwnerSignInRequest({ ...request, headers: { "x-unrelated": "", accept: "*/*" } }), true);
  for (const origin of ["bad", "ftp://localhost:3000", "http://localhost:3000/", "http://LOCALHOST:3000", "http://localhost:3001", "http://u@localhost:3000"]) {
    assert.equal(allowsLocalOwnerSignInRequest({ ...request, origin }), false, origin);
  }
});
