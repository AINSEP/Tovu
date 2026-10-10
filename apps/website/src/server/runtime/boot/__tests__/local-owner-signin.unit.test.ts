import assert from "node:assert/strict";
import test from "node:test";
import { allowsLocalOwnerSignInRequest, resolveLocalOwnerSignIn, warnOnLocalOwnerSignIn } from "../local-owner-signin.js";

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
