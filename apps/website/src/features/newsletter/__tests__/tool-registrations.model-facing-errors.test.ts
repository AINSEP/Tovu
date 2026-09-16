/**
 * @file RED regression suite for the Newsletter half of the 2026-09-16 "always say the real reason"
 * sweep. Drives the REAL delegated-tool-call transport end to end, the same seam
 * `features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts`
 * established, so the assertion is on the payload a spawned agent CLI actually receives.
 *
 * RED before the fix, for every case below: `{ ok: false, error: { code: "INTERNAL_ERROR", message:
 * "an internal error occurred" } }`. Newsletter had NO reclassification of any kind, and it is the
 * widest catalog in this sweep — all 14 wired tools sent every one of `errors.ts`'s typed classes,
 * plus the kit's `ForbiddenError`, straight into the SEC-005 redactor.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/http-kit";

import { createHookRegistry } from "../hooks.js";
import {
  InMemoryNewsletterAudienceSnapshotRepo,
  InMemoryNewsletterCampaignRepo,
  InMemoryNewsletterConfirmationTokenRepo,
  InMemoryNewsletterListRepo,
  InMemoryNewsletterSendRepo,
  InMemoryNewsletterSubscriptionRepo,
} from "../repo.memory.js";
import { buildNewsletterRegistrations, type NewsletterToolDeps } from "../tool-registrations.js";

const WORKSPACE_ID = "ws-newsletter-errors";
const PRINCIPAL_ID = "principal-1";
const NOW = "2026-09-16T00:00:00.000Z";

function makeRouteDeps(options: { allow?: boolean } = {}): NewsletterToolDeps {
  const allow = options.allow ?? true;
  let counter = 0;
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as NewsletterToolDeps["outbox"],
    bus: { publish: async () => undefined, subscribe: () => undefined } as unknown as NewsletterToolDeps["bus"],
    mailer: { send: async () => undefined } as unknown as NewsletterToolDeps["mailer"],
    originRegistry: { isAllowedEgressTarget: async () => true } as unknown as NewsletterToolDeps["originRegistry"],
    newsletterReady: Promise.resolve(),
    newsletterCampaignRepo: new InMemoryNewsletterCampaignRepo(),
    newsletterListRepo: new InMemoryNewsletterListRepo(),
    newsletterSubscriptionRepo: new InMemoryNewsletterSubscriptionRepo(),
    newsletterAudienceSnapshotRepo: new InMemoryNewsletterAudienceSnapshotRepo(),
    newsletterSendRepo: new InMemoryNewsletterSendRepo(),
    newsletterConfirmationTokenRepo: new InMemoryNewsletterConfirmationTokenRepo(),
    newsletterSubscriberDirectory: { getContact: async () => null } as unknown as NewsletterToolDeps["newsletterSubscriberDirectory"],
    newsletterHooks: createHookRegistry(),
    membersConsentCapability: null,
    authorize: async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  };
}

async function buildHarness(routeDeps: NewsletterToolDeps) {
  const registry = createToolRegistry();
  for (const registration of buildNewsletterRegistrations(routeDeps)) registry.register(registration);
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog() });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  return { run, lifecycle, toolExecutor, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) };
}

type Harness = Awaited<ReturnType<typeof buildHarness>>;

async function call(harness: Harness, toolId: string, input: unknown) {
  return delegatedToolExecuteRoute.handle({ runId: harness.run.id, toolUseId: `tu-${toolId}`, toolId, input }, harness);
}

test("newsletter_get_campaign for an unknown campaign is BAD_REQUEST with the real not-found reason, not a redacted 500", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "newsletter_get_campaign", { campaignId: "nope" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "NEWSLETTER_CAMPAIGN_NOT_FOUND: campaign nope was not found",
  });
});

test("newsletter_list_send_log for an unknown campaign says so rather than 'an internal error occurred'", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "newsletter_list_send_log", { campaignId: "ghost" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "NEWSLETTER_CAMPAIGN_NOT_FOUND: campaign ghost was not found",
  });
});

test("newsletter_remove_subscription for an unknown subscription surfaces its own not-found class", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "newsletter_remove_subscription", { listId: "l-1", subscriptionId: "s-nope" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "NEWSLETTER_SUBSCRIPTION_NOT_FOUND: subscription s-nope was not found",
  });
});

test("newsletter_create_subscription against an unknown list names the LIST, not a generic failure", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "newsletter_create_subscription", {
    listId: "l-nope",
    subscriberId: "sub-1",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "NEWSLETTER_LIST_NOT_FOUND: list l-nope was not found",
  });
});

test("newsletter_create_campaign against an unknown list names the list", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "newsletter_create_campaign", {
    subject: "Hello",
    fromName: "Tovu",
    fromEmail: "hello@example.com",
    replyTo: "hello@example.com",
    listId: "l-nope",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "NEWSLETTER_LIST_NOT_FOUND: list l-nope was not found",
  });
});

test("every Newsletter tool surfaces a denial with the permission named — the sibling-arm check across all 14", async () => {
  const calls: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ["newsletter_list_campaigns", {}],
    ["newsletter_get_campaign", { campaignId: "c-1" }],
    ["newsletter_list_lists", {}],
    ["newsletter_list_subscriptions", { listId: "l-1" }],
    ["newsletter_list_send_log", { campaignId: "c-1" }],
    ["newsletter_create_campaign", { subject: "s", fromName: "n", fromEmail: "a@b.co", replyTo: "a@b.co", listId: "l-1" }],
    ["newsletter_update_campaign", { campaignId: "c-1", subject: "s" }],
    ["newsletter_cancel_campaign", { campaignId: "c-1" }],
    ["newsletter_pause_campaign", { campaignId: "c-1" }],
    ["newsletter_create_list", { name: "n", slug: "s" }],
    ["newsletter_archive_list", { listId: "l-1" }],
    ["newsletter_create_subscription", { listId: "l-1", subscriberId: "sub-1" }],
    ["newsletter_remove_subscription", { listId: "l-1", subscriptionId: "s-1" }],
    ["newsletter_resend_confirmation", { subscriptionId: "s-1" }],
  ];

  for (const [toolId, input] of calls) {
    const harness = await buildHarness(makeRouteDeps({ allow: false }));

    const result = await call(harness, toolId, input);

    assert.equal(result.ok, false, `${toolId}: expected a refusal`);
    if (result.ok) continue;
    assert.equal(result.error.code, "BAD_REQUEST", `${toolId}: still redacted — ${JSON.stringify(result.error)}`);
    assert.match(result.error.message, /^NEWSLETTER_FORBIDDEN: principal 'principal-1' is not authorized for 'admin\.newsletter\./, `${toolId}: ${result.error.message}`);
  }
});
