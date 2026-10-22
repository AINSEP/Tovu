import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import { createDnsProviderRegistry } from "@jini-ai/devops/dns";

import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { MailerPort, MailerSendResult } from "#src/platform/mail/index";
import type { DnsChangeToolDeps } from "#src/features/domain-dns/index";
import { context, fakeAuthoritative, memoryBindings } from "#src/features/domain-dns/__tests__/dns-fakes";
import { createMailTestSendLimiter } from "#src/features/mail-status/test-send";
import { registerAdminMailDnsRoutes } from "../mail-dns.js";
import { registerAdminMailTestSendRoute, type AdminMailTestSendDeps } from "../mail-test-send.js";

/**
 * @file The Email page's phase-3 admin adapters, driven as direct handler calls: each route checks
 * its own permission, answers with the shared operation's DTO, and keeps the mail-status route's
 * 404/403/500 envelopes. The operations themselves are covered beside them in `features/`.
 */

const WS = "ws-mail";
const DNS_PATH = "/api/admin/v1/workspaces/:workspaceId/system/mail-dns";
const VERIFY_PATH = "/api/admin/v1/workspaces/:workspaceId/system/mail-dns/verify";
const SEND_PATH = "/api/admin/v1/workspaces/:workspaceId/system/mail-test-send";

function dnsDeps(granted: string[], asked: string[] = []): DnsChangeToolDeps {
  const resolver = fakeAuthoritative({ zones: { "example.com": ["ns1.dns.test"] }, records: { "example.com|MX": ["10 mx.mailer.test."] } });
  return {
    workspaceId: WS, registry: createDnsProviderRegistry({ resolver }), resolver, context, now: () => 0, bindings: memoryBindings(),
    authorize: async ({ permission, entityType }) => { asked.push(`${permission}:${entityType}`); return { allowed: granted.includes(permission), reason: "fixture" }; },
    mailRequirements: async () => ({ purpose: "mail", domain: "example.com", providerId: "mailer", records: [{ type: "MX", name: "example.com", value: "mx.mailer.test", priority: 10 }] }),
  };
}

async function callRoute(app: express.Express, method: "get" | "post", path: string, req: Record<string, unknown>) {
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "owner" };
  await extractRouteHandler(app, method, path)({ params: { workspaceId: WS }, ...req }, res);
  return capture;
}

test("mail-dns GET answers the unsaved status under deployments.read; POST verify saves under deployments.publish", async () => {
  const asked: string[] = [];
  const app = express();
  registerAdminMailDnsRoutes(app, { workspaceId: WS, dns: dnsDeps(["deployments.read", "deployments.publish"], asked) });
  const read = await callRoute(app, "get", DNS_PATH, {});
  assert.equal(read.statusCode, 200);
  assert.deepEqual([(read.jsonBody as { state: string }).state, (read.jsonBody as { dns: { persisted: boolean } }).dns.persisted], ["checked", false]);
  const saved = await callRoute(app, "post", VERIFY_PATH, { body: {} });
  assert.deepEqual([saved.statusCode, (saved.jsonBody as { dns: { persisted: boolean } }).dns.persisted], [200, true]);
  assert.deepEqual(asked, ["deployments.read:domain-dns", "deployments.publish:domain-dns"]);
});

test("mail-dns: a missing grant is a 403 naming it; another workspace is a 404; a fault is a fixed 500", async (t) => {
  const app = express();
  registerAdminMailDnsRoutes(app, { workspaceId: WS, dns: dnsDeps(["deployments.read"]) });
  assert.deepEqual(await callRoute(app, "post", VERIFY_PATH, {}), { statusCode: 403, jsonBody: { error: "principal 'owner' is not authorized for 'deployments.publish' (fixture)", code: "FORBIDDEN", details: { permission: "deployments.publish", reason: "fixture" } } });
  const { res, capture } = createCapturingResponse();
  await extractRouteHandler(app, "get", DNS_PATH)({ params: { workspaceId: "other" } }, res);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "workspace was not found" } });
  const logged = t.mock.method(console, "error", () => {});
  const broken = express();
  registerAdminMailDnsRoutes(broken, { workspaceId: WS, dns: { ...dnsDeps([]), authorize: async () => { throw new Error("authorizer down"); } } });
  assert.deepEqual(await callRoute(broken, "get", DNS_PATH, {}), { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } });
  assert.equal(logged.mock.calls[0]!.arguments[0], "[system/mail-dns] unexpected error");
});

// ---------------------------------------------------------------------------------------------
// mail-test-send
// ---------------------------------------------------------------------------------------------

function sendDeps(overrides: Partial<AdminMailTestSendDeps> = {}, result: MailerSendResult = { ok: true, providerMessageId: "pm-9", acceptedAt: "2026-10-22T00:00:00.000Z" }) {
  const sent: { idempotencyKey: string; to: string }[] = [];
  const mailer: MailerPort = {
    capabilities: () => ({ driver: "smtp", supportsIdempotencyKey: true, supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }),
    send: async (message, options) => { sent.push({ idempotencyKey: options.idempotencyKey, to: message.to.email }); return result; },
    sendBatch: async () => [],
  };
  const deps: AdminMailTestSendDeps = {
    workspaceId: WS, mailer,
    authorize: async ({ permission }) => ({ allowed: permission === "admin.forms.manage", reason: "fixture" }),
    userRepo: { findByPrincipalId: async () => ({ principalId: "owner", workspaceId: WS, username: "owner", email: "owner@example.com", passwordHash: "x" }) },
    mailSenderIdentity: { resolve: async () => ({ email: "site@example.com", name: "Site" }) },
    ...overrides,
  };
  const app = express();
  registerAdminMailTestSendRoute(app, deps);
  return { app, sent };
}

