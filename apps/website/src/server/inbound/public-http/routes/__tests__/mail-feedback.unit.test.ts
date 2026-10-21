import assert from "node:assert/strict";
import { connect } from "node:net";
import test from "node:test";
import express from "express";
import type { MailFeedbackRequest, MailFeedbackRoute } from "#src/features/mail/index";
import { parsePublicJsonBody } from "../../../shared/json-body-parsers.js";
import { startTestServer } from "../../../../__tests__/helpers/http-test-server.js";
import { MAIL_FEEDBACK_PATH, registerMailFeedbackRoute } from "../mail-feedback.js";

/**
 * @file The Express mount of `POST /hooks/mail/:providerId`: the handler sees the exact request
 * bytes even with the app's public JSON parser behind it, any content type is read raw, the body cap
 * answers JSON 413, an unreadable body 400, and a handler failure a redacted 500.
 */

function fakeRoute(handle: (input: MailFeedbackRequest) => Promise<{ status: 200 | 401; body: { ok: boolean } }>, maxBodyBytes = 64): MailFeedbackRoute & { seen: MailFeedbackRequest[] } {
  const seen: MailFeedbackRequest[] = [];
  return { maxBodyBytes, seen, handle: async (input) => { seen.push(input); return handle(input); } };
}

async function serve(t: test.TestContext, route: MailFeedbackRoute): Promise<string> {
  const app = express();
  registerMailFeedbackRoute({ app, route });
  app.use(parsePublicJsonBody);
  return startTestServer(app, t);
}

test("the route path is the documented webhook path", () => {
  assert.equal(MAIL_FEEDBACK_PATH, "/hooks/mail/:providerId");
});

test("the handler gets the raw bytes, provider id and headers, and its status/body are returned", async (t) => {
  const route = fakeRoute(async () => ({ status: 401, body: { ok: false } }));
  const base = await serve(t, route);
  const body = '{ "type":  "email.bounced" }';
  const response = await fetch(`${base}/hooks/mail/resend`, { method: "POST", headers: { "content-type": "application/json", "svix-id": "msg_1" }, body });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false });
  const [seen] = route.seen;
  assert.equal(seen!.providerId, "resend");
  assert.equal(new TextDecoder().decode(seen!.rawBody), body, "whitespace intact: the JSON parser never ran first");
  assert.equal(seen!.headers["svix-id"], "msg_1");
});

test("a request with no body reaches the handler as empty bytes", async (t) => {
  const route = fakeRoute(async () => ({ status: 200, body: { ok: true } }));
  const base = await serve(t, route);
  assert.equal((await fetch(`${base}/hooks/mail/resend`, { method: "POST" })).status, 200);
  assert.equal(route.seen[0]!.rawBody.byteLength, 0);
});

test("a request with no length and no transfer encoding (no parsed body) reaches the handler as empty bytes", async (t) => {
  const route = fakeRoute(async () => ({ status: 200, body: { ok: true } }));
  const { port } = new URL(await serve(t, route));
  const reply = await new Promise<string>((resolve, reject) => {
    const socket = connect(Number(port), "127.0.0.1", () => socket.end("POST /hooks/mail/resend HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"));
    let text = "";
    socket.on("data", (chunk) => { text += chunk; }).on("end", () => resolve(text)).on("error", reject);
  });
  assert.match(reply, /^HTTP\/1\.1 200/);
  assert.equal(route.seen[0]!.rawBody.byteLength, 0);
});

test("an oversized body is a JSON 413 and never reaches the handler", async (t) => {
  const route = fakeRoute(async () => ({ status: 200, body: { ok: true } }), 8);
  const base = await serve(t, route);
  const response = await fetch(`${base}/hooks/mail/resend`, { method: "POST", headers: { "content-type": "text/plain" }, body: "x".repeat(100) });
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { ok: false, error: "body too large" });
  assert.equal(route.seen.length, 0);
});

test("an undecodable body is a 400", async (t) => {
  const route = fakeRoute(async () => ({ status: 200, body: { ok: true } }));
  const base = await serve(t, route);
  const response = await fetch(`${base}/hooks/mail/resend`, { method: "POST", headers: { "content-type": "text/plain", "content-encoding": "gzip" }, body: "not gzip" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "unreadable body" });
});

test("a handler failure is a redacted 500", async (t) => {
  const route = fakeRoute(async () => { throw new Error("secret detail"); });
  const base = await serve(t, route);
  const response = await fetch(`${base}/hooks/mail/resend`, { method: "POST", body: "{}" });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, error: "feedback could not be recorded" });
});
