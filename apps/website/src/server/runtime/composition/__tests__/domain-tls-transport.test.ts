import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ClientRequest } from "node:http";
import type { RequestOptions } from "node:https";
import { PassThrough } from "node:stream";
import test from "node:test";

test("TLS diagnostic uses the real guarded transport with HEAD, pinned peer and default certificate validation", async () => {
  const requests: RequestOptions[] = [];
  const writes: unknown[] = [];
  const { FetchHttpTransportAdapter } = await import("@jini-ai/platform/http/guarded");
  const transport = new FetchHttpTransportAdapter({}, { request: ({ secure, options, onResponse: callback }) => {
    assert.equal(secure, true);
    requests.push(options);
    const request = new EventEmitter() as ClientRequest;
    request.destroy = error => { if (error) request.emit("error", error); return request; };
    request.write = (...args: unknown[]) => { writes.push(args); return true; };
    request.end = (() => {
      queueMicrotask(() => {
        const response = new PassThrough() as PassThrough & IncomingMessage;
        response.statusCode = 301;
        response.headers = { location: "https://elsewhere.example.com/" };
        const encoding = [undefined, "gzip", "br"][requests.length - 1];
        if (encoding) response.headers["content-encoding"] = encoding;
        callback(response);
        response.end();
      });
      return request;
    }) as ClientRequest["end"];
    return request;
  } });
  const dns = { resolve: async ({ hostname }: { hostname: string }) => {
    assert.equal(hostname, "example.com");
    return ["8.8.8.8"];
  } };
  const { createHttpClient } = await import("#src/platform/http/client");
  const { DOMAIN_DNS_EGRESS_POLICY, createTlsProbe } = await import("../domain-dns-adapters.js");
  const client = createHttpClient({ transport: { requestPinned: (request, peer) => transport.requestPinned({ request, peer }) }, policy: DOMAIN_DNS_EGRESS_POLICY }, { dns });
  assert.deepEqual(await createTlsProbe(client)({ domain: "example.com" }), { status: "verified", httpStatus: 301 });
  assert.equal(requests.length, 1);
  const request = requests[0]!;
  assert.equal(request.method, "HEAD");
  assert.equal(request.host, "8.8.8.8");
  assert.equal(request.port, 443);
  assert.equal(request.servername, "example.com");
  assert.equal(request.timeout, 15000);
  assert.equal(request.path, "/");
  assert.notEqual(request.rejectUnauthorized, false);
  assert.equal(request.checkServerIdentity, undefined);
  assert.deepEqual(request.headers, { "User-Agent": "Tovu/0.1.0", host: "example.com" });
  assert.deepEqual(writes, []);
  for (const encoding of ["gzip", "br"]) {
    assert.deepEqual(await createTlsProbe(client)({ domain: "example.com" }), { status: "verified", httpStatus: 301 }, `HEAD with ${encoding} headers must not decompress an absent body`);
    assert.equal(requests.at(-1)!.method, "HEAD");
  }
  assert.equal(requests.length, 3);
  assert.deepEqual(writes, []);
});
