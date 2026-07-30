/**
 * @file Covers the 14 Newsletter tools: catalog completeness (including the 5 deliberately
 * withheld send/schedule/resume/import operations), published contracts, risk cross-check, the
 * ADR-021 authorization half (explicit-handler style — none of Newsletter's domain functions call
 * `authorize()` themselves; see `http/admin/newsletter.ts`'s own file header), and a multi-tool
 * workflow test proving the tools compose correctly in sequence.
 *
 * Uses the REAL in-memory Newsletter repo adapters and the real `saveCampaign`/`cancelCampaign`/
 * `pauseCampaign`/`saveList`/`archiveList`/`saveSubscription`/`unsubscribeSubscription`/
 * `issueConfirmationToken` domain functions, so "nothing was written" / "the campaign is actually
 * in draft" is asserted against real repo state, not a spy.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { ForbiddenError } from "../../core/commands";
import { newsletterAgentToolCatalog, type AgentToolDefinition } from "../../newsletter/agent-tools";
import {
  InMemoryNewsletterAudienceSnapshotRepo,
  InMemoryNewsletterCampaignRepo,
  InMemoryNewsletterConfirmationTokenRepo,
  InMemoryNewsletterListRepo,
  InMemoryNewsletterSendRepo,
  InMemoryNewsletterSubscriptionRepo,
} from "../../newsletter/repo.memory";
import { NewsletterCampaignNotFoundError, NewsletterSubscriptionNotFoundError } from "../../newsletter/errors";
import type { CampaignRecord, NewsletterListRow, SubscriptionRow } from "../../newsletter/types";
import type { RouteDeps } from "../../server/routes/types";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations";

const WORKSPACE_ID = "ws-newsletter-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

function seedCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: overrides.id ?? "campaign-1",
    workspaceId: WORKSPACE_ID,
    status: "draft",
    subject: "Original subject",
    preheader: null,
    fromName: "Ops",
    fromEmail: "ops@example.test",
    replyTo: "ops@example.test",
    listId: overrides.listId ?? "list-1",
    scheduledAt: null,
    sendStartedAt: null,
    audienceSnapshotId: null,
    counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 },
    version: 1,
    createdByPrincipal: PRINCIPAL_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function seedList(overrides: Partial<NewsletterListRow> = {}): NewsletterListRow {
  return {
    id: overrides.id ?? "list-1",
    workspaceId: WORKSPACE_ID,
    name: "All subscribers",
    slug: "all-subscribers",
    isDefault: false,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function seedSubscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: overrides.id ?? "subscription-1",
    workspaceId: WORKSPACE_ID,
    listId: overrides.listId ?? "list-1",
    subscriberId: overrides.subscriberId ?? "subscriber-1",
    status: "pending",
    source: "admin",
    consentRevisionIdAtSubscribe: null,
    subscribedAt: null,
    unsubscribedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const newsletterCampaignRepo = new InMemoryNewsletterCampaignRepo();
  const newsletterListRepo = new InMemoryNewsletterListRepo();
  const newsletterSubscriptionRepo = new InMemoryNewsletterSubscriptionRepo();
  const newsletterAudienceSnapshotRepo = new InMemoryNewsletterAudienceSnapshotRepo();
  const newsletterSendRepo = new InMemoryNewsletterSendRepo();
  const newsletterConfirmationTokenRepo = new InMemoryNewsletterConfirmationTokenRepo();

  const clock = { nowIso: () => NOW };
  const idGen = counterIdGen();

  const authorizeCalls: Array<Record<string, unknown>> = [];
  const authorize = async (params: Record<string, unknown>) => {
    authorizeCalls.push(params);
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  };

  const sentMail: unknown[] = [];
  const mailer = {
    capabilities: () => ({ maxBatchSize: 1 }),
    send: async (message: unknown) => {
      sentMail.push(message);
      return { accepted: true };
    },
    sendBatch: async () => [],
  };

  const contacts = new Map<string, { subscriberId: string; workspaceId: string; email: string; emailDeliverable: boolean }>([
    ["subscriber-1", { subscriberId: "subscriber-1", workspaceId: WORKSPACE_ID, email: "subscriber1@example.test", emailDeliverable: true }],
  ]);
  const newsletterSubscriberDirectory = {
    getContact: async (required: { subscriberId: string }) => contacts.get(required.subscriberId) ?? null,
    getContacts: async () => [],
  };

  const originRegistry = {
    canonicalOrigin: async () => ({ scheme: "https" as const, host: "example.test", verifiedAt: NOW, source: "manual" as const }),
    isSameOriginOrAllowed: () => true,
  };

  const deps = {
    workspaceId: WORKSPACE_ID,
    clock,
    idGen,
    authorize,
    newsletterReady: Promise.resolve(),
    newsletterCampaignRepo,
    newsletterListRepo,
    newsletterSubscriptionRepo,
    newsletterAudienceSnapshotRepo,
    newsletterSendRepo,
    newsletterConfirmationTokenRepo,
    newsletterSubscriberDirectory,
    mailer,
    membersConsentCapability: null,
    originRegistry,
  };

  return {
    deps: deps as unknown as RouteDeps,
    newsletterCampaignRepo,
    newsletterListRepo,
    newsletterSubscriptionRepo,
    newsletterSendRepo,
    authorizeCalls,
    sentMail,
  };
}

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = newsletterAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function newsletterRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(
    buildAssistantToolRegistrations(deps)
      .filter((r) => r.descriptor.id.startsWith("newsletter_"))
      .map((r) => [r.descriptor.id, r]),
  );
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = newsletterRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

const EXPECTED_TOOL_IDS = [
  "newsletter_archive_list",
  "newsletter_cancel_campaign",
  "newsletter_create_campaign",
  "newsletter_create_list",
  "newsletter_create_subscription",
  "newsletter_get_campaign",
  "newsletter_list_campaigns",
  "newsletter_list_lists",
  "newsletter_list_send_log",
  "newsletter_list_subscriptions",
  "newsletter_pause_campaign",
  "newsletter_remove_subscription",
  "newsletter_resend_confirmation",
  "newsletter_update_campaign",
].sort();

const WITHHELD_TOOL_IDS = [
  "newsletter_send_campaign",
  "newsletter_send_test_campaign",
  "newsletter_schedule_campaign",
  "newsletter_resume_campaign",
  "newsletter_import_subscriptions",
];

// ---------------------------------------------------------------------------
// 1. Catalog completeness — exactly 14 tools, the 5 send/schedule/resume/import ones absent
// ---------------------------------------------------------------------------

test("exactly the 14 designed Newsletter tools are wired", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...newsletterRegistrations(deps).keys()].sort(), EXPECTED_TOOL_IDS);
  assert.equal(EXPECTED_TOOL_IDS.length, 14);
});

test("none of the 5 withheld send/schedule/resume/import operations are wired OR even catalogued", () => {
  const { deps } = fakeRouteDeps();
  const wiredIds = new Set(newsletterRegistrations(deps).keys());
  const catalogueIds = new Set(newsletterAgentToolCatalog.map((tool) => tool.name));
  for (const id of WITHHELD_TOOL_IDS) {
    assert.equal(wiredIds.has(id), false, `'${id}' must not be wired — real-world send/launch side effect`);
    assert.equal(catalogueIds.has(id), false, `'${id}' must not even be catalogued — an unwired-but-catalogued entry is still advertised by the ADR-014 tool filter`);
  }
});

test("no wired tool description implies it can send/schedule/resume a real campaign send", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of newsletterRegistrations(deps)) {
    if (id === "newsletter_pause_campaign") continue; // legitimately describes HALTING a send
    const claim = registration.descriptor.description.replace(/\b(never|no|not|cannot|nothing)\b[^.;—]*/gi, "");
    assert.equal(/\bsends? (the )?campaign\b|\bschedules? (the )?campaign\b|\bresumes? sending\b/i.test(claim), false, `'${id}' must not claim to send/schedule/resume a real campaign send`);
  }
});

