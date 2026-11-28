import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { runWithExternalMcpRateLimit } from "@jini-ai/cms/admin-http/routes/external-mcp/route-helpers";
import { registeringWithOAuthAdmission } from "../admin-route-mount-support.js";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file The OAuth admission wrapper hands the kit's rate gate real response writers. A refused
 * attempt must reach the browser as a 429 carrying `Retry-After` and the kit's JSON body, and the
 * route handler must never run; an admitted attempt reaches the handler untouched.
 */

type Verdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

function mountWithLimiter(verdict: Verdict) {
  const app = express();
  const keys: string[] = [];
  let handled = 0;
  const registrar = registeringWithOAuthAdmission({
    app, method: "post",
    limiter: { check: async ({ key }: { key: string }) => { keys.push(key); return verdict; } },
    before: (facts, next) => runWithExternalMcpRateLimit({ deps: facts.rate, run: next }),
  });
  registrar.post("/oauth/connect", (_req, res) => { handled += 1; res.status(200).json({ ok: true }); });
  return { app, keys, handledCount: () => handled };
}

test("a rate-refused OAuth attempt is a 429 with Retry-After and the kit body; the handler never runs", async t => {
  const { app, keys, handledCount } = mountWithLimiter({ allowed: false, retryAfterSeconds: 42 });
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}/oauth/connect`, { method: "POST" });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "42");
  assert.deepEqual(await response.json(), {
    error: "too many OAuth attempts", code: "RATE_LIMIT_EXCEEDED", details: { retryAfterSeconds: 42 },
  });
  assert.equal(handledCount(), 0);
  assert.equal(keys.length, 1);
  assert.match(keys[0] ?? "", /127\.0\.0\.1|::1/, "the limiter is keyed by the caller's address");
});

test("an admitted OAuth attempt reaches the handler and carries no Retry-After", async t => {
  const { app, handledCount } = mountWithLimiter({ allowed: true });
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}/oauth/connect`, { method: "POST" });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("retry-after"), null);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(handledCount(), 1);
});
