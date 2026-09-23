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

async function getMailStatus(deps: RouteDeps, t: test.TestContext, workspaceId = deps.workspaceId): Promise<Response> {
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
