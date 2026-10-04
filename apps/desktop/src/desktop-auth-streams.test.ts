/** Auth must drain real response streams and resolve transport failures for the shell's caller. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";

import { redeemBootSession, hasValidSession, endSiteSession } from "./desktop-auth.ts";
import type { AuthBodyRequest, AuthRequestOptions } from "./desktop-auth.ts";

const adminUrl = "http://127.0.0.1:3210/admin/";

/** End is withheld until the test ends the stream; without a data listener it never drains. */
function streamingNet({ statusCode }: { statusCode: number }) {
  const response = Object.assign(new PassThrough(), { statusCode });
  const calls: AuthRequestOptions<unknown>[] = [];
  const net = {
    request(options: AuthRequestOptions<unknown>): AuthBodyRequest {
      calls.push(options);
      const request = new EventEmitter() as EventEmitter & AuthBodyRequest;
      request.setHeader = () => {};
      request.write = () => {};
      request.end = () => request.emit("response", response);
      return request;
    },
  };
  return { net, response, calls };
}

test("redemption drains a chunked response and waits for end before accepting the session", { timeout: 2000 }, async (t) => {
  const transport = streamingNet({ statusCode: 200 });
  t.after(() => transport.response.destroy());
  let settled = false;
  const pending = redeemBootSession({ net: transport.net, session: {}, adminUrl, bootToken: "one-use" })
    .then((result) => { settled = true; return result; });
  transport.response.write("{\"user\":");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(settled, false, "headers and a partial body must not complete authentication");
  transport.response.end("{\"id\":1}}");
  assert.deepEqual(await pending, { ok: true, status: 200 });
  assert.equal(transport.response.readableEnded, true, "the socket body must be consumed");
});

test("session validity drains the principal body before reporting the server's answer", { timeout: 2000 }, async (t) => {
  for (const statusCode of [200, 401]) {
    const transport = streamingNet({ statusCode });
    t.after(() => transport.response.destroy());
    const session = { cookies: { get: async () => [{ name: "tovu_session", value: "cookie" }] } };
    let settled = false;
    const pending = hasValidSession({ net: transport.net, session, adminUrl })
      .then((result) => { settled = true; return result; });
    // The cookie lookup is async; let the request attach before delivering a body.
    await new Promise<void>((resolve) => setImmediate(resolve));
    transport.response.write("principal body");
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(transport.calls[0]?.session, session);
    assert.equal(transport.calls[0]?.useSessionCookies, true);
    transport.response.end();
    assert.equal(await pending, statusCode === 200);
    assert.equal(transport.response.readableEnded, true);
  }
});

test("logout drains an error response and reports the HTTP failure after end", { timeout: 2000 }, async (t) => {
  const transport = streamingNet({ statusCode: 503 });
  t.after(() => transport.response.destroy());
  let settled = false;
  const pending = endSiteSession({ net: transport.net, session: {}, adminUrl })
    .then((result) => { settled = true; return result; });
  transport.response.write("service unavailable");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  transport.response.end();
  assert.deepEqual(await pending, { ok: false, status: 503, reason: "logout responded 503" });
  assert.equal(transport.response.readableEnded, true);
});

/** Errors come from the request, before any HTTP response is available. */
function failingNet({ error }: { error: Error }) {
  return {
    request(): AuthBodyRequest {
      const request = new EventEmitter() as EventEmitter & AuthBodyRequest;
      request.setHeader = () => {};
      request.write = () => {};
      request.end = () => request.emit("error", error);
      return request;
    },
  };
}

test("a failed boot-token transport resolves with the cause so the shell can load the login form", async () => {
  const net = failingNet({ error: new Error("ECONNRESET during redemption") });
  assert.deepEqual(await redeemBootSession({ net, session: {}, adminUrl, bootToken: "one-use" }), {
    ok: false, reason: "ECONNRESET during redemption",
  });
});

test("a failed logout transport resolves with the cause instead of blocking window close", async () => {
  const net = failingNet({ error: new Error("ECONNREFUSED during logout") });
  assert.deepEqual(await endSiteSession({ net, session: {}, adminUrl }), {
    ok: false, reason: "ECONNREFUSED during logout",
  });
});
