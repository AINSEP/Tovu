import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createServer } from "node:http";
import { finishDevStartup, waitForDevApi } from "../dev.mjs";

test("the dev entrypoint gates its admin startup through the API readiness result", () => {
  const source = fs.readFileSync(new URL("../dev.mjs", import.meta.url), "utf8");
  assert.ok(source.includes("await finishDevStartup({ apiPort: API_PORT"));
  assert.ok(source.includes("waitForReady = () => waitForDevApi({ apiPort, scheme }, { certificate })"));
  assert.ok(source.includes("waitForReady: () => waitForDevApi({ apiPort: API_PORT, scheme }, { certificate })"));
  assert.equal(source.includes("starting the admin anyway"), false);
});

test("a failed API boot never announces success or leaves admin Vite running", async () => {
  const events = [];
  const ready = await finishDevStartup({ apiPort: 3002, vitePort: 5175, scheme: "http" }, {
    waitForReady: async () => false, isShuttingDown: () => false,
    log: message => events.push(message), warn: message => events.push(message),
    stop: code => events.push(code), startAdmin: () => events.push("Vite started"),
  });
  assert.equal(ready, false);
  assert.equal(events.at(-1), 1);
  assert.match(events[0], /API did not become ready/);
  assert.equal(events.some(event => String(event).includes("API is up")), false);
  assert.equal(events.includes("Vite started"), false);
});

test("admin Vite starts and success is announced only after API readiness", async () => {
  const events = [];
  assert.equal(await finishDevStartup({ apiPort: 3002, vitePort: 5175, scheme: "https" }, {
    waitForReady: async () => { events.push("ready"); return true; }, isShuttingDown: () => false,
    log: message => events.push(message), stop: () => events.push("stopped"),
    startAdmin: input => events.push(input),
  }), true);
  assert.equal(events[0], "ready");
  assert.match(events[1], /API is up.*https:\/\/localhost:3002\/admin\//);
  assert.deepEqual(events[2], { apiPort: 3002, vitePort: 5175, apiScheme: "https", extraCaCerts: undefined });
});

test("an API that exits during readiness cannot start admin Vite", async () => {
  assert.equal(await finishDevStartup({ apiPort: 3002, vitePort: 5175, scheme: "http" }, {
    waitForReady: async () => true, isShuttingDown: () => true,
    log: () => assert.fail("must not announce success"), startAdmin: () => assert.fail("must not start Vite"),
  }), false);
});

test("a bound API socket cannot announce readiness until readyz accepts the configured TLS leaf", async () => {
  const calls = [];
  const certificate = Buffer.from("configured leaf");
  const ready = await waitForDevApi({ apiPort: 3002, scheme: "https" }, { certificate,
    wait: async (url, options) => {
      assert.equal(url, "https://127.0.0.1:3002/readyz");
      assert.equal(options.timeoutMs, 90_000);
      assert.equal(await options.probe({ url, timeoutMs: 2000 }), false);
      assert.equal(await options.probe({ url, timeoutMs: 50 }), true);
      return true;
    },
    probe: async (required, optional) => { calls.push({ required, optional }); return calls.length === 2; },
  });
  assert.equal(ready, true);
  assert.deepEqual(calls.map(call => call.optional), [
    { certificate, servername: "localhost", timeoutMs: 1500 },
    { certificate, servername: "localhost", timeoutMs: 50 },
  ]);
});

test("failed HTTP readiness returns false to the dev stack shutdown owner", async () => {
  assert.equal(await waitForDevApi({ apiPort: 3002, scheme: "http" }, {
    wait: async () => { throw new Error("timed out waiting for readyz"); },
  }), false);
});

test("an API that binds before boot completes must answer readyz successfully before dev reports success", async t => {
  const paths = [];
  const server = createServer((request, response) => {
    paths.push(request.url);
    response.writeHead(paths.length === 1 ? 503 : 200).end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  assert.equal(await waitForDevApi({ apiPort: server.address().port, scheme: "http" }), true);
  assert.deepEqual(paths, ["/readyz", "/readyz"]);
});
