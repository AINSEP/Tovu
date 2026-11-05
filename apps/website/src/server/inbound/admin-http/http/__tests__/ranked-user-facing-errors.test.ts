import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminAssistantGetSettingsRoute } from "../../routes/assistant/get-settings.js";
import { registerAdminPageListRoute } from "../../routes/pages/list.js";
import { registerAdminPageUpdateRoute } from "../../routes/pages/update.js";
import { registerAdminMediaListRoute } from "../../routes/media/list.js";
import { registerAdminPostUpdateRoute } from "../../routes/posts/update.js";
import { respondToSettingsError } from "../../routes/settings/shared.js";
import { sendValidationOrInternalError } from "../../routes/media/route-guards.js";
import { importErrorResponse } from "../../routes/publish-content/import-errors.js";

const ranked = [
  { register: registerAdminAssistantGetSettingsRoute, method: "GET", path: "assistant/settings", step: "assistant.settings.load", message: "Assistant settings could not be loaded." },
  { register: registerAdminPageListRoute, method: "GET", path: "pages", step: "pages.list", message: "Pages could not be loaded." },
  { register: registerAdminPageUpdateRoute, method: "PUT", path: "pages/p1", step: "pages.save", message: "The page could not be saved." },
  { register: registerAdminMediaListRoute, method: "GET", path: "media", step: "media.list", message: "The media library could not be loaded." },
  { register: registerAdminPostUpdateRoute, method: "PUT", path: "posts/p1", step: "posts.save", message: "The post could not be saved." },
];

for (const row of ranked) {
  test(`${row.step}: unexpected failure names the operation with safe copyable evidence`, async t => {
    const logged = t.mock.method(console, "error", () => {});
    const fail = async () => { throw new Error("CANARY_BACKEND password=CANARY_SECRET"); };
    const app = express();
    app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
    row.register(app, { workspaceId: "ws", authorize: fail, assistantSettingsReady: Promise.resolve(),
      clock: { nowIso: () => "2026-11-04T12:00:00Z", nowMs: () => 0 }, idGen: { newId: () => "id" },
      postRepo: { findById: fail, findBySlug: fail },
    } as never);
    const response = await dispatchJsonRequest(app, row.method, `/api/admin/v1/workspaces/ws/${row.path}`, {});
    assert.equal(response.status, 500);
    const body = response.body as any;
    assert.match(body.errorId, /^[0-9a-f-]{36}$/);
    assert.equal(body.error, `${row.message} (error ${body.errorId})`);
    assert.equal(body.details.failure.errorId, body.errorId);
    assert.match(body.details.failure.copyText, new RegExp(body.errorId));
    assert.equal(body.details.failure.cause, "The error ID identifies the server report.");
    assert.equal(JSON.stringify(body).includes("CANARY_"), false);
    assert.match(JSON.stringify(logged.mock.calls.map(call => call.arguments)), /CANARY_BACKEND/);
  });
}

for (const [step, invoke] of [
  ["settings.change", (error: unknown, res: ReturnType<typeof createCapturingResponse>["res"]) => respondToSettingsError(res, error, [])],
  ["media.upload", (error: unknown, res: ReturnType<typeof createCapturingResponse>["res"]) => sendValidationOrInternalError({ res, error })],
] as const) {
  test(`${step}: the unmapped error retains its status, concrete message and error ID`, t => {
    t.mock.method(console, "error", () => {});
    const { res, capture } = createCapturingResponse();
    invoke(new Error("private backend"), res);
    assert.equal(capture.statusCode, 500);
    const body = capture.jsonBody as any;
    const message = step === "settings.change" ? "The settings request could not finish." : "The media upload or change could not finish.";
    assert.equal(body.error, `${message} (error ${body.errorId})`);
    assert.equal(body.details.failure.errorId, body.errorId);
    assert.match(body.details.failure.copyText, new RegExp(body.errorId));
    assert.equal(body.details.failure.cause, "The error ID identifies the server report.");
    assert.equal(JSON.stringify(body).includes("private backend"), false);
  });
}

test("content.import: unexpected failure retains its concrete message with safe copyable evidence", t => {
  t.mock.method(console, "error", () => {});
  const response = importErrorResponse(new Error("private backend"));
  assert.equal(response.status, 500);
  const body = response.body as any;
  assert.equal(body.error, `The content import could not finish. Check import history for content already applied before trying again. Copy details and report this problem. (error ${body.errorId})`);
  assert.deepEqual(Object.keys(body.details), ["failure"]);
  assert.equal(body.details.failure.errorId, body.errorId);
    assert.match(body.details.failure.copyText, new RegExp(body.errorId));
    assert.equal(body.details.failure.cause, "The error ID identifies the server report.");
  assert.equal(JSON.stringify(body).includes("private backend"), false);
});
