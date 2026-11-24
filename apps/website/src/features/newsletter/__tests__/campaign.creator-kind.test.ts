import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";

import { describeEachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { installNewsletterDataModule, NEWSLETTER_TABLE_NAMES } from "@jini-ai/user-management/newsletter/data-module-manifest";
import { declareDataModule } from "@jini-ai/db/data-modules";
import { FIRST_PARTY_PUBLISHER } from "#src/server/runtime/composition/data-modules";
import { saveCampaign, type CampaignWriteServiceDeps } from "@jini-ai/user-management/newsletter/campaign-write-service";
import { createHookRegistry } from "@jini-ai/user-management/newsletter/hooks";
import {
  InMemoryNewsletterAudienceSnapshotRepo, InMemoryNewsletterCampaignRepo, InMemoryNewsletterConfirmationTokenRepo,
  InMemoryNewsletterListRepo, InMemoryNewsletterSendRepo, InMemoryNewsletterSubscriptionRepo,
} from "@jini-ai/user-management/newsletter/repo.memory";
import { SqliteNewsletterCampaignRepo } from "../repo.sqlite.js";
import { buildNewsletterRegistrations, type NewsletterToolDeps } from "../tool-registrations.js";

/**
 * @file H4(a) (owner decision 11-23): `newsletter_campaigns.created_by_kind` is recorded AT WRITE
 * TIME. A campaign an agent creates through its tools records `"agent"`; one a person creates (the
 * admin routes call `saveCampaign` with no `creatorKind`) records `"person"`; re-saving never changes
 * it — an owner fixing a typo in an agent's draft must not turn it into a person's campaign, or the
 * agent-pause hold would let its scheduled send through. Pinned on every SQL dialect plus the tools.
 */

const WS = "ws-campaign-kind";
const NOW = "2026-11-24T00:00:00.000Z";
const FIELDS = { subject: "Hello", preheader: null, fromName: "Acme", fromEmail: "hello@acme.test", replyTo: "hello@acme.test", listId: "list-1" };
const clock = { nowIso: () => NOW };

function installFresh(base: ContentKernel): Promise<void> {
  const dropped = Object.values(NEWSLETTER_TABLE_NAMES).reduce(
    (chain, table) => chain.then(() => base.execute(sql`DROP TABLE IF EXISTS ${sql.table(table)}`)),
    Promise.resolve()
  );
  return dropped.then(() => installNewsletterDataModule({ publisher: FIRST_PARTY_PUBLISHER, declareDataModule, db: base, dbPath: ":memory:" }));
}

function writeDeps(base: ContentKernel): CampaignWriteServiceDeps {
  const pending = installFresh(base);
  pending.catch(() => {});
  const kernel = heldUntil(base, pending);
  const listRepo = new InMemoryNewsletterListRepo({}, { initialRows: [
    { id: "list-1", workspaceId: WS, name: "All", slug: "all", isDefault: true, status: "active" as const, createdAt: NOW, updatedAt: NOW },
  ] });
  let counter = 0;
  return { campaignRepo: new SqliteNewsletterCampaignRepo({ store: kernel }), listRepo, clock, ids: { newId: () => `id-${++counter}` } };
}

describeEachDialect("campaign creator kind", { tables: ["newsletter_campaigns", "newsletter_campaign_revisions"], make: writeDeps }, (makeDeps) => {
  test("saveCampaign records the kind given, 'person' when omitted; a re-save never changes it", async () => {
    const deps = makeDeps();
    const agent = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "p-1", creatorKind: "agent", fields: FIELDS } });
    const person = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "p-1", fields: FIELDS } });
    const kindOf = async (id: string) => (await deps.campaignRepo.findById({ workspaceId: WS, id }))?.createdByKind;
    assert.equal(await kindOf(agent.campaign.id), "agent");
    assert.equal(await kindOf(person.campaign.id), "person");

    // An owner re-saves the agent's draft, even asking for "person": the stored kind is write-once.
    const edited = await saveCampaign({ deps, input: { workspaceId: WS, id: agent.campaign.id, actorId: "owner-1", creatorKind: "person", fields: { ...FIELDS, subject: "Edited" } } });
    assert.equal(edited.campaign.subject, "Edited");
    assert.equal(await kindOf(agent.campaign.id), "agent");
  });
});

test("newsletter_create_campaign (the agent tool) records created_by_kind 'agent'", async () => {
  let counter = 0;
  const campaignRepo = new InMemoryNewsletterCampaignRepo();
  const listRepo = new InMemoryNewsletterListRepo();
  await listRepo.save({ id: "list-1", workspaceId: WS, name: "All", slug: "all", isDefault: true, status: "active", createdAt: NOW, updatedAt: NOW });
  const deps: NewsletterToolDeps = {
    workspaceId: WS, clock, idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as NewsletterToolDeps["outbox"],
    bus: { publish: async () => undefined, subscribe: () => undefined } as unknown as NewsletterToolDeps["bus"],
    mailer: { send: async () => undefined } as unknown as NewsletterToolDeps["mailer"],
    originRegistry: { isAllowedEgressTarget: async () => true } as unknown as NewsletterToolDeps["originRegistry"],
    newsletterReady: Promise.resolve(),
    newsletterCampaignRepo: campaignRepo, newsletterListRepo: listRepo,
    newsletterSubscriptionRepo: new InMemoryNewsletterSubscriptionRepo(),
    newsletterAudienceSnapshotRepo: new InMemoryNewsletterAudienceSnapshotRepo(),
    newsletterSendRepo: new InMemoryNewsletterSendRepo(),
    newsletterConfirmationTokenRepo: new InMemoryNewsletterConfirmationTokenRepo(),
    newsletterSubscriberDirectory: { getContact: async () => null } as unknown as NewsletterToolDeps["newsletterSubscriberDirectory"],
    newsletterHooks: createHookRegistry(), membersConsentCapability: null,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  };
  const create = buildNewsletterRegistrations(deps).find((tool) => tool.descriptor.id === "newsletter_create_campaign")!;
  const ctx = { executionId: "exec", principal: { id: "principal-1" }, run: { id: "run" }, signal: new AbortController().signal };
  const { campaign } = await create.handler({ ...ctx, input: { ...FIELDS } }) as { campaign: { id: string } };
  assert.equal((await campaignRepo.findById({ workspaceId: WS, id: campaign.id }))?.createdByKind, "agent");
});
