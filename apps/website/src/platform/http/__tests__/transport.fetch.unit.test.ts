import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ClientRequest } from "node:http";
import type { RequestOptions } from "node:https";
import { PassThrough } from "node:stream";
import test from "node:test";
import { FetchHttpTransportAdapter } from "@jini-ai/platform/http/guarded";
import { createHttpClient } from "../client.js";

test("the guarded production transport dials the vetted IP and preserves authority and TLS SNI", async () => {
  const calls: Array<{ secure: boolean; options: RequestOptions }> = [];
  const request = (secure: boolean) => (options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    calls.push({ secure, options });
    const req = new EventEmitter() as ClientRequest;
    req.destroy = (error) => { if (error) req.emit("error", error); return req; };
    req.end = (() => {
      queueMicrotask(() => {
        const response = new PassThrough() as PassThrough & IncomingMessage;
        response.statusCode = 200;
        response.headers = { "x-fixture": "yes" };
        callback(response);
        response.end("wire response");
      });
      return req;
    }) as ClientRequest["end"];
    return req;
  };
  // Fake only the socket effect: the native adapter still constructs options and reads the body.
  const transport = new FetchHttpTransportAdapter({}, {
    request: ({ secure, options, onResponse }) => request(secure)(options, onResponse),
  });
  let lookups = 0;
  const dns = {
    resolve: async ({ hostname }: { hostname: string }) => {
      assert.equal(hostname, "provider.example");
      lookups += 1;
      return ["8.8.8.8"];
    },
  };
  const client = createHttpClient({
    transport: { requestPinned: (request, peer) => transport.requestPinned({ request, peer }) },
    policy: {
      allowedSchemes: ["https", "http"], denyPrivateAddresses: true, devHostAllowlist: [],
      maxRedirects: 0, connectTimeoutMs: 500, maxResponseBytes: 1000, maxDecompressedBytes: 1000,
    },
  }, { dns });
  for (const [url, secure, port] of [["https://provider.example:8443/path?x=1", true, 8443], ["http://provider.example/path?x=1", false, 80]] as const) {
    const result = await client.send({ method: "GET", url, headers: { "X-Kept": "yes" }, timeoutMs: 100 });
    assert.equal(result.status, 200);
    assert.equal(result.bodyText, "wire response");
    const call = calls.at(-1)!;
    assert.equal(call.secure, secure);
    assert.equal(call.options.host, "8.8.8.8", "dial the vetted address rather than resolving the hostname again");
    assert.equal(call.options.port, port);
    assert.equal(call.options.path, "/path?x=1");
    assert.equal(call.options.timeout, 100);
    assert.equal((call.options.headers as Record<string, string>).host, new URL(url).host);
    assert.equal((call.options.headers as Record<string, string>)["X-Kept"], "yes");
    assert.equal(call.options.servername, secure ? "provider.example" : undefined);
  }
  assert.equal(calls.length, 2);
  assert.equal(lookups, 2);
});
