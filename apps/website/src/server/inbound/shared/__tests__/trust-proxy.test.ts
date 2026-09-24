import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { applyTrustProxy, resolveTrustProxySetting } from "../trust-proxy.js";

/**
 * @file Express `trust proxy`: X-Forwarded-For is honored for exactly the platform edge's hops
 * when running behind a known proxy (Fly), or what TOVU_TRUST_PROXY says, and never otherwise.
 */

test("resolveTrustProxySetting: nothing set trusts no proxy", () => {
  assert.equal(resolveTrustProxySetting({}), false);
});

test("resolveTrustProxySetting: on Fly, trusts exactly one hop (Fly's edge)", () => {
  assert.equal(resolveTrustProxySetting({ FLY_APP_NAME: "tovu" }), 1);
});

test("resolveTrustProxySetting: TOVU_TRUST_PROXY overrides, including turning Fly's default off", () => {
  assert.equal(resolveTrustProxySetting({ TOVU_TRUST_PROXY: "2" }), 2);
  assert.equal(resolveTrustProxySetting({ TOVU_TRUST_PROXY: "false", FLY_APP_NAME: "tovu" }), false);
  assert.equal(resolveTrustProxySetting({ TOVU_TRUST_PROXY: "0", FLY_APP_NAME: "tovu" }), false);
  assert.equal(resolveTrustProxySetting({ TOVU_TRUST_PROXY: " loopback, 10.0.0.0/8 " }), "loopback, 10.0.0.0/8");
  assert.equal(resolveTrustProxySetting({ TOVU_TRUST_PROXY: "", FLY_APP_NAME: "tovu" }), 1);
});

test("resolveTrustProxySetting: refuses 'true', which would trust any client's X-Forwarded-For", () => {
  assert.throws(
    () => resolveTrustProxySetting({ TOVU_TRUST_PROXY: "true" }),
    {
      message:
        'TOVU_TRUST_PROXY="true" would trust X-Forwarded-For from any client. Set the number of proxy hops in front of Tovu (e.g. 1), or a list of proxy addresses/subnets.',
    },
  );
});

async function clientIpSeenBehind(env: NodeJS.ProcessEnv, t: import("node:test").TestContext, forwardedFor: string) {
  const app = express();
  applyTrustProxy(app, env);
  app.get("/ip", (req, res) => {
    res.json({ ip: resolveClientIp(req) });
  });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/ip`, { headers: { "x-forwarded-for": forwardedFor } });
  return ((await res.json()) as { ip: string }).ip;
}

test("running locally, a spoofed X-Forwarded-For is ignored: the socket peer is the client", async (t) => {
  const ip = await clientIpSeenBehind({}, t, "6.6.6.6");
  assert.match(ip, /^(::ffff:)?127\.0\.0\.1$|^::1$/);
});

test("on Fly, one hop is honored: the address Fly's edge appended, not the client's spoofed first entry", async (t) => {
  const ip = await clientIpSeenBehind({ FLY_APP_NAME: "tovu" }, t, "6.6.6.6, 203.0.113.9");
  assert.equal(ip, "203.0.113.9");
});
