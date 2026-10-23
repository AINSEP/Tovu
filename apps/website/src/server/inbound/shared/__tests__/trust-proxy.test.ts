import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { evaluateHostSignals } from "#src/contracts/core/host-signals";
import { applyTrustProxy, resolveTrustProxySetting } from "../trust-proxy.js";

const declaration = { signals: [{ env: "EXAMPLE_APP", facts: { trustProxyHops: 1 } }] };
const hostSignals = evaluateHostSignals({ env: { EXAMPLE_APP: "site" }, declaration });
const noHostSignals = evaluateHostSignals({ env: {}, declaration });

/**
 * @file Express `trust proxy`: X-Forwarded-For is honored for exactly the platform edge's hops
 * when running behind a known platform proxy, or what TOVU_TRUST_PROXY says, and never otherwise.
 */

test("resolveTrustProxySetting: nothing set trusts no proxy", () => {
  assert.equal(resolveTrustProxySetting({ env: {} }, { hostSignals: noHostSignals }), false);
});

test("default binding reads bundled data, and applyTrustProxy uses process.env when omitted", t => {
  const prior = process.env.TOVU_TRUST_PROXY;
  t.after(() => { if (prior === undefined) delete process.env.TOVU_TRUST_PROXY; else process.env.TOVU_TRUST_PROXY = prior; });
  assert.equal(resolveTrustProxySetting({ env: {} }), false);
  process.env.TOVU_TRUST_PROXY = "2";
  const app = express();
  applyTrustProxy({ app });
  assert.equal(app.get("trust proxy"), 2);
});

test("resolveTrustProxySetting: a declared platform trusts exactly one edge hop", () => {
  assert.equal(resolveTrustProxySetting({ env: { EXAMPLE_APP: "tovu" } }, { hostSignals }), 1);
});

test("resolveTrustProxySetting: TOVU_TRUST_PROXY overrides, including turning the platform default off", () => {
  assert.equal(resolveTrustProxySetting({ env: { TOVU_TRUST_PROXY: "2" } }, { hostSignals }), 2);
  assert.equal(resolveTrustProxySetting({ env: { TOVU_TRUST_PROXY: "false", EXAMPLE_APP: "tovu" } }, { hostSignals }), false);
  assert.equal(resolveTrustProxySetting({ env: { TOVU_TRUST_PROXY: "0", EXAMPLE_APP: "tovu" } }, { hostSignals }), false);
  assert.equal(resolveTrustProxySetting({ env: { TOVU_TRUST_PROXY: " loopback, 10.0.0.0/8 " } }, { hostSignals }), "loopback, 10.0.0.0/8");
  assert.equal(resolveTrustProxySetting({ env: { TOVU_TRUST_PROXY: "", EXAMPLE_APP: "tovu" } }, { hostSignals }), 1);
});

test("resolveTrustProxySetting: refuses 'true', which would trust any client's X-Forwarded-For", () => {
  assert.throws(
    () => resolveTrustProxySetting({ env: { TOVU_TRUST_PROXY: "true" } }, { hostSignals }),
    {
      message:
        'TOVU_TRUST_PROXY="true" would trust X-Forwarded-For from any client. Set the number of proxy hops in front of Tovu (e.g. 1), or a list of proxy addresses/subnets.',
    },
  );
});

async function clientIpSeenBehind(env: NodeJS.ProcessEnv, t: import("node:test").TestContext, forwardedFor: string) {
  const app = express();
  applyTrustProxy({ app }, { env, hostSignals: evaluateHostSignals({ env, declaration }) });
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

test("one declared hop is honored: the edge address, not the client's spoofed first entry", async (t) => {
  const ip = await clientIpSeenBehind({ EXAMPLE_APP: "tovu" }, t, "6.6.6.6, 203.0.113.9");
  assert.equal(ip, "203.0.113.9");
});
