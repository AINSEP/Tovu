import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { DeployError, safeDnsLabel } from "@jini-ai/devops/deploy";

import { DEPLOY_FETCH_TIMEOUTS, createDeployHostKit } from "../host-kit.js";

/**
 * @file `host-kit.ts` — what a plugin deploy module gets instead of npm imports. The one piece with
 * logic of its own is `fetch`'s timeout; the rest is devops' generic helpers passed through.
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

test("the kit passes devops' generic helpers and timeout classes through unchanged", async () => {
  const kit = createDeployHostKit();
  assert.equal(kit.DeployError, DeployError);
  assert.equal(kit.safeDnsLabel, safeDnsLabel);
  assert.deepEqual(kit.timeouts, { QUICK: 15_000, DEPLOY: 30_000, UPLOAD: 120_000 });
  assert.equal(kit.timeouts, DEPLOY_FETCH_TIMEOUTS);
  const started = Date.now();
  await kit.sleep(20);
  assert.ok(Date.now() - started >= 15);
});