test("mail-test-send sends to the chosen recipient with the click's request id as the idempotency key", async () => {
  const { app, sent } = sendDeps();
  const reply = await callRoute(app, "post", SEND_PATH, { body: { to: "ops@example.com", requestId: "click-0001" } });
  assert.equal(reply.statusCode, 200);
  const body = reply.jsonBody as { sent: boolean; result: { outcome: string; to: string; providerMessageId: string } };
  assert.deepEqual([body.sent, body.result.outcome, body.result.to, body.result.providerMessageId], [true, "accepted", "ops@example.com", "pm-9"]);
  assert.deepEqual(sent, [{ idempotencyKey: "mail:test:owner:admin:owner:click-0001", to: "ops@example.com" }]);
  // No body at all: the operator's own address and a generated request id.
  const fallback = await callRoute(app, "post", SEND_PATH, {});
  assert.equal((fallback.jsonBody as { result: { to: string } }).result.to, "owner@example.com");
  assert.match(sent[1]!.idempotencyKey, /^mail:test:owner:admin:owner:[0-9a-f-]{36}$/);
});

test("mail-test-send: a provider refusal is a 200 with the failed outcome; the local guard is a 429", async () => {
  const refused = sendDeps({}, { ok: false, retryable: false, errorCode: "MAIL_SUPPRESSED", message: "suppressed" });
  const reply = await callRoute(refused.app, "post", SEND_PATH, { body: {} });
  assert.deepEqual([reply.statusCode, (reply.jsonBody as { sent: boolean }).sent, (reply.jsonBody as { result: { errorCode: string } }).result.errorCode], [200, false, "MAIL_SUPPRESSED"]);
  const guarded = sendDeps({ mailTestSendLimiter: createMailTestSendLimiter({}, { now: () => 0 }) });
  assert.equal((await callRoute(guarded.app, "post", SEND_PATH, { body: { requestId: "click-0001" } })).statusCode, 200);
  const second = await callRoute(guarded.app, "post", SEND_PATH, { body: { requestId: "click-0002" } });
  assert.deepEqual([second.statusCode, (second.jsonBody as { result: { errorCode: string } }).result.errorCode], [429, "MAIL_TEST_DUPLICATE"]);
  assert.equal(guarded.sent.length, 1);
});

test("mail-test-send: bad input is a 400 before authorization; a missing grant is a 403; no address is a 400", async () => {
  const { app, sent } = sendDeps();
  for (const body of [{ to: "nope" }, { requestId: "x" }, { requestId: 7 }, ["to"], "text"]) {
    const reply = await callRoute(app, "post", SEND_PATH, { body });
    assert.equal(reply.statusCode, 400, JSON.stringify(body));
    assert.equal((reply.jsonBody as { code: string }).code, "INVALID_INPUT");
  }
  assert.equal((await callRoute(app, "post", SEND_PATH, { body: null })).statusCode, 200);
  const denied = sendDeps({ authorize: async () => ({ allowed: false, reason: "fixture" }) });
  assert.deepEqual(await callRoute(denied.app, "post", SEND_PATH, { body: {} }), { statusCode: 403, jsonBody: { error: "principal 'owner' is not authorized for 'admin.forms.manage' (fixture)", code: "FORBIDDEN", details: { permission: "admin.forms.manage", reason: "fixture" } } });
  const nobody = sendDeps({ userRepo: { findByPrincipalId: async () => null } });
  const noAddress = await callRoute(nobody.app, "post", SEND_PATH, { body: {} });
  assert.equal(noAddress.statusCode, 400);
  assert.match((noAddress.jsonBody as { error: string }).error, /Enter a recipient/);
  assert.equal(sent.length, 1);
});

test("mail-test-send: another workspace is a 404 and an unexpected fault a fixed 500", async (t) => {
  const { app } = sendDeps();
  const { res, capture } = createCapturingResponse();
  await extractRouteHandler(app, "post", SEND_PATH)({ params: { workspaceId: "other" }, body: {} }, res);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "workspace was not found" } });
  const logged = t.mock.method(console, "error", () => {});
  const broken = sendDeps({ authorize: async () => { throw new Error("authorizer down"); } });
  assert.deepEqual(await callRoute(broken.app, "post", SEND_PATH, { body: {} }), { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } });
  assert.equal(logged.mock.calls[0]!.arguments[0], "[system/mail-test-send] unexpected error");
});


test("mail-test-send never returns provider error text in its HTTP body", async () => {
  const fixture = sendDeps({}, { ok: false, retryable: false, errorCode: "SMTP_AUTH", message: "token=super-secret recipient=private@example.com" });
  const response = await callRoute(fixture.app, "post", SEND_PATH, { body: { requestId: "safe-error-1" } });
  assert.equal(response.statusCode, 200);
  assert.match(JSON.stringify(response.jsonBody), /The provider refused the message/);
  assert.doesNotMatch(JSON.stringify(response.jsonBody), /super-secret|private@example/);
});
