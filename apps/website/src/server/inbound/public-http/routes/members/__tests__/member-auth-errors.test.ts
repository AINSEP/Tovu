import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCapturingResponse, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { respondToSignInError, reportMemberDeliveryFailure } from "../sign-in.js";
import { sendMemberAuthError } from "../complete-sign-in.js";
import { MemberAuthError } from "#src/features/members/index";

for (const send of [respondToSignInError, sendMemberAuthError]) test(`${send.name} returns safe correlated JSON and keeps credential refusal`, async t => {
  const logs = t.mock.method(console, "error", () => {});
  const reports: unknown[] = [];
  const app = express();
  app.get("/failure", (_req, res) => { res.locals.adminFailureTracker = { error: (...args: unknown[]) => reports.push(args) }; send({ res, error: new Error("member context password=MEMBER_CANARY") }); });
  const base = await startTestServer(app, t);
  const res = await fetch(`${base}/failure`);
  const body = await res.json();
  assert.equal(res.status, 500);
  assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
  assert.match(body.error, /couldn’t complete sign-in/);
  assert.ok(body.errorId);
  assert.equal(reports.length, 1);
  assert.equal(logs.mock.calls.length, 1);
  assert.ok(JSON.stringify(reports).includes(body.errorId));
  assert.doesNotMatch(JSON.stringify(body) + JSON.stringify(reports) + JSON.stringify(logs.mock.calls), /MEMBER_CANARY/);
  const { res: refused, capture } = createCapturingResponse();
  send({ res: refused, error: new MemberAuthError("private credential refusal") });
  assert.equal(capture.statusCode, 401);
  assert.deepEqual(capture.jsonBody, { error: "invalid credentials", code: "INVALID_CREDENTIALS" });
  assert.equal(logs.mock.calls.length, 1);
});

test("post-acceptance delivery failure reports privately without changing acceptance", t => {
  const logs = t.mock.method(console, "error", () => {});
  reportMemberDeliveryFailure({ error: new Error("delivery context password=DELIVERY_CANARY") });
  assert.equal(logs.mock.calls.length, 1);
  assert.match(JSON.stringify(logs.mock.calls), /delivery context/);
  assert.doesNotMatch(JSON.stringify(logs.mock.calls), /DELIVERY_CANARY/);
});
