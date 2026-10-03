import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { DeployError, safeDnsLabel } from "@jini-ai/devops/deploy";

import { DEPLOY_FETCH_TIMEOUTS, createDeployHostKit } from "../host-kit.js";

/**
 * @file `host-kit.ts` — what a plugin deploy module gets instead of npm imports. The one piece with
 * logic of its own is `fetch`'s timeout; the rest adapts devops' generic helpers to the installed plugin ABI.
 */

async function withServer(handler: Parameters<typeof createServer>[1], fn: (url: string) => Promise<void>): Promise<void> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("kit.fetch returns the response when it arrives within the timeout", async () => {
  await withServer(
    (_req, res) => res.end("ok"),
    async (url) => {
      const response = await createDeployHostKit().fetch(url, {}, { timeoutMs: 2_000 });
      assert.equal(await response.text(), "ok");
    },
  );
});

test("kit.fetch aborts with the exact timeout message when the server is slower than timeoutMs", async () => {
  await withServer(
    () => undefined, // never responds
    async (url) => {
      await assert.rejects(createDeployHostKit().fetch(url, {}, { timeoutMs: 50 }), { message: `fetch timed out after 50ms: ${url}` });
    },
  );
});

test("kit.fetch still honours the caller's own abort signal", async () => {
  await withServer(
    () => undefined,
    async (url) => {
      const controller = new AbortController();
      const pending = createDeployHostKit().fetch(url, { signal: controller.signal }, { timeoutMs: 5_000 });
      controller.abort(new Error("caller cancelled"));
      await assert.rejects(pending, { message: "caller cancelled" });
    },
  );
});

test("the kit preserves positional plugin helpers and timeout classes", async () => {
  const kit = createDeployHostKit();
  const error = new kit.DeployError("provider refused", 502, { upstream: true });
  assert.ok(error instanceof DeployError);
  assert.equal(error.message, "provider refused");
  assert.equal(error.status, 502);
  assert.deepEqual(error.details, { upstream: true });
  assert.equal(kit.safeDnsLabel("My site!"), safeDnsLabel({ raw: "My site!" }));
  assert.equal(kit.safeProjectLabel("My site!", 2).length, 2);
  assert.equal(kit.normalizeDeploymentUrl("site.example"), "https://site.example");
  assert.equal(kit.redirectGuardInit({}).redirect, "manual");
  assert.throws(() => kit.assertNotRedirected(new Response(null, { status: 302 }), "Example"), kit.DeployError);
  assert.deepEqual(kit.timeouts, { QUICK: 15_000, DEPLOY: 30_000, UPLOAD: 120_000 });
  assert.equal(kit.timeouts, DEPLOY_FETCH_TIMEOUTS);
  const started = Date.now();
  await kit.sleep(20);
  assert.ok(Date.now() - started >= 15);
});


// REGRESSION: fails if the host omits createNodeReachabilityPorts' required guard binding.
test("reachability adapts fetch and the plugin's positional protected-response callback", async () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const kit = createDeployHostKit({ fetchFn: async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    return new Response("protected", { status: 401 });
  } });
  const result = await kit.checkDeploymentUrl("https://8.8.8.8", { detectProtected: (resp, body) => {
    assert.equal(resp.status, 401);
    assert.equal(body, "protected");
    return true;
  } });
  assert.equal(result.status, "protected");
  assert.deepEqual(calls, [{ url: "https://8.8.8.8/", method: "HEAD" }]);
});


// PARITY: rejected provider URLs never reach the injected transport; public links still do.
test("deployment reachability refuses private links before fetch and probes public links", async () => {
  const urls: string[] = [];
  const kit = createDeployHostKit({ fetchFn: async (url) => {
    urls.push(String(url));
    return new Response("ok", { status: 200 });
  } });
  const refused = await kit.checkDeploymentUrl("https://127.0.0.1/internal");
  assert.equal(refused.reachable, false);
  assert.deepEqual(urls, []);
  const accepted = await kit.checkDeploymentUrl("https://8.8.8.8/public");
  assert.equal(accepted.reachable, true);
  assert.deepEqual(urls, ["https://8.8.8.8/public"]);
});
