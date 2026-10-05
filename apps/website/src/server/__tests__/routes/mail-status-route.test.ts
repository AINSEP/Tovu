import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";
import type { MailerPort } from "#src/platform/mail/index";

/**
 * @file `GET /api/admin/v1/workspaces/:workspaceId/system/mail-status` — the read-only fact the
 * admin form editor uses to grey out its email-notification controls while the site can only log
 * mail (`ConsoleMailerAdapter`, `resolve-mailer.ts`'s fallback) instead of sending it.
 */

function mailerWithDriver(driver: string): MailerPort {
  return {
    capabilities: () => ({
      driver,
      supportsIdempotencyKey: true,
      supportsWebhookFeedback: false,
      maxBatchSize: 1,
      supportsAttachments: false,
    }),
    send: async () => ({ ok: true, providerMessageId: "m-1", acceptedAt: "2026-09-22T00:00:00.000Z" }),
    sendBatch: async () => [],
  };
}

async function getMailStatus(deps: ReturnType<typeof createRouteDeps>, t: test.TestContext, workspaceId = deps.workspaceId): Promise<Response> {
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  return fetch(`${baseUrl}/api/admin/v1/workspaces/${workspaceId}/system/mail-status`, { headers: { cookie } });
}

test("mail-status: the default console mailer reports mail delivery unavailable", async (t) => {
  const res = await getMailStatus({ ...createRouteDeps() }, t);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { mailDeliveryAvailable: false });
});

test("mail-status: a real mail adapter reports mail delivery available", async (t) => {
  const res = await getMailStatus({ ...createRouteDeps(), mailer: mailerWithDriver("resend") }, t);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { mailDeliveryAvailable: true });
});

test("mail-status: a mismatched workspaceId in the URL 404s", async (t) => {
  const res = await getMailStatus({ ...createRouteDeps() }, t, "not-the-real-workspace");
  assert.equal(res.status, 404);
});

test("mail-status: an explicit console driver reports delivery unavailable", async (t) => {
  const res = await getMailStatus({ ...createRouteDeps(), mailer: mailerWithDriver("console") }, t);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { mailDeliveryAvailable: false });
});

test("mail-status: no session is refused with 401", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl } = await bootAuthenticated(createApp(deps), t);
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/mail-status`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthenticated", code: "UNAUTHENTICATED" });
});

test("mail-status: a signed-in user without admin.forms.manage is refused", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl } = await bootAuthenticated(createApp(deps), t);
  const id = "mail-status-no-grants";
  await deps.principalRepo.save({ id, workspaceId: deps.workspaceId, kind: "user", displayName: "No grants", status: "active", createdAt: deps.clock.nowIso() });
  await deps.userRepo.save({ principalId: id, workspaceId: deps.workspaceId, username: id, passwordHash: await deps.passwordHasher.hash({ password: "mail-status-test-password" }) });
  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: id, password: "mail-status-test-password" }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/mail-status`, { headers: { cookie } });
  assert.equal(response.status, 403);
  const body = await response.json() as { code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.deepEqual(body.details, { permission: "admin.forms.manage", reason: "no_grant" });
  assert.equal("mailDeliveryAvailable" in body, false);
});
