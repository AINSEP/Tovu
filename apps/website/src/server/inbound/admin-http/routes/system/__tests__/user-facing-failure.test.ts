import assert from "node:assert/strict";
import test from "node:test";
import { adminFailureResponse, sendAdminFailure } from "../site-share-errors.js";

test("the shared admin fallback says what failed and what to do without disclosing backend text", t => {
  t.mock.method(console, "error", () => {});
  const response = adminFailureResponse({ error: new Error("private SQL") });
  assert.equal(response.status, 500);
  assert.equal(response.body.error, `The request could not be completed. Check the result before repeating this operation. Copy details and report this problem. (error ${response.body.errorId})`);
  assert.equal(response.body.details?.failure.action, "Check the result before repeating this operation. Copy details and report this problem.");
  assert.equal(response.body.details?.failure.errorId, response.body.errorId);
  assert.equal(response.body.details?.failure.cause, "The error ID identifies the server report.");
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


test("registered route templates supply safe default wording and copyable evidence", t => {
  t.mock.method(console, "error", () => {});
  let body: any;
  const res = {
    req: { method: "PATCH", route: { path: "/api/admin/v1/workspaces/:workspaceId/pages/:id" }, baseUrl: "", path: "/api/admin/v1/workspaces/PRIVATE_WORKSPACE/pages/PRIVATE_ID?password=SECRET_CANARY" },
    locals: { principal: { id: "owner" } },
    status: () => ({ json: (value: unknown) => { body = value; } }),
  };
  sendAdminFailure({ res, error: new Error("PRIVATE_BACKEND password=SECRET_CANARY") });
  assert.match(body.error, /page/i);
  assert.match(body.details.failure.action, /saved/);
  assert.equal(body.details.failure.errorId, body.errorId);
  assert.equal(body.details.failure.step, "Save page");
  for (const canary of ["PRIVATE_WORKSPACE", "PRIVATE_ID", "PRIVATE_BACKEND", "SECRET_CANARY"])
    assert.equal(JSON.stringify(body).includes(canary), false);
});

test("anonymous HTTP failures disclose only safe wording and an incident reference", t => {
  t.mock.method(console, "error", () => {});
  let body: any;
  const res = {
    req: { method: "POST", route: { path: "/api/admin/v1/auth/login" }, baseUrl: "" },
    locals: {}, status: () => ({ json: (value: unknown) => { body = value; } }),
  };
  sendAdminFailure({ res, error: new Error("PRIVATE_BACKEND SECRET_CANARY") }, {
    message: "PRIVATE_MESSAGE SECRET_CANARY", details: { privateFact: "SECRET_CANARY" },
    failure: { action: "PRIVATE_ACTION SECRET_CANARY", step: "PRIVATE_STEP SECRET_CANARY", cause: "PRIVATE_CAUSE SECRET_CANARY", metadata: { time: "PRIVATE_TIME SECRET_CANARY", errorId: "PRIVATE_ID SECRET_CANARY" } },
  });
  assert.equal(body.details, undefined);
  assert.equal(body.privateFact, undefined);
  assert.match(body.error, /sign-in/);
  assert.match(body.error, new RegExp(body.errorId));
  for (const canary of ["PRIVATE_BACKEND", "PRIVATE_MESSAGE", "PRIVATE_ACTION", "PRIVATE_STEP", "PRIVATE_CAUSE", "PRIVATE_TIME", "PRIVATE_ID", "SECRET_CANARY"])
    assert.equal(JSON.stringify(body).includes(canary), false);
});