// ---------------------------------------------------------------------------
// 2. Published contracts + risk metadata
// ---------------------------------------------------------------------------

test("every wired Newsletter registration publishes its catalog entry's inputSchema and description", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of newsletterRegistrations(deps)) {
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("the real Newsletter catalog and tool-registrations' independent risk classification agree", () => {
  const { deps } = fakeRouteDeps();
  for (const id of newsletterRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a Newsletter catalog entry cannot downgrade its own risk", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("newsletter_create_campaign", { ...catalogEntry("newsletter_create_campaign"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("the ToolPolicy layer is a pass-through 'allow' for every Newsletter registration", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of newsletterRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

// ---------------------------------------------------------------------------
// 3. Authorization — every tool checks its declared permission before any effect
// ---------------------------------------------------------------------------

function toolInputs(fixtures: { listId: string; campaignId: string; subscriptionId: string }): Record<string, Record<string, unknown>> {
  return {
    newsletter_list_campaigns: {},
    newsletter_get_campaign: { campaignId: fixtures.campaignId },
    newsletter_list_lists: {},
    newsletter_list_subscriptions: { listId: fixtures.listId },
    newsletter_list_send_log: { campaignId: fixtures.campaignId },
    newsletter_create_campaign: { subject: "Hello", fromName: "Ops", fromEmail: "ops@example.test", replyTo: "ops@example.test", listId: fixtures.listId },
    newsletter_update_campaign: { campaignId: fixtures.campaignId, subject: "Updated subject" },
    newsletter_cancel_campaign: { campaignId: fixtures.campaignId },
    newsletter_pause_campaign: { campaignId: fixtures.campaignId },
    newsletter_create_list: { name: "VIP", slug: "vip" },
    newsletter_archive_list: { listId: fixtures.listId },
    newsletter_create_subscription: { listId: fixtures.listId, subscriberId: "subscriber-1" },
    newsletter_remove_subscription: { listId: fixtures.listId, subscriptionId: fixtures.subscriptionId },
    newsletter_resend_confirmation: { subscriptionId: fixtures.subscriptionId },
  };
}

test("every wired Newsletter tool has an input fixture — a newly wired tool must be added here", () => {
  const { deps } = fakeRouteDeps();
  const fixtures = { listId: "list-1", campaignId: "campaign-1", subscriptionId: "subscription-1" };
  assert.deepEqual([...newsletterRegistrations(deps).keys()].sort(), Object.keys(toolInputs(fixtures)).sort());
});

for (const toolId of EXPECTED_TOOL_IDS) {
  test(`${toolId}: calls authorize() with its catalog's declared permission before any effect`, async () => {
    const { deps, newsletterCampaignRepo, newsletterListRepo, newsletterSubscriptionRepo, authorizeCalls } = fakeRouteDeps();
    await newsletterCampaignRepo.saveCampaignRow(seedCampaign());
    await newsletterListRepo.save(seedList());
    await newsletterSubscriptionRepo.save(seedSubscription());
    authorizeCalls.length = 0;

    const fixtures = { listId: "list-1", campaignId: "campaign-1", subscriptionId: "subscription-1" };
    await wired(toolId, deps)
      .handler(executionContext(toolInputs(fixtures)[toolId]))
      .catch(() => undefined); // a domain-level rejection past the gate is not this test's concern

    assert.equal(authorizeCalls.length, 1, "exactly one authorization evaluation");
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0].permission, catalogEntry(toolId).authorization.permission);
    assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
  });

  test(`${toolId}: a denied principal is refused with ForbiddenError and writes nothing`, async () => {
    const { deps, newsletterCampaignRepo, newsletterListRepo, newsletterSubscriptionRepo } = fakeRouteDeps({ allow: false });
    await newsletterCampaignRepo.saveCampaignRow(seedCampaign());
    await newsletterListRepo.save(seedList());
    await newsletterSubscriptionRepo.save(seedSubscription());

    const beforeCampaigns = await newsletterCampaignRepo.list({ workspaceId: WORKSPACE_ID });
    const beforeLists = await newsletterListRepo.list({ workspaceId: WORKSPACE_ID });
    const beforeSubs = await newsletterSubscriptionRepo.list({ workspaceId: WORKSPACE_ID, listId: "list-1" });

    const fixtures = { listId: "list-1", campaignId: "campaign-1", subscriptionId: "subscription-1" };
    await assert.rejects(
      () => wired(toolId, deps).handler(executionContext(toolInputs(fixtures)[toolId])),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenError, `expected ForbiddenError, got ${String(error)}`);
        assert.match((error as Error).message, new RegExp(PRINCIPAL_ID));
        return true;
      },
    );

    assert.deepEqual(await newsletterCampaignRepo.list({ workspaceId: WORKSPACE_ID }), beforeCampaigns);
    assert.deepEqual(await newsletterListRepo.list({ workspaceId: WORKSPACE_ID }), beforeLists);
    assert.deepEqual(await newsletterSubscriptionRepo.list({ workspaceId: WORKSPACE_ID, listId: "list-1" }), beforeSubs);
  });
}

