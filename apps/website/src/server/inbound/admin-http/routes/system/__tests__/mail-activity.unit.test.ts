import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { MailerPort } from "#src/platform/mail/index";
import type { MailActivityRecord } from "#src/features/mail/activity.repo";
import type { MailSuppressionAdminRepo } from "#src/features/mail/suppression-admin.repo";
import { registerAdminMailActivityRoutes, type AdminMailActivityDeps } from "../mail-activity.js";

/**
 * @file The Email page's phase-4 admin adapters, as direct handler calls: each route answers the
 * shared operation's DTO, keeps the 404/400/403/503/500 envelopes, and enforces its own permission.
 */

const WS = "ws-mail";
const USES = "/api/admin/v1/workspaces/:workspaceId/system/mail-uses";
const LIST = "/api/admin/v1/workspaces/:workspaceId/system/mail-activity";
const ONE = "/api/admin/v1/workspaces/:workspaceId/system/mail-activity/:activityId";
const SUPPRESSIONS = "/api/admin/v1/workspaces/:workspaceId/system/mail-suppressions";
const REMOVE = "/api/admin/v1/workspaces/:workspaceId/system/mail-suppressions/remove";
const FEEDBACK = "/api/admin/v1/workspaces/:workspaceId/system/mail-feedback";

function suppressionRepo(removed: unknown[] = []): MailSuppressionAdminRepo {
  const row = { revision: "reviewed-v1", address: "ann@example.com", scope: "all" as const, reason: "bounced" as const, createdAt: "2026-10-22T12:00:00.000Z" };
  return {
    list: async () => [row],
    find: async ({ address }) => (address === row.address ? row : null),
    remove: async (required) => { removed.push(required); return { id: "r1", address: row.address, scope: row.scope, suppressionReason: row.reason, suppressedAt: row.createdAt, removalReason: required.removalReason, removedBy: required.removedBy, removedAt: "2026-10-22T13:00:00.000Z" }; },
    lastFeedbackEvent: async () => null,
  };
}

const ROW: MailActivityRecord = {
  cursorKey: "row-1",
  idempotencyKey: "members:signin:h", recipient: "ann@example.com", lane: "transactional", providerId: "smtp", use: "sign_in",
  outcome: "delivered", providerMessageId: "m1", errorCode: null, message: null, createdAt: "2026-10-22T12:00:00.000Z", updatedAt: "2026-10-22T12:00:01.000Z",
};

function deps(granted: string[], overrides: Partial<AdminMailActivityDeps> = {}): AdminMailActivityDeps {
  return {
    ownerPrincipalId: Promise.resolve("owner"), workspaceId: WS,
    authorize: async ({ permission }) => ({ allowed: granted.includes(permission), reason: "no_grant" }),
    mailer: { capabilities: () => ({ driver: "smtp" }) } as unknown as MailerPort,
    mailSenderIdentity: { resolve: async () => ({ email: "sender@example.com" }) }, mailPurposeGate: async () => true,
    formDefinitionRepo: { list: async () => [] },
    mailActivity: {
      list: async () => [ROW],
      get: async ({ idempotencyKey }) => (idempotencyKey === ROW.idempotencyKey ? { record: ROW, feedback: [] } : null),
    },
    ...overrides,
  };
}

async function call(d: AdminMailActivityDeps, path: string, req: Record<string, unknown> = {}, workspaceId = WS, method: "get" | "post" = "get") {
  const app = express();
  registerAdminMailActivityRoutes(app, d);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "owner" };
  await extractRouteHandler(app, method, path)({ query: {}, ...req, params: { workspaceId, ...(req.params as object | undefined) } }, res);
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

test("mail-suppressions lists under mail.activity.read; mail-feedback reports setup under admin.forms.manage", async () => {
  const listed = await call(deps(["mail.activity.read"], { mailSuppressionAdmin: suppressionRepo() }), SUPPRESSIONS, { query: { scope: "all" } });
  assert.deepEqual([listed.statusCode, (listed.jsonBody as { items: { address: string }[] }).items[0]!.address], [200, "ann@example.com"]);
  assert.equal((await call(deps(["admin.forms.manage"], { mailSuppressionAdmin: suppressionRepo() }), SUPPRESSIONS)).statusCode, 403);
  assert.equal((await call(deps(["mail.activity.read"]), SUPPRESSIONS)).statusCode, 503);
  const feedback = await call(deps(["admin.forms.manage"]), FEEDBACK);
  assert.deepEqual([feedback.statusCode, feedback.jsonBody], [200, { available: false, providers: [] }]);
  assert.equal((await call(deps(["mail.activity.read"]), FEEDBACK)).statusCode, 403);
});

test("mail-suppressions/remove previews without confirmed: true, removes with it, and needs mail.suppressions.manage", async () => {
  const removed: unknown[] = [];
  const d = deps(["mail.suppressions.manage"], { mailSuppressionAdmin: suppressionRepo(removed) });
  const body = { address: "Ann@Example.com", scope: "all", reason: "mailbox restored" };
  const preview = await call(d, REMOVE, { body }, WS, "post");
  assert.deepEqual([preview.statusCode, (preview.jsonBody as { removed: boolean; confirmationRequired: boolean }).removed, (preview.jsonBody as { confirmationRequired: boolean }).confirmationRequired], [200, false, true]);
  assert.equal(removed.length, 0, "a preview changes nothing");
  const done = await call(d, REMOVE, { body: { ...body, revision: "reviewed-v1", confirmed: true } }, WS, "post");
  assert.deepEqual([done.statusCode, (done.jsonBody as { removed: boolean }).removed], [200, true]);
  assert.deepEqual(removed, [{ workspaceId: WS, address: "ann@example.com", scope: "all", removalReason: "mailbox restored", removedBy: "owner", revision: "reviewed-v1" }]);
  assert.equal((await call(d, REMOVE, { body: { address: "ann@example.com", scope: "all" } }, WS, "post")).statusCode, 400, "the reason is required");
  assert.equal((await call(d, REMOVE, { body: [] }, WS, "post")).statusCode, 400, "a non-object body has no fields");
  assert.equal((await call(d, REMOVE, {}, WS, "post")).statusCode, 400);
  assert.equal((await call(deps(["mail.activity.read"], { mailSuppressionAdmin: suppressionRepo() }), REMOVE, { body: { ...body, revision: "reviewed-v1", confirmed: true } }, WS, "post")).statusCode, 403);
});

test("feedback dependency failures are safe HTTP errors without partial receiving rows", async (t) => {
  const logged: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });
  for (const override of [
    { mailProviderControl: { describe: async () => { throw new Error("secret-describe"); } } },
    { customCredentialSetRepo: { listByWorkspace: async () => { throw new Error("secret-credentials"); } } },
    { mailSuppressionAdmin: { lastFeedbackEvent: async () => { throw new Error("secret-inbox"); } } },
  ]) {
    const provider = { id: "fake", label: "Fake", lanes: ["transactional"], capabilities: { feedback: true } };
    const d = deps(["admin.forms.manage"], { mailProviderControl: { describe: async () => ({ providers: [provider] }) } as never, customCredentialSetRepo: { listByWorkspace: async () => [] } as never, ...override } as never);
    const response = await call(d, FEEDBACK); assert.deepEqual([response.statusCode, response.jsonBody], [500, { error: "internal error", code: "INTERNAL_ERROR" }]);
  }
  assert.doesNotMatch(JSON.stringify(logged), /secret-/);
});
