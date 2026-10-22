import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { MailerPort } from "#src/platform/mail/index";
import type { MailActivityRecord } from "#src/features/mail/activity.repo";
import { registerAdminMailActivityRoutes, type AdminMailActivityDeps } from "../mail-activity.js";

/**
 * @file The Email page's phase-4 admin adapters, as direct handler calls: each route answers the
 * shared operation's DTO, keeps the 404/400/403/503/500 envelopes, and enforces its own permission.
 */

const WS = "ws-mail";
const USES = "/api/admin/v1/workspaces/:workspaceId/system/mail-uses";
const LIST = "/api/admin/v1/workspaces/:workspaceId/system/mail-activity";
const ONE = "/api/admin/v1/workspaces/:workspaceId/system/mail-activity/:activityId";

const ROW: MailActivityRecord = {
  idempotencyKey: "members:signin:h", recipient: "ann@example.com", lane: "transactional", providerId: "smtp", use: "sign_in",
  outcome: "delivered", providerMessageId: "m1", errorCode: null, createdAt: "2026-10-22T12:00:00.000Z", updatedAt: "2026-10-22T12:00:01.000Z",
};

function deps(granted: string[], overrides: Partial<AdminMailActivityDeps> = {}): AdminMailActivityDeps {
  return {
    workspaceId: WS,
    authorize: async ({ permission }) => ({ allowed: granted.includes(permission), reason: "no_grant" }),
    mailer: { capabilities: () => ({ driver: "smtp" }) } as unknown as MailerPort,
    mailPurposeGate: async () => true,
    formDefinitionRepo: { list: async () => [] },
    mailActivity: {
      list: async () => [ROW],
      get: async ({ idempotencyKey }) => (idempotencyKey === ROW.idempotencyKey ? { record: ROW, feedback: [] } : null),
    },
    ...overrides,
  };
}

async function call(d: AdminMailActivityDeps, path: string, req: Record<string, unknown> = {}, workspaceId = WS) {
  const app = express();
  registerAdminMailActivityRoutes(app, d);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "owner" };
  await extractRouteHandler(app, "get", path)({ query: {}, ...req, params: { workspaceId, ...(req.params as object | undefined) } }, res);
  return capture;
}

const idOf = (key: string, to: string) => Buffer.from(JSON.stringify([key, to])).toString("base64url");

test("mail-uses answers the readiness report under admin.forms.manage, else 403", async () => {
  const ok = await call(deps(["admin.forms.manage"]), USES);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual((ok.jsonBody as { uses: { use: string; state: string }[] }).uses.map((row) => [row.use, row.state]), [["sign_in", "ready"], ["form_notifications", "not_configured"]]);
  const denied = await call(deps(["mail.activity.read"]), USES);
  assert.deepEqual([denied.statusCode, (denied.jsonBody as { code: string }).code, (denied.jsonBody as { details: { permission: string } }).details.permission], [403, "FORBIDDEN", "admin.forms.manage"]);
});

test("mail-activity lists full or masked by permission; bad input is 400, no grant 403, no repo 503", async () => {
  const full = await call(deps(["mail.activity.read"]), LIST, { query: { limit: "25" } });
  assert.deepEqual([full.statusCode, (full.jsonBody as { access: string }).access, (full.jsonBody as { items: { recipient: string }[] }).items[0]!.recipient], [200, "full", "ann@example.com"]);
  const masked = await call(deps(["admin.forms.manage"]), LIST);
  assert.deepEqual([(masked.jsonBody as { access: string }).access, (masked.jsonBody as { items: { recipient: string }[] }).items[0]!.recipient], ["masked", "a***@example.com"]);
  const bad = await call(deps(["mail.activity.read"]), LIST, { query: { outcome: "sent" } });
  assert.deepEqual([bad.statusCode, (bad.jsonBody as { code: string }).code], [400, "INVALID_INPUT"]);
  const denied = await call(deps([]), LIST);
  assert.deepEqual([denied.statusCode, (denied.jsonBody as { details: { permission: string } }).details.permission], [403, "mail.activity.read or admin.forms.manage"]);
  const none = await call(deps(["mail.activity.read"], { mailActivity: undefined }), LIST);
  assert.deepEqual([none.statusCode, (none.jsonBody as { code: string }).code], [503, "MAIL_ACTIVITY_UNAVAILABLE"]);
});

test("mail-activity/:activityId returns the detail, 404 when absent, 403 masked, 404 for another workspace, 500 on a fault", async () => {
  const found = await call(deps(["mail.activity.read"]), ONE, { params: { activityId: idOf(ROW.idempotencyKey, ROW.recipient) } });
  assert.deepEqual([found.statusCode, (found.jsonBody as { activity: { outcome: string } }).activity.outcome], [200, "delivered"]);
  const missing = await call(deps(["mail.activity.read"]), ONE, { params: { activityId: idOf("other", "x@y.z") } });
  assert.deepEqual([missing.statusCode, (missing.jsonBody as { code: string }).code], [404, "NOT_FOUND"]);
  const masked = await call(deps(["admin.forms.manage"]), ONE, { params: { activityId: idOf(ROW.idempotencyKey, ROW.recipient) } });
  assert.equal(masked.statusCode, 403);
  const elsewhere = await call(deps(["mail.activity.read"]), ONE, { params: { activityId: "x" } }, "ws-other");
  assert.equal(elsewhere.statusCode, 404);
  const original = console.error;
  console.error = () => {};
  try {
    const fault = await call(deps(["mail.activity.read"], { mailActivity: { list: async () => { throw new Error("db"); }, get: async () => null } }), LIST);
    assert.deepEqual([fault.statusCode, fault.jsonBody], [500, { error: "internal error", code: "INTERNAL_ERROR" }]);
  } finally {
    console.error = original;
  }
});
