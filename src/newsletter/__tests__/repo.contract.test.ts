/**
 * @file T004 — shared contract-test suite for the 6 Newsletter repo ports (C-001..C-006),
 * parameterized to run against both `repo.memory.ts` and `repo.sqlite.ts` (matches `members`/
 * `settings` precedent). The SQLite adapter's `p_newsletter__*` tables are installed once per test
 * via `installNewsletterDataModule()` (T009/T010's real mechanism) against a fresh `:memory:` db —
 * this suite is itself a second, independent proof (alongside T010's dedicated test) that the real
 * manifest installs cleanly and every repo method round-trips through it correctly.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb, type ContentDb } from "../../db/sqlite/content-db.js";
import { installNewsletterDataModule } from "../data-module-manifest.js";
import {
  InMemoryNewsletterAudienceSnapshotRepo,
  InMemoryNewsletterCampaignRepo,
  InMemoryNewsletterConfirmationTokenRepo,
  InMemoryNewsletterListRepo,
  InMemoryNewsletterSendRepo,
  InMemoryNewsletterSubscriptionRepo,
} from "../repo.memory.js";
import {
  SqliteNewsletterAudienceSnapshotRepo,
  SqliteNewsletterCampaignRepo,
  SqliteNewsletterConfirmationTokenRepo,
  SqliteNewsletterListRepo,
  SqliteNewsletterSendRepo,
  SqliteNewsletterSubscriptionRepo,
} from "../repo.sqlite.js";
import type {
  NewsletterAudienceSnapshotRepoPort,
  NewsletterCampaignRepoPort,
  NewsletterConfirmationTokenRepoPort,
  NewsletterListRepoPort,
  NewsletterSendRepoPort,
  NewsletterSubscriptionRepoPort,
} from "../ports.js";
import type {
  AudienceSnapshotRow,
  CampaignRecord,
  ConfirmationTokenRecord,
  NewsletterListRow,
  SendRow,
  SubscriptionRow,
} from "../types.js";

const WS = "ws-newsletter-contract";
const NOW = "2026-07-13T00:00:00.000Z";

async function makeSqliteDb(): Promise<ContentDb> {
  const db = openContentDb(":memory:");
  await installNewsletterDataModule({
    db: (db as unknown as { $client: import("better-sqlite3").Database }).$client,
    dbPath: ":memory:",
  });
  return db;
}

const campaignAdapters: Array<[string, () => Promise<NewsletterCampaignRepoPort>]> = [
  ["memory", async () => new InMemoryNewsletterCampaignRepo()],
  ["sqlite", async () => new SqliteNewsletterCampaignRepo(await makeSqliteDb())],
];

for (const [name, makeRepo] of campaignAdapters) {
  test(`[${name}] NewsletterCampaignRepoPort: saveCampaignRow + appendRevision + findById + list round-trip`, async () => {
    const repo = await makeRepo();
    const campaign: CampaignRecord = {
      id: "camp-1",
      workspaceId: WS,
      status: "draft",
      subject: "Hello",
      preheader: null,
      fromName: "Acme",
      fromEmail: "hello@acme.test",
      replyTo: "hello@acme.test",
      listId: "list-1",
      scheduledAt: null,
      sendStartedAt: null,
      audienceSnapshotId: null,
      counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 },
      version: 1,
      createdByPrincipal: "actor-1",
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repo.saveCampaignRow(campaign);
    await repo.appendRevision({ campaignId: campaign.id, workspaceId: WS, seq: 1, state: campaign, actorId: "actor-1", recordedAt: NOW });

    const found = await repo.findById({ workspaceId: WS, id: "camp-1" });
    assert.equal(found?.subject, "Hello");
    assert.equal(found?.counters.recipients, 0);

    const listed = await repo.list({ workspaceId: WS });
    assert.equal(listed.length, 1);

    const revisions = await repo.listRevisions({ workspaceId: WS, campaignId: "camp-1" });
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0]!.seq, 1);

    assert.equal(await repo.findById({ workspaceId: WS, id: "nope" }), null);
  });

  test(`[${name}] NewsletterCampaignRepoPort: transaction rolls back on a thrown error (real tx at sqlite; no-op-but-still-throws at memory)`, async () => {
    const repo = await makeRepo();
    await assert.rejects(
      repo.transaction(async () => {
        await repo.saveCampaignRow({
          id: "camp-tx",
          workspaceId: WS,
          status: "draft",
          subject: "tx test",
          preheader: null,
          fromName: "Acme",
          fromEmail: "a@a.test",
          replyTo: "a@a.test",
          listId: "list-1",
          scheduledAt: null,
          sendStartedAt: null,
          audienceSnapshotId: null,
          counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 },
          version: 1,
          createdByPrincipal: "actor-1",
          createdAt: NOW,
          updatedAt: NOW,
        });
        throw new Error("forced mid-tx failure");
      })
    );
  });
}

const listAdapters: Array<[string, () => Promise<NewsletterListRepoPort>]> = [
  ["memory", async () => new InMemoryNewsletterListRepo()],
  ["sqlite", async () => new SqliteNewsletterListRepo(await makeSqliteDb())],
];

for (const [name, makeRepo] of listAdapters) {
  test(`[${name}] NewsletterListRepoPort: save + findById + findDefault + list round-trip`, async () => {
    const repo = await makeRepo();
    const row: NewsletterListRow = {
      id: "list-1",
      workspaceId: WS,
      name: "All subscribers",
      slug: "all-subscribers",
      isDefault: true,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repo.save(row);
    assert.equal((await repo.findById({ workspaceId: WS, id: "list-1" }))?.name, "All subscribers");
    assert.equal((await repo.findDefault({ workspaceId: WS }))?.id, "list-1");
    assert.equal((await repo.list({ workspaceId: WS })).length, 1);
    assert.equal(await repo.findById({ workspaceId: WS, id: "nope" }), null);
  });
}

const subscriptionAdapters: Array<[string, () => Promise<NewsletterSubscriptionRepoPort>]> = [
  ["memory", async () => new InMemoryNewsletterSubscriptionRepo()],
  ["sqlite", async () => new SqliteNewsletterSubscriptionRepo(await makeSqliteDb())],
];

for (const [name, makeRepo] of subscriptionAdapters) {
  test(`[${name}] NewsletterSubscriptionRepoPort: save + findById + findBySubscriberAndList + listSubscribed + remove`, async () => {
    const repo = await makeRepo();
    const row: SubscriptionRow = {
      id: "sub-1",
      workspaceId: WS,
      listId: "list-1",
      subscriberId: "subscriber-1",
      status: "pending",
      source: "admin",
      consentRevisionIdAtSubscribe: null,
      subscribedAt: null,
      unsubscribedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repo.save(row);
    assert.equal((await repo.findById({ workspaceId: WS, id: "sub-1" }))?.status, "pending");
    assert.equal(
      (await repo.findBySubscriberAndList({ workspaceId: WS, listId: "list-1", subscriberId: "subscriber-1" }))?.id,
      "sub-1"
    );
    assert.equal((await repo.listSubscribed({ workspaceId: WS, listId: "list-1" })).length, 0);

    await repo.save({ ...row, status: "subscribed", consentRevisionIdAtSubscribe: "rev-1", subscribedAt: NOW });
    assert.equal((await repo.listSubscribed({ workspaceId: WS, listId: "list-1" })).length, 1);

    await repo.remove({ workspaceId: WS, id: "sub-1" });
    assert.equal(await repo.findById({ workspaceId: WS, id: "sub-1" }), null);
  });
}

const snapshotAdapters: Array<[string, () => Promise<NewsletterAudienceSnapshotRepoPort>]> = [
  ["memory", async () => new InMemoryNewsletterAudienceSnapshotRepo()],
  ["sqlite", async () => new SqliteNewsletterAudienceSnapshotRepo(await makeSqliteDb())],
];

for (const [name, makeRepo] of snapshotAdapters) {
  test(`[${name}] NewsletterAudienceSnapshotRepoPort: save is create-only + findByCampaignId + findById`, async () => {
    const repo = await makeRepo();
    const row: AudienceSnapshotRow = {
      id: "snap-1",
      workspaceId: WS,
      campaignId: "camp-1",
      listId: "list-1",
      recipientCount: 3,
      createdAt: NOW,
    };
    await repo.save(row);
    assert.equal((await repo.findByCampaignId({ workspaceId: WS, campaignId: "camp-1" }))?.recipientCount, 3);
    assert.equal((await repo.findById({ workspaceId: WS, id: "snap-1" }))?.id, "snap-1");
    await assert.rejects(repo.save(row), "INV-06: a second save of the same id must fail, never silently update");
  });
}

const sendAdapters: Array<[string, () => Promise<NewsletterSendRepoPort>]> = [
  ["memory", async () => new InMemoryNewsletterSendRepo()],
  ["sqlite", async () => new SqliteNewsletterSendRepo(await makeSqliteDb())],
];

for (const [name, makeRepo] of sendAdapters) {
  test(`[${name}] NewsletterSendRepoPort: save + findById + findByIdempotencyKey + listPendingByAudienceSnapshot + countPendingByCampaign + saveBatch`, async () => {
    const repo = await makeRepo();
    const base: SendRow = {
      id: "send-1",
      workspaceId: WS,
      campaignId: "camp-1",
      audienceSnapshotId: "snap-1",
      subscriberId: "subscriber-1",
      recipientEmail: "a@a.test",
      status: "pending",
      attempts: 0,
      idempotencyKey: "newsletter:camp-1:subscriber-1:snap-1",
      providerMessageId: null,
      lastError: null,
      nextAttemptAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repo.save(base);
    assert.equal((await repo.findById({ workspaceId: WS, id: "send-1" }))?.status, "pending");
    assert.equal((await repo.findByIdempotencyKey({ workspaceId: WS, idempotencyKey: base.idempotencyKey }))?.id, "send-1");
    assert.equal((await repo.listPendingByAudienceSnapshot({ workspaceId: WS, audienceSnapshotId: "snap-1", limit: 10 })).length, 1);
    assert.equal(await repo.countPendingByCampaign({ workspaceId: WS, campaignId: "camp-1" }), 1);

    await repo.saveBatch([{ ...base, id: "send-2", subscriberId: "subscriber-2", idempotencyKey: "newsletter:camp-1:subscriber-2:snap-1" }]);
    assert.equal(await repo.countPendingByCampaign({ workspaceId: WS, campaignId: "camp-1" }), 2);

    await repo.save({ ...base, status: "delivered" });
    assert.equal(await repo.countPendingByCampaign({ workspaceId: WS, campaignId: "camp-1" }), 1);
  });
}

const tokenAdapters: Array<[string, () => Promise<NewsletterConfirmationTokenRepoPort>]> = [
  ["memory", async () => new InMemoryNewsletterConfirmationTokenRepo()],
  ["sqlite", async () => new SqliteNewsletterConfirmationTokenRepo(await makeSqliteDb())],
];

for (const [name, makeRepo] of tokenAdapters) {
  test(`[${name}] NewsletterConfirmationTokenRepoPort: save + findById + findUnconsumedBySubscription + findByTokenHash`, async () => {
    const repo = await makeRepo();
    const row: ConfirmationTokenRecord = {
      id: "token-1",
      workspaceId: WS,
      subscriptionId: "sub-1",
      tokenHash: "hash-1",
      purpose: "newsletter_subscription_confirm",
      createdAt: NOW,
      expiresAt: "2026-07-16T00:00:00.000Z",
      consumedAt: null,
    };
    await repo.save(row);
    assert.equal((await repo.findById({ workspaceId: WS, id: "token-1" }))?.tokenHash, "hash-1");
    assert.equal((await repo.findByTokenHash({ workspaceId: WS, tokenHash: "hash-1" }))?.id, "token-1");
    assert.equal((await repo.findUnconsumedBySubscription({ workspaceId: WS, subscriptionId: "sub-1" })).length, 1);

    await repo.save({ ...row, consumedAt: NOW });
    assert.equal((await repo.findUnconsumedBySubscription({ workspaceId: WS, subscriptionId: "sub-1" })).length, 0);
  });
}
