/**
 * @file Coverage for `sites-mcp-server.ts` — the JSON-RPC handshake.
 *
 * These are the assertions that cannot be made from an integration test without owning a child
 * process, and they are the ones a protocol bug hides in: answering a notification (which wedges the
 * client's correlation table), returning a `nextCursor` the client will chase, dropping a request
 * whose id is `0`, or claiming a `listChanged` capability nothing honours.
 *
 * Every expectation here is traceable to the only client this server talks to,
 * `apps/website/src/assistant/mcp-federation/` — cited per test rather than assumed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  METHOD_NOT_FOUND,
  PREFERRED_PROTOCOL_VERSION,
  SERVER_INFO,
  handleSitesMcpRequest,
} from "./sites-mcp-server.ts";
import { sitesFilePath } from "./tracked-sites.ts";

function fakeContext() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-mcp-server-"));
  return { userDataDir, projectsPath: sitesFilePath(userDataDir), revealPath: async () => {} };
}

test("initialize echoes the client's supported protocol version and declares tools", async () => {
  // `mcp-protocol.ts:28` pins the client at this exact version.
  const response = await handleSitesMcpRequest(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: {} } },
    fakeContext(),
  );

  // `response` is known non-null here: this message has a real `method` and a usable `id`, so
  // `handleSitesMcpRequest` cannot have taken its null-returning path — see its own doc.
  assert.equal(response!.id, 1);
  assert.equal(response!.result.protocolVersion, "2025-06-18");
  assert.deepEqual(response!.result.serverInfo, SERVER_INFO);
  // `tools` present so the client knows tools exist; EMPTY so nothing claims `listChanged`, which
  // this server cannot honour and the client ignores anyway (`trust.ts` R5 freezes the set).
  assert.deepEqual(response!.result.capabilities, { tools: {} });
  assert.equal("listChanged" in response!.result.capabilities.tools, false);
});

test("initialize answers an unknown protocol version with one this server actually speaks", async () => {
  const response = await handleSitesMcpRequest(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2099-01-01" } },
    fakeContext(),
  );

  // Negotiation, not reflection. Reflecting would report agreement with a revision this code has
  // never been written against — and the client stores the value and later sends it back as a
  // header (`adapter.http.ts:178`).
  assert.equal(response!.result.protocolVersion, PREFERRED_PROTOCOL_VERSION);
  assert.notEqual(response!.result.protocolVersion, "2099-01-01");
});

test("notifications/initialized is NOT answered", async () => {
  // `adapter.stdio.ts:114` sends this with no `id`. A reply would arrive at the client's message
  // handler with an id it never issued; MCP requires no response at all.
  const response = await handleSitesMcpRequest({ jsonrpc: "2.0", method: "notifications/initialized" }, fakeContext());

  assert.equal(response, null);
});

test("any message without a usable id is treated as a notification rather than answered", async () => {
  const context = fakeContext();

  for (const message of [
    { jsonrpc: "2.0", method: "tools/list" },
    { jsonrpc: "2.0", method: "tools/list", id: null },
    { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } },
    {},
    null,
  ]) {
    assert.equal(await handleSitesMcpRequest(message, context), null, `answered ${JSON.stringify(message)}`);
  }
});

test("a request whose id is 0 or an empty string is still answered", async () => {
  const context = fakeContext();

  // The trap a truthiness check on `id` would introduce: the client's ids come from an incrementing
  // counter, so id `0` is the FIRST request of a connection, and dropping it would hang every
  // connection at `initialize` — while every test using id `1` still passed.
  for (const id of [0, ""]) {
    const response = await handleSitesMcpRequest({ jsonrpc: "2.0", id, method: "tools/list" }, context);
    assert.notEqual(response, null, `dropped a request with id ${JSON.stringify(id)}`);
    assert.equal(response!.id, id);
  }
});

test("tools/list returns every tool in ONE page with no nextCursor", async () => {
  const response = await handleSitesMcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }, fakeContext());

  assert.ok(Array.isArray(response!.result.tools));
  assert.ok(response!.result.tools.length >= 3);
  // `drainToolsList` (`mcp-protocol.ts:162-177`) follows a `nextCursor` while one is present and
  // throws past its page cap. A cursor here would send it looking for a second page forever.
  assert.equal("nextCursor" in response!.result, false);
});

test("tools/list tolerates a cursor it did not issue instead of failing the connection", async () => {
  const response = await handleSitesMcpRequest(
    { jsonrpc: "2.0", id: 3, method: "tools/list", params: { cursor: "whatever" } },
    fakeContext(),
  );

  assert.ok(Array.isArray(response!.result.tools));
});

test("tools/call dispatches to the named tool", async () => {
  const response = await handleSitesMcpRequest(
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_sites", arguments: {} } },
    fakeContext(),
  );

  assert.equal(response!.result.content[0].type, "text");
  assert.equal(response!.result.isError, undefined);
});

test("tools/call with no params is an error RESULT, not a thrown protocol error", async () => {
  const response = await handleSitesMcpRequest({ jsonrpc: "2.0", id: 5, method: "tools/call" }, fakeContext());

  // The distinction that matters: the client resolves a result and shows the model the text. A
  // JSON-RPC error here would surface as a connection-level failure with no correctable detail.
  assert.equal(response!.error, undefined);
  assert.equal(response!.result.isError, true);
});

test("an unsupported method answers -32601 and never a result", async () => {
  const response = await handleSitesMcpRequest({ jsonrpc: "2.0", id: 6, method: "resources/list" }, fakeContext());

  assert.equal(response!.error!.code, METHOD_NOT_FOUND);
  assert.equal(response!.result, undefined);
  assert.match(response!.error!.message, /resources\/list/);
});

test("every response carries jsonrpc 2.0 and echoes its request id", async () => {
  const context = fakeContext();

  for (const method of ["initialize", "tools/list", "resources/list"]) {
    const response = await handleSitesMcpRequest({ jsonrpc: "2.0", id: `req-${method}`, method }, context);
    assert.equal(response!.jsonrpc, "2.0");
    assert.equal(response!.id, `req-${method}`);
  }
});
