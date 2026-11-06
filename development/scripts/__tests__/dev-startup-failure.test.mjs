import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createServer } from "node:http";
import { PassThrough } from "node:stream";
import { finishDevStartup, waitForDevApi, observeDevApiAttachment, classifyChildExit } from "../dev.mjs";

test("the dev entrypoint gates its admin startup through the API readiness result", () => {
  const source = fs.readFileSync(new URL("../dev.mjs", import.meta.url), "utf8");
  assert.ok(source.includes("await finishDevStartup({ apiPort: API_PORT"));
  assert.ok(source.includes("waitForReady: () => waitForDevApi({ apiPort, scheme }, { certificate })"));
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


test("a split attachment line adopts only the launched site's verified lease", async () => {
  const stdout = new PassThrough();
  const record = { pid: 123, port: 4328, scheme: "https", app: "Desktop", token: "owner" };
  const adopted = [], reads = [];
  observeDevApiAttachment({ stdout, dir: "/sites/alpha" }, {
    readRunning: ({ dir }) => { reads.push(dir); return record; },
    adopt: input => adopted.push(input), mirror: new PassThrough(),
  });
  stdout.write("Using the site already run");
  assert.deepEqual(adopted, []);
  stdout.end("ning in Desktop: https://localhost:4328/admin/\n");
  assert.deepEqual(reads, ["/sites/alpha"]);
  assert.deepEqual(adopted, [{ dir: "/sites/alpha", record }]);
  assert.equal(classifyChildExit({ shuttingDown: false, planned: false, code: 0, attached: true }), "attached");
  assert.equal(classifyChildExit({ shuttingDown: false, planned: false, code: 1, attached: true }), "crash");
  assert.equal(classifyChildExit({ shuttingDown: false, planned: false, code: 0, attached: false }), "crash");
});

test("a URL line without a lease for the selected site cannot attach to a different site or foreign process", () => {
  const stdout = new PassThrough();
  observeDevApiAttachment({ stdout, dir: "/sites/alpha" }, {
    readRunning: () => null, adopt: () => assert.fail("no verified owner"), mirror: new PassThrough(),
  });
  stdout.end("Using the site already running in Web: http://localhost:4328/admin/\n");
});

test("readiness follows an attached site's address and startup continues without a second admin", async () => {
  const record = { pid: 123, port: 4328, scheme: "https", app: "Desktop", token: "owner" };
  const readAttachment = () => record;
  const probed = [], lines = [];
  assert.equal(await waitForDevApi({ apiPort: 4327, scheme: "http" }, {
    readAttachment, wait: async (url, options) => assert.equal(await options.probe({ url, timeoutMs: 100 }), true),
    probe: async ({ url }) => { probed.push(url); return true; },
  }), true);
  assert.deepEqual(probed, ["https://127.0.0.1:4328/readyz"]);
  assert.equal(await finishDevStartup({ apiPort: 4327, vitePort: 5327, scheme: "http" }, {
    waitForReady: async () => true, readAttachment, isShuttingDown: () => false,
    log: line => lines.push(line), stop: () => assert.fail("attachment is success"),
    startAdmin: () => assert.fail("the running site already serves its admin"),
  }), true);
  assert.match(lines.join("\n"), /https:\/\/localhost:4328\/admin\//);
});


test("an unreadable selected-site lease refuses attachment with a recovery step", () => {
  const stdout = new PassThrough(), warnings = [];
  observeDevApiAttachment({ stdout, dir: "/sites/alpha" }, {
    readRunning: () => { throw new Error("fixture invalid record"); },
    adopt: () => assert.fail("invalid ownership cannot attach"), mirror: new PassThrough(),
    warn: line => warnings.push(line),
  });
  stdout.end("Using the site already running in Web: http://localhost:4328/admin/\n");
  assert.match(warnings.join("\n"), /could not verify.*selected site's running record/);
  assert.match(warnings.join("\n"), /Stop it in the other Tovu app.*npm run dev/);
});

test("an attachment still starting cannot probe the requested port or report success early", async () => {
  let record = { app: "Desktop", scheme: "http", port: 0 };
  const probed = [];
  assert.equal(await waitForDevApi({ apiPort: 4327, scheme: "http" }, {
    readAttachment: () => record,
    wait: async (url, options) => {
      assert.equal(await options.probe({ url, timeoutMs: 100 }), false);
      assert.deepEqual(probed, []);
      record = { ...record, port: 4328 };
      assert.equal(await options.probe({ url, timeoutMs: 100 }), true);
    },
    probe: async ({ url }) => { probed.push(url); return true; },
  }), true);
  assert.deepEqual(probed, ["http://127.0.0.1:4328/readyz"]);
});
