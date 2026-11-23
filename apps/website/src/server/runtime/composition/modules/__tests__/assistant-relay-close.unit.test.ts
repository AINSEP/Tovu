import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

import { relayResponse } from "../assistant.js";

/** B128: a client that hangs up while the proxy is still waiting for the daemon's response headers
 * must not leave the upstream stream running once those headers finally arrive. */
test("relayResponse cancels the upstream body when the client closed before upstream headers arrived", async (t) => {
  let releaseUpstream!: (response: globalThis.Response) => void;
  const upstreamArrived = new Promise<globalThis.Response>((resolve) => { releaseUpstream = resolve; });
  let handlerEntered!: () => void;
  const entered = new Promise<void>((resolve) => { handlerEntered = resolve; });
  let responseClosed!: () => void;
  const closed = new Promise<void>((resolve) => { responseClosed = resolve; });
  let relayDone!: Promise<void>;

  const app = express();
  app.get("/api/runs/:runId/events", (req, res) => {
    res.on("close", () => responseClosed());
    relayDone = (async () => {
      handlerEntered();
      const upstream = await upstreamArrived;
      await relayResponse(upstream, req, res);
    })();
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const client = http.request({ host: "127.0.0.1", port: (server.address() as AddressInfo).port, path: "/api/runs/r1/events" });
  client.on("error", () => undefined);
  client.end();
  await entered;
  client.destroy();
  await closed;

  // Upstream headers arrive only now; its body would stream forever unless cancelled.
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull: () => new Promise<void>(() => undefined),
    cancel: () => { cancelled = true; },
  });
  releaseUpstream(new globalThis.Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));

  const outcome = await Promise.race([
    relayDone.then(() => "settled" as const),
    new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 1000).unref()),
  ]);
  assert.equal(cancelled, true, "the upstream body must be cancelled once the client is already gone");
  assert.equal(outcome, "settled");
});
