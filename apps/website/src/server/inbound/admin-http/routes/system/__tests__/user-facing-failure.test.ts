import assert from "node:assert/strict";
import test from "node:test";
import { adminFailureResponse, sendAdminFailure } from "../site-share-errors.js";

test("the shared admin fallback says what failed and what to do without disclosing backend text", t => {
  t.mock.method(console, "error", () => {});
  const response = adminFailureResponse({ error: new Error("private SQL") });
  assert.equal(response.status, 500);
  assert.equal(response.body.error, `The admin request could not finish. Check whether your change was saved, then copy the error ID and report this problem. (error ${response.body.errorId})`);
  assert.equal(JSON.stringify(response).includes("private SQL"), false);
});

test("a call site can opt into copyable evidence while retaining its own details and response field", t => {
  t.mock.method(console, "error", () => {});
  let body: any;
  const res = { status: () => ({ json: (value: unknown) => { body = value; } }) };
  sendAdminFailure({ res, error: new Error("private SQL") }, { message: "Pages could not be loaded.",
    failure: { action: "Reload Pages. If this continues, copy details and report this problem.", step: "pages.list" },
    details: { permission: "content.read" }, field: "message" });
  assert.equal(body.permission, "content.read");
  assert.equal(body.details.failure.step, "pages.list");
  assert.equal(body.details.failure.errorId, body.errorId);
  assert.equal(JSON.stringify(body).includes("private SQL"), false);
});


test("Tovu API keys never reach either diagnostic sink or export copy text", t => {
  const secret = "SHARE_SECRET_CANARY_abcdefghijklmnop";
  const key = `tovu_ak_012345abcdef.${secret}`;
  const logs: unknown[] = [], reports: unknown[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const error = new Error(`archive failed ${key}`);
  const response = adminFailureResponse({ error, tracker: { error: (input: any) => { reports.push(input.error.message); } } }, {
    message: "The export stopped while building the ZIP.",
    failure: { action: "Copy details and report this problem.", step: "archive", cause: error },
  });
  for (const output of [JSON.stringify(logs), JSON.stringify(reports), response.body.details!.failure.copyText]) {
    assert.ok(output.includes("[REDACTED:tovu_api_key]"));
    assert.ok(!output.includes(secret));
    assert.ok(!output.includes(key));
  }
});