test("newsletter_get_campaign: an unknown campaign id throws NewsletterCampaignNotFoundError", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(() => wired("newsletter_get_campaign", deps).handler(executionContext({ campaignId: "nope" })), NewsletterCampaignNotFoundError);
});

test("newsletter_remove_subscription: a subscriptionId belonging to a different list is refused as not-found, not cross-list removed", async () => {
  const { deps, newsletterListRepo, newsletterSubscriptionRepo } = fakeRouteDeps();
  await newsletterListRepo.save(seedList({ id: "list-1" }));
  await newsletterListRepo.save(seedList({ id: "list-2", slug: "second" }));
  await newsletterSubscriptionRepo.save(seedSubscription({ id: "sub-1", listId: "list-1" }));

  await assert.rejects(
    () => wired("newsletter_remove_subscription", deps).handler(executionContext({ listId: "list-2", subscriptionId: "sub-1" })),
    NewsletterSubscriptionNotFoundError,
  );
});

test("newsletter_resend_confirmation: resolves {delivered:true} and sends mail for a known contact, invalidating no state", async () => {
  const { deps, newsletterSubscriptionRepo, sentMail } = fakeRouteDeps();
  await newsletterSubscriptionRepo.save(seedSubscription({ id: "sub-1", subscriberId: "subscriber-1" }));

  const result = await wired("newsletter_resend_confirmation", deps).handler(executionContext({ subscriptionId: "sub-1" }));
  assert.deepEqual(result, { delivered: true });
  assert.equal(sentMail.length, 1);
});

