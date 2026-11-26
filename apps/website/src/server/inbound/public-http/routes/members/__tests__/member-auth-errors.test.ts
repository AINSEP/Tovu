import { recordingComposedReporter } from "#src/server/__tests__/helpers/composed-reporter-probe";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCapturingResponse, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { respondToSignInError, reportMemberDeliveryFailure } from "../sign-in.js";
import { sendMemberAuthError } from "../complete-sign-in.js";
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
