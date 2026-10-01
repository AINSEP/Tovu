import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminNewsletterResendConfirmationRoute } from "../resend-confirmation.js";
import type { NewsletterRouteDeps } from "../deps.js";
import type { SubscriberContact } from "#src/features/newsletter/index";
import type { SubscriptionRow } from "#src/features/newsletter/types";
import type { MailerPort } from "#src/platform/mail/index";

/**
 * @file Route-level tests for `RESEND_CONFIRMATION`
 * (`POST .../newsletter/subscriptions/:id/resend-confirmation`).
 *
 * `newsletter-routes.test.ts` only checks the `{ delivered: true }` body, which the route returns
 * whether or not anything was sent. This file asserts the effect itself — a fresh confirmation
 * token row and one confirm email to the subscriber's directory address — plus the unknown-id 404
 * and the no-contact branch (answered 200, nothing minted, nothing sent).
 */

const WORKSPACE_ID = "workspace-local";
const NOW = "2026-09-01T00:00:00.000Z";
const PATH = (id: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/subscriptions/${id}/resend-confirmation`;

function subscription(): SubscriptionRow {
  return {
    id: "sub-1",
    workspaceId: WORKSPACE_ID,
    listId: "list-1",
    subscriberId: "member-1",
    status: "pending",
    source: "admin",
    consentRevisionIdAtSubscribe: null,
    subscribedAt: null,
    unsubscribedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function recordingMailer(): MailerPort & { sent: Array<{ to: string; subject: string }> } {
  const sent: Array<{ to: string; subject: string }> = [];
  return {
    sent,
    capabilities: () => ({
      driver: "memory",
      supportsIdempotencyKey: true,
      supportsWebhookFeedback: false,
      maxBatchSize: 1,
      supportsAttachments: false,
    }),
    async send(message) {
      sent.push({ to: message.to.email, subject: message.subject });
      return { ok: true, providerMessageId: `pm-${sent.length}`, acceptedAt: NOW };
    },
    async sendBatch() {
      return [];
    },
  } as MailerPort & { sent: Array<{ to: string; subject: string }> };
}

async function buildApp(contact: SubscriberContact | null) {
  const base = createRouteDeps();
  const mailer = recordingMailer();
  const deps = {
    ...base,
    mailer,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    newsletterSubscriberDirectory: {
      getContact: async () => contact,
      getContacts: async () => (contact ? [contact] : []),
    },
  } as unknown as NewsletterRouteDeps;
  await deps.newsletterReady;
  await deps.newsletterSubscriptionRepo.save(subscription());

  const app = express();
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminNewsletterResendConfirmationRoute(app, deps);
  return { app, deps, mailer };
}

test("resend-confirmation: mints a fresh confirmation token and emails the subscriber's directory address", async (t) => {
  const { app, deps, mailer } = await buildApp({ subscriberId: "member-1", email: "reader@example.com" } as SubscriberContact);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH("sub-1")}`, { method: "POST" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { delivered: true });

  const tokens = await deps.newsletterConfirmationTokenRepo.findUnconsumedBySubscription({
    workspaceId: WORKSPACE_ID,
    subscriptionId: "sub-1",
  });
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].purpose, "newsletter_subscription_confirm");
  assert.deepEqual(mailer.sent, [{ to: "reader@example.com", subject: "Confirm your subscription" }]);
});

test("resend-confirmation: a second resend supersedes the first token, leaving exactly one live token", async (t) => {
  const { app, deps, mailer } = await buildApp({ subscriberId: "member-1", email: "reader@example.com" } as SubscriberContact);
  const baseUrl = await startTestServer(app, t);

  await fetch(`${baseUrl}${PATH("sub-1")}`, { method: "POST" });
  const first = await deps.newsletterConfirmationTokenRepo.findUnconsumedBySubscription({ workspaceId: WORKSPACE_ID, subscriptionId: "sub-1" });
  await fetch(`${baseUrl}${PATH("sub-1")}`, { method: "POST" });
  const second = await deps.newsletterConfirmationTokenRepo.findUnconsumedBySubscription({ workspaceId: WORKSPACE_ID, subscriptionId: "sub-1" });

  assert.equal(second.length, 1);
  assert.notEqual(second[0].id, first[0].id);
  assert.equal(mailer.sent.length, 2);
});

test("resend-confirmation: a subscriber with no directory contact gets a 200 but nothing is minted or sent", async (t) => {
  const { app, deps, mailer } = await buildApp(null);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH("sub-1")}`, { method: "POST" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { delivered: true });
  assert.deepEqual(
    await deps.newsletterConfirmationTokenRepo.findUnconsumedBySubscription({ workspaceId: WORKSPACE_ID, subscriptionId: "sub-1" }),
    []
  );
  assert.deepEqual(mailer.sent, []);
});

test("resend-confirmation: an unknown subscription id is 404 NEWSLETTER_SUBSCRIPTION_NOT_FOUND and sends nothing", async (t) => {
  const { app, mailer } = await buildApp({ subscriberId: "member-1", email: "reader@example.com" } as SubscriberContact);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH("does-not-exist")}`, { method: "POST" });
  assert.equal(res.status, 404);
  assert.equal(((await res.json()) as { code: string }).code, "NEWSLETTER_SUBSCRIPTION_NOT_FOUND");
  assert.deepEqual(mailer.sent, []);
});
