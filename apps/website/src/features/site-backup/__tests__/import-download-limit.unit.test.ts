import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";
import test from "node:test";
import { FetchHttpTransportAdapter } from "@jini-ai/platform/http/guarded";
import { createHttpClient } from "../../../platform/http/client.js";
import { SITE_IMPORT_EGRESS_POLICY } from "../../../platform/http/egress-policies.js";
import { downloadShareArchive } from "../import-backend-steps.js";

test("share download retains a complete 101 MiB response under the existing 300 MiB policy", async () => {
  const chunk = Buffer.alloc(1024 * 1024, 120);
  const transport = new FetchHttpTransportAdapter({}, { request: ({ onResponse }) => {
    const request = new EventEmitter() as ClientRequest;
    let stopped = false;
    request.destroy = error => { stopped = true; if (error) request.emit("error", error); return request; };
    request.end = (() => {
      queueMicrotask(() => {
        const response = new PassThrough() as PassThrough & IncomingMessage;
        response.statusCode = 200;
        response.headers = { "content-type": "application/zip" };
        onResponse(response);
        for (let i = 0; i < 101 && !stopped; i++) response.write(chunk);
        response.end();
      });
      return request;
    }) as ClientRequest["end"];
    return request;
  } });
  const http = createHttpClient({ policy: SITE_IMPORT_EGRESS_POLICY,
    transport: { requestPinned: (request, peer) => transport.requestPinned({ request, peer }) },
  }, { dns: { resolve: async () => ["93.184.216.34"] } });
  const archive = await downloadShareArchive({ http, url: "https://provider.example/archive.tovu.zip", signal: new AbortController().signal });
  assert.equal(archive.length, 101 * 1024 * 1024);
  assert.equal(archive.at(-1), 120);
});
