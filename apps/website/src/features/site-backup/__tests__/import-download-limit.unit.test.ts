import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";
import test from "node:test";
import { FetchTimeoutError } from "@jini-ai/platform/fetch-with-timeout";
import { mapErrorToCliOutcome } from "../../../cli/errors.js";
import { FetchHttpTransportAdapter } from "@jini-ai/platform/http/guarded";
import { createHttpClient } from "../../../platform/http/client.js";
import { SITE_IMPORT_EGRESS_POLICY } from "../../../platform/http/egress-policies.js";
import { downloadShareArchive } from "../import-backend-steps.js";

test("share download retains a complete 101 MiB response under the existing 300 MiB policy", async () => {
  const chunk = Buffer.alloc(1024 * 1024, 255);
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
  assert.equal(archive.at(-1), 255);
});


test("share download timeout details in CLI output identify only the origin", () => {
  const error = new FetchTimeoutError("https://provider.example/share/sample-share-code/site.tovu.zip?download=sample-query", 120000);
  const outcome = mapErrorToCliOutcome(error);
  assert.match(outcome.stderrLine!, /fetch timed out after 120000ms: https:\/\/provider\.example/);
  assert.ok(!outcome.stderrLine!.includes("sample-share-code"));
  assert.ok(!outcome.stderrLine!.includes("sample-query"));
  assert.ok(!outcome.stderrLine!.includes("/share/"));
});


test("share download requests bytes and reuses the response buffer", async () => {
  const body = Buffer.from([0xff, 0xfe, 0x80, 0]);
  const archive = await downloadShareArchive({ url: "https://provider.example/archive.zip", signal: new AbortController().signal,
    http: { send: async request => {
      assert.equal(request.bodyAs, "bytes");
      assert.equal(request.totalDeadlineMs, 240_000);
      return { status: 200, headers: { "content-type": "application/zip" }, bodyText: "", bodyBytes: body, bodyBytesTruncated: false };
    } },
  });
  assert.equal(archive, body);
});


for (const elapsedMs of [239_999, 240_000]) test(`share download at ${elapsedMs} ms preserves the verification budget and names a slow download`, async () => {
  const deadline = new AbortController();
  let deadlineMs = 0;
  const body = Buffer.from([255]);
  const http = createHttpClient({ policy: SITE_IMPORT_EGRESS_POLICY, transport: { requestPinned: async request => {
    if (elapsedMs >= deadlineMs) deadline.abort(new Error("Download clock elapsed."));
    request.signal?.throwIfAborted();
    return { status: 200, headers: { "content-type": "application/zip" }, bodyText: "", bodyBytes: body, bodyBytesTruncated: false };
  } } }, { dns: { resolve: async () => ["93.184.216.34"] }, clock: {
    nowMs: () => elapsedMs,
    timeoutSignal: ({ timeoutMs }) => { deadlineMs = timeoutMs; return deadline.signal; },
  } });
  const download = downloadShareArchive({ http, url: "https://provider.example/share/sample-file.zip?id=sample-query", signal: new AbortController().signal });
  if (elapsedMs < 240_000) assert.equal(await download, body);
  else await assert.rejects(download, error => {
    assert.equal((error as { code: string }).code, "DOWNLOAD_TIMEOUT");
    assert.equal((error as Error).message, "The share download from https://provider.example timed out after 240 seconds. Download the ZIP file and import it.");
    const output = mapErrorToCliOutcome(error).stderrLine!;
    assert.match(output, /share download.*240 seconds/);
    assert.equal(output.includes("sample-file"), false);
    assert.equal(output.includes("sample-query"), false);
    return true;
  });
  assert.equal(deadlineMs, 240_000);
  assert.ok(5 * 60_000 - deadlineMs >= 60_000);
});