// ---------------------------------------------------------------------------
// 4. Multi-tool workflow: create a list, then create/edit/cancel a campaign against it
// ---------------------------------------------------------------------------

test("workflow: newsletter_create_list -> newsletter_create_campaign -> newsletter_update_campaign -> newsletter_get_campaign -> newsletter_cancel_campaign chains correctly", async () => {
  const { deps, newsletterCampaignRepo, newsletterListRepo } = fakeRouteDeps();

  // Step 1: create a new list (a real admin task before composing a campaign for it).
  const listResult = (await wired("newsletter_create_list", deps).handler(executionContext({ name: "Product Updates", slug: "product-updates" }))) as {
    list: { id: string; slug: string; isDefault: boolean };
  };
  assert.equal(listResult.list.slug, "product-updates");
  assert.equal(listResult.list.isDefault, false, "an admin-created list is never the default");

  // Step 2: create a campaign draft using EXACTLY the listId the create_list call returned.
  const createResult = (await wired("newsletter_create_campaign", deps).handler(
    executionContext({
      subject: "Q3 roadmap",
      fromName: "Product Team",
      fromEmail: "product@example.test",
      replyTo: "product@example.test",
      listId: listResult.list.id,
    }),
  )) as { campaign: { id: string; status: string; listId: string; version: number } };
  assert.equal(createResult.campaign.status, "draft");
  assert.equal(createResult.campaign.listId, listResult.list.id, "the campaign must target the list just created, not a hardcoded id");
  assert.equal(createResult.campaign.version, 1);

  // Step 3: edit the campaign's subject using the campaignId the create call returned — a partial
  // patch, so fromName/fromEmail/replyTo/listId must survive unchanged.
  const updateResult = (await wired("newsletter_update_campaign", deps).handler(
    executionContext({ campaignId: createResult.campaign.id, subject: "Q3 roadmap (revised)" }),
  )) as { campaign: { id: string; subject: string; listId: string; fromEmail: string; version: number } };
  assert.equal(updateResult.campaign.subject, "Q3 roadmap (revised)");
  assert.equal(updateResult.campaign.listId, listResult.list.id, "an omitted field in the patch must keep its prior value");
  assert.equal(updateResult.campaign.fromEmail, "product@example.test");
  assert.equal(updateResult.campaign.version, 2, "editing must bump the optimistic-concurrency version");

  // Step 4: re-read via get_campaign and confirm it reflects step 3's write, not stale state.
  const getResult = (await wired("newsletter_get_campaign", deps).handler(executionContext({ campaignId: createResult.campaign.id }))) as {
    campaign: { subject: string; version: number };
  };
  assert.equal(getResult.campaign.subject, "Q3 roadmap (revised)");
  assert.equal(getResult.campaign.version, 2);

  // Step 5: cancel the campaign — the safety/rollback action, never a send trigger.
  const cancelResult = (await wired("newsletter_cancel_campaign", deps).handler(executionContext({ campaignId: createResult.campaign.id }))) as {
    campaign: { status: string; version: number };
  };
  assert.equal(cancelResult.campaign.status, "canceled");

  // Step 6: confirm end-to-end consistency across BOTH repos the workflow touched.
  const storedCampaign = await newsletterCampaignRepo.findById({ workspaceId: WORKSPACE_ID, id: createResult.campaign.id });
  assert.equal(storedCampaign?.status, "canceled");
  assert.equal(storedCampaign?.subject, "Q3 roadmap (revised)");
  assert.equal(storedCampaign?.listId, listResult.list.id);

  const storedList = await newsletterListRepo.findById({ workspaceId: WORKSPACE_ID, id: listResult.list.id });
  assert.equal(storedList?.status, "active", "canceling the campaign must not affect the list it targeted");
});
