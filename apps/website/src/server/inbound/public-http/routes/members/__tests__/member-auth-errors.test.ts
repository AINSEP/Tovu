import { recordingComposedReporter } from "#src/server/__tests__/helpers/composed-reporter-probe";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCapturingResponse, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { respondToSignInError, reportMemberDeliveryFailure } from "../sign-in.js";
import { clearedMemberSessionCookie, memberSessionCookie, sendMemberAuthError, setMemberSessionCookie } from "../complete-sign-in.js";
import { MemberAuthError } from "@jini-ai/user-management/members/types";
import { SenderIdentityNotConfiguredError } from "#src/platform/mail/index";

for (const send of [respondToSignInError, sendMemberAuthError]) test(`${send.name} returns safe correlated JSON and keeps credential refusal`, async t => {
  const logs = t.mock.method(console, "error", () => {});
  const { reporter, records, reports } = recordingComposedReporter();
  const app = express();
  app.get("/failure", (_req, res) => { res.locals.failureReporter = reporter; send({ res, error: new Error("member context password=MEMBER_CANARY") }); });
  const base = await startTestServer(app, t);
  const res = await fetch(`${base}/failure`);
  const body = await res.json();
  assert.equal(res.status, 500);
  assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
  assert.match(body.error, /couldn’t complete sign-in/);
  assert.ok(body.errorId);
  assert.equal(reports.length, 1);
  assert.equal(logs.mock.calls.length, 0);
  assert.equal(records.length, 1);
  assert.ok(JSON.stringify(reports).includes(body.errorId));
  assert.doesNotMatch(JSON.stringify(body) + JSON.stringify(reports) + JSON.stringify(records), /MEMBER_CANARY/);
  const { res: refused, capture } = createCapturingResponse();
  send({ res: refused, error: new MemberAuthError("private credential refusal") });
  assert.equal(capture.statusCode, 401);
  assert.deepEqual(capture.jsonBody, { error: "invalid credentials", code: "INVALID_CREDENTIALS" });
  assert.equal(logs.mock.calls.length, 0);
  assert.equal(records.length, 1);
});

test("post-acceptance delivery failure reports privately without changing acceptance", t => {
  const logs = t.mock.method(console, "error", () => {});
  const recorded: unknown[] = [];
  reportMemberDeliveryFailure({ error: new Error("delivery context password=DELIVERY_CANARY"), reporter: { record: (...args: unknown[]) => { recorded.push(args); return { errorId: "ERR-0000-0000-0000-0001" }; } } });
  // The composed reporter is the only sink (it redacts); the legacy console line is gone.
  assert.equal(logs.mock.calls.length, 0);
  assert.equal(recorded.length, 1);
  assert.match(JSON.stringify(recorded), /public:member-delivery/);
});

test("site-wide sender setup refusal stays 503 without leaking a provider exception", t => {
  const logs = t.mock.method(console, "error", () => {});
  const { res, capture } = createCapturingResponse();
  const failure = new SenderIdentityNotConfiguredError({ workspaceId: "ws-private", driver: "smtp password=PROVIDER_CANARY" });
  respondToSignInError({ res, error: failure });
  assert.equal(capture.statusCode, 503);
  assert.deepEqual(capture.jsonBody, { error: "Member sign-in is unavailable: email is not set up for this site.", code: "MEMBER_SIGN_IN_UNAVAILABLE" });
  assert.doesNotMatch(JSON.stringify(capture.jsonBody), /PROVIDER_CANARY|ws-private/);
  assert.equal(logs.mock.calls.length, 0, "a known refusal is not an incident");
});

test("the member cookie writer appends a scoped session without replacing earlier cookies", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-24T12:00:00.000Z") });
  const app = express();
  app.post("/complete", (_req, res) => {
    res.append("Set-Cookie", "preference=compact; Path=/");
    setMemberSessionCookie({ res, rawToken: "signed+value", expiresAtIso: "2026-10-24T12:01:30.000Z" });
    res.status(204).end();
  });
  const result = await fetch(`${await startTestServer(app, t)}/complete`, { method: "POST" });
  assert.equal(result.status, 204);
  const cookies = result.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.equal(cookies[0], "preference=compact; Path=/");
  const [value, ...attributes] = cookies[1]!.split("; ");
  assert.equal(value, "tovu_member_session=signed%2Bvalue");
  assert.deepEqual(new Set(attributes), new Set([
    "Max-Age=90", "Path=/", "Expires=Sat, 24 Oct 2026 12:01:30 GMT", "HttpOnly", "Secure", "SameSite=Lax",
  ]));
});

test("the member sign-out cookie empties the session under the same name and scope it was set with", () => {
  const parse = (header: string) => {
    const [value, ...attributes] = header.split("; ");
    return { value, attributes: new Set(attributes) };
  };
  const cleared = parse(clearedMemberSessionCookie());
  assert.equal(cleared.value, "tovu_member_session=");
  assert.deepEqual(cleared.attributes, new Set([
    "Path=/", "Expires=Thu, 01 Jan 1970 00:00:00 GMT", "HttpOnly", "Secure", "SameSite=Lax",
  ]));
  const issued = parse(memberSessionCookie({ rawToken: "issued-token", expiresAtIso: "2099-01-01T00:00:00.000Z" }));
  const scope = (attributes: Set<string>) => [...attributes].filter(attribute => !/^(?:Expires|Max-Age)=/.test(attribute)).sort();
  assert.deepEqual(scope(cleared.attributes), scope(issued.attributes), "the browser matches the clear to the issued cookie");
});
