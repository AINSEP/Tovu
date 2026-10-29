import { contentKernel } from "#src/platform/db/content-kernel";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
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

import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
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
const LATER = "2026-07-14T00:00:00.000Z";

function makeContractCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
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
    ...overrides,
  };
}

async function makeSqliteDb(): Promise<ContentDb> {
  const db = openContentDb(":memory:");
  await installNewsletterDataModule({
    db: contentKernel((db as unknown as { $client: import("better-sqlite3").Database }).$client),
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
      replyTo: "replies@acme.test",
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
    assert.deepEqual(found, campaign);
    assert.equal(await repo.findById({ workspaceId: "other-workspace", id: campaign.id }), null);
    assert.deepEqual(await repo.list({ workspaceId: "other-workspace" }), []);
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

  test(`[${name}] NewsletterCampaignRepoPort: concurrent incrementCounter calls all land (2026-09-16)`, async () => {
    const repo = await makeRepo();
    await repo.saveCampaignRow(makeContractCampaign());
    await Promise.all([
      repo.incrementCounter({ workspaceId: WS, id: "camp-1", counter: "delivered", updatedAt: LATER }),
      repo.incrementCounter({ workspaceId: WS, id: "camp-1", counter: "delivered", updatedAt: LATER }),
      repo.incrementCounter({ workspaceId: WS, id: "camp-1", counter: "failed", updatedAt: LATER }),
    ]);
    const found = await repo.findById({ workspaceId: WS, id: "camp-1" });
    assert.deepEqual(found?.counters, { recipients: 0, delivered: 2, failed: 1, bounced: 0, complained: 0, unsubscribed: 0 });
    assert.equal(found?.updatedAt, LATER);
  });

  test(`[${name}] NewsletterCampaignRepoPort: incrementCounter changes only counters and updatedAt`, async () => {
    const repo = await makeRepo();
    const seed = makeContractCampaign({ status: "paused", version: 3, audienceSnapshotId: "snap-1", sendStartedAt: NOW });
    await repo.saveCampaignRow(seed);
    await repo.incrementCounter({ workspaceId: WS, id: "camp-1", counter: "delivered", updatedAt: LATER });
    const found = await repo.findById({ workspaceId: WS, id: "camp-1" });
    assert.deepEqual(found, { ...seed, counters: { ...seed.counters, delivered: 1 }, updatedAt: LATER });
  });

  test(`[${name}] NewsletterCampaignRepoPort: saveCampaignRow on an existing campaign keeps its stored counters`, async () => {
    const repo = await makeRepo();
    const seed = makeContractCampaign({
      status: "sending",
      counters: { recipients: 7, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 },
    });
    await repo.saveCampaignRow(seed);
    await repo.incrementCounter({ workspaceId: WS, id: "camp-1", counter: "delivered", updatedAt: LATER });
    // A status write built from a stale (pre-increment) read must not roll the increment back.
    await repo.saveCampaignRow({ ...seed, status: "paused", updatedAt: LATER });
    const found = await repo.findById({ workspaceId: WS, id: "camp-1" });
    assert.equal(found?.status, "paused");
    assert.equal(found?.counters.delivered, 1);
    assert.equal(found?.counters.recipients, 7);
  });

  test(`[${name}] NewsletterCampaignRepoPort: incrementCounter on a missing campaign is a no-op`, async () => {
    const repo = await makeRepo();
    await repo.incrementCounter({ workspaceId: WS, id: "camp-1", counter: "delivered", updatedAt: LATER });
    assert.equal(await repo.findById({ workspaceId: WS, id: "camp-1" }), null);
    assert.deepEqual(await repo.list({ workspaceId: WS }), []);
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
    assert.deepEqual(await repo.findById({ workspaceId: WS, id: row.id }), row);
    assert.equal(await repo.findById({ workspaceId: "other-workspace", id: row.id }), null);
    assert.equal(await repo.findDefault({ workspaceId: "other-workspace" }), null);
    assert.deepEqual(await repo.list({ workspaceId: "other-workspace" }), []);
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
      source: "signup_form",
      consentRevisionIdAtSubscribe: null,
      subscribedAt: null,
      unsubscribedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repo.save(row);
    assert.equal((await repo.findById({ workspaceId: WS, id: "sub-1" }))?.status, "pending");
    assert.deepEqual(await repo.findById({ workspaceId: WS, id: row.id }), row);
    assert.equal(await repo.findById({ workspaceId: "other-workspace", id: row.id }), null);
    assert.equal(await repo.findBySubscriberAndList({ workspaceId: "other-workspace", listId: row.listId, subscriberId: row.subscriberId }), null);
    assert.equal(
      (await repo.findBySubscriberAndList({ workspaceId: WS, listId: "list-1", subscriberId: "subscriber-1" }))?.id,
      "sub-1"
    );
    assert.equal((await repo.listSubscribed({ workspaceId: WS, listId: "list-1" })).length, 0);

    await repo.save({ ...row, status: "subscribed", consentRevisionIdAtSubscribe: "rev-1", subscribedAt: NOW });
    assert.equal((await repo.listSubscribed({ workspaceId: WS, listId: "list-1" })).length, 1);
    assert.deepEqual(await repo.findById({ workspaceId: WS, id: row.id }), { ...row, status: "subscribed", consentRevisionIdAtSubscribe: "rev-1", subscribedAt: NOW });
    assert.deepEqual(await repo.listSubscribed({ workspaceId: "other-workspace", listId: row.listId }), []);

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

function makePendingSendRow(overrides: Partial<SendRow> = {}): SendRow {
  return {
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
    ...overrides,
  };
}

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

  test(`[${name}] NewsletterSendRepoPort: claimForDispatch leases a pending row once; a live lease, a terminal row and a missing row are not claimable; an expired lease is (2026-09-16)`, async () => {
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
    const lease1 = "2026-07-13T00:05:00.000Z";

    // (a) a pending, unleased row is claimable.
    const claimed = await repo.claimForDispatch({ workspaceId: WS, id: "send-1", nowIso: NOW, leaseUntilIso: lease1 });
    assert.equal(claimed?.nextAttemptAt, lease1);
    assert.equal(claimed?.status, "pending");

    // (b) a live lease (nowIso before it expires) is not claimable, and the existing lease is untouched.
    const tooEarly = await repo.claimForDispatch({ workspaceId: WS, id: "send-1", nowIso: "2026-07-13T00:04:59.999Z", leaseUntilIso: "2026-07-13T00:20:00.000Z" });
    assert.equal(tooEarly, null);
    const stillLeased = await repo.findById({ workspaceId: WS, id: "send-1" });
    assert.equal(stillLeased?.nextAttemptAt, lease1);

    // (c) a leased row stays "pending", so it still counts as pending.
    assert.equal(await repo.countPendingByCampaign({ workspaceId: WS, campaignId: "camp-1" }), 1);

    // (d) the boundary nowIso === the lease's expiry (<=) is claimable again.
    const lease2 = "2026-07-13T00:10:00.000Z";
    const reclaimed = await repo.claimForDispatch({ workspaceId: WS, id: "send-1", nowIso: lease1, leaseUntilIso: lease2 });
    assert.equal(reclaimed?.nextAttemptAt, lease2);

    // (e) a terminal row is never claimable, however far in the future.
    await repo.save({ ...base, status: "delivered" });
    const terminalClaim = await repo.claimForDispatch({ workspaceId: WS, id: "send-1", nowIso: "2099-01-01T00:00:00.000Z", leaseUntilIso: "2099-01-01T00:05:00.000Z" });
    assert.equal(terminalClaim, null);

    // (f) a missing row is never claimable.
    const missingClaim = await repo.claimForDispatch({ workspaceId: WS, id: "nope", nowIso: NOW, leaseUntilIso: lease1 });
    assert.equal(missingClaim, null);
  });

  test(`[${name}] NewsletterSendRepoPort: recordOutcome records a pending row once; a concurrent second record returns null and changes nothing`, async () => {
    const repo = await makeRepo();
    const seed = makePendingSendRow({ nextAttemptAt: "2026-07-13T00:02:00.000Z", attempts: 0 });
    await repo.save(seed);

    const [first, second] = await Promise.all([
      repo.recordOutcome({ workspaceId: WS, id: "send-1", status: "delivered", providerMessageId: "pm-1", lastError: null, updatedAt: LATER }),
      repo.recordOutcome({ workspaceId: WS, id: "send-1", status: "failed", providerMessageId: null, lastError: "boom", updatedAt: "2026-07-15T00:00:00.000Z" }),
    ]);
    assert.equal(second, null);

    const expected: SendRow = { ...seed, status: "delivered", attempts: 1, providerMessageId: "pm-1", lastError: null, nextAttemptAt: null, updatedAt: LATER };
    assert.deepEqual(first, expected);
    assert.deepEqual(await repo.findById({ workspaceId: WS, id: "send-1" }), expected);
  });

  test(`[${name}] NewsletterSendRepoPort: recordOutcome keeps the stored providerMessageId when the outcome has none`, async () => {
    const repo = await makeRepo();
    await repo.save(makePendingSendRow({ providerMessageId: "kept-pm" }));
    const recorded = await repo.recordOutcome({ workspaceId: WS, id: "send-1", status: "failed", providerMessageId: null, lastError: "boom", updatedAt: LATER });
    assert.equal(recorded?.providerMessageId, "kept-pm");
    assert.equal(recorded?.lastError, "boom");
  });

  test(`[${name}] NewsletterSendRepoPort: recordOutcome on a missing or already-terminal row returns null`, async () => {
    const repo = await makeRepo();
    assert.equal(
      await repo.recordOutcome({ workspaceId: WS, id: "nope", status: "delivered", providerMessageId: "pm-1", lastError: null, updatedAt: LATER }),
      null
    );

    const seed = makePendingSendRow({ status: "delivered" });
    await repo.save(seed);
    const result = await repo.recordOutcome({ workspaceId: WS, id: "send-1", status: "failed", providerMessageId: null, lastError: "boom", updatedAt: LATER });
    assert.equal(result, null);
    assert.deepEqual(await repo.findById({ workspaceId: WS, id: "send-1" }), seed);
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
    assert.deepEqual(await repo.findById({ workspaceId: WS, id: row.id }), row);
    assert.equal(await repo.findById({ workspaceId: "other-workspace", id: row.id }), null);
    assert.equal(await repo.findByTokenHash({ workspaceId: "other-workspace", tokenHash: row.tokenHash }), null);
    assert.deepEqual(await repo.findUnconsumedBySubscription({ workspaceId: "other-workspace", subscriptionId: row.subscriptionId }), []);
    assert.equal((await repo.findByTokenHash({ workspaceId: WS, tokenHash: "hash-1" }))?.id, "token-1");
    assert.equal((await repo.findUnconsumedBySubscription({ workspaceId: WS, subscriptionId: "sub-1" })).length, 1);

    await repo.save({ ...row, consumedAt: NOW });
    assert.equal((await repo.findUnconsumedBySubscription({ workspaceId: WS, subscriptionId: "sub-1" })).length, 0);
    assert.deepEqual(await repo.findById({ workspaceId: WS, id: row.id }), { ...row, consumedAt: NOW });
  });
}

// A removed cursor still defines an id boundary: it need not be a live row.
for (const [name, makeRepo] of campaignAdapters) {
  test(`[${name}] campaign pagination orders, limits and accepts existing or removed cursors`, async () => {
    const repo = await makeRepo();
    for (const id of ["page-3", "page-1", "page-5"]) await repo.saveCampaignRow(makeContractCampaign({ id }));
    await repo.saveCampaignRow(makeContractCampaign({ id: "page-2", workspaceId: "other-workspace" }));
    assert.deepEqual((await repo.list({ workspaceId: WS })).map((row) => row.id), ["page-1", "page-3", "page-5"]);
    assert.deepEqual((await repo.list({ workspaceId: WS, limit: 2 })).map((row) => row.id), ["page-1", "page-3"]);
    assert.deepEqual((await repo.list({ workspaceId: WS, afterId: "page-1", limit: 1 })).map((row) => row.id), ["page-3"]);
    assert.deepEqual((await repo.list({ workspaceId: WS, afterId: "page-2", limit: 1 })).map((row) => row.id), ["page-3"]);
    assert.deepEqual(await repo.list({ workspaceId: WS, afterId: "page-9", limit: 1 }), []);
  });
}
for (const [name, makeRepo] of subscriptionAdapters) {
  test(`[${name}] subscription pagination orders, limits and accepts existing or removed cursors`, async () => {
    const repo = await makeRepo();
    const base: SubscriptionRow = { id: "page-1", workspaceId: WS, listId: "list-1", subscriberId: "member-1", status: "subscribed", source: "admin", consentRevisionIdAtSubscribe: "rev-1", subscribedAt: NOW, unsubscribedAt: null, createdAt: NOW, updatedAt: NOW };
    for (const id of ["page-3", "page-1", "page-5"]) await repo.save({ ...base, id, subscriberId: id });
    await repo.save({ ...base, id: "page-2", workspaceId: "other-workspace" });
    await repo.save({ ...base, id: "page-4", listId: "other-list" });
    assert.deepEqual((await repo.list({ workspaceId: WS, listId: "list-1" })).map((row) => row.id), ["page-1", "page-3", "page-5"]);
    assert.deepEqual((await repo.list({ workspaceId: WS, listId: "list-1", limit: 2 })).map((row) => row.id), ["page-1", "page-3"]);
    assert.deepEqual((await repo.list({ workspaceId: WS, listId: "list-1", afterId: "page-1", limit: 1 })).map((row) => row.id), ["page-3"]);
    assert.deepEqual((await repo.list({ workspaceId: WS, listId: "list-1", afterId: "page-2", limit: 1 })).map((row) => row.id), ["page-3"]);
    assert.deepEqual(await repo.list({ workspaceId: WS, listId: "list-1", afterId: "page-9", limit: 1 }), []);
  });
}
for (const [name, makeRepo] of sendAdapters) {
  test(`[${name}] send pagination orders, limits and accepts existing or removed cursors`, async () => {
    const repo = await makeRepo();
    for (const id of ["page-3", "page-1", "page-5"]) await repo.save(makePendingSendRow({ id, subscriberId: id, idempotencyKey: id }));
    await repo.save(makePendingSendRow({ id: "page-2", workspaceId: "other-workspace", idempotencyKey: "other-workspace" }));
    await repo.save(makePendingSendRow({ id: "page-4", campaignId: "other-campaign", idempotencyKey: "other-campaign" }));
    assert.deepEqual((await repo.listByCampaign({ workspaceId: WS, campaignId: "camp-1" })).map((row) => row.id), ["page-1", "page-3", "page-5"]);
    assert.deepEqual((await repo.listByCampaign({ workspaceId: WS, campaignId: "camp-1", limit: 2 })).map((row) => row.id), ["page-1", "page-3"]);
    assert.deepEqual((await repo.listByCampaign({ workspaceId: WS, campaignId: "camp-1", afterId: "page-1", limit: 1 })).map((row) => row.id), ["page-3"]);
    assert.deepEqual((await repo.listByCampaign({ workspaceId: WS, campaignId: "camp-1", afterId: "page-2", limit: 1 })).map((row) => row.id), ["page-3"]);
    assert.deepEqual(await repo.listByCampaign({ workspaceId: WS, campaignId: "camp-1", afterId: "page-9", limit: 1 }), []);
  });
}


test("memory campaign seeds are copied, revisions stay campaign-scoped, and absent seed fields start empty", async () => {
  const first = makeContractCampaign();
  const campaigns = [first];
  const revisions = [
    { workspaceId: WS, campaignId: "other", seq: 1, state: first, actorId: "actor", recordedAt: NOW },
    { workspaceId: "other-workspace", campaignId: "camp-1", seq: 1, state: first, actorId: "actor", recordedAt: NOW },
    { workspaceId: WS, campaignId: "camp-1", seq: 2, state: first, actorId: "actor", recordedAt: LATER },
    { workspaceId: WS, campaignId: "camp-1", seq: 1, state: first, actorId: "actor", recordedAt: NOW },
  ];
  const repo = new InMemoryNewsletterCampaignRepo({ campaigns, revisions });
  campaigns.push(makeContractCampaign({ id: "late" }));
  revisions.push({ workspaceId: WS, campaignId: "camp-1", seq: 3, state: first, actorId: "actor", recordedAt: LATER });
  assert.deepEqual(await repo.list({ workspaceId: WS }), [first]);
  await repo.incrementCounter({ workspaceId: "other-workspace", id: "camp-1", counter: "delivered", updatedAt: LATER });
  await repo.incrementCounter({ workspaceId: WS, id: "missing", counter: "delivered", updatedAt: LATER });
  assert.deepEqual(await repo.findById({ workspaceId: WS, id: "camp-1" }), first);
  assert.deepEqual((await repo.listRevisions({ workspaceId: WS, campaignId: "camp-1" })).map((row) => row.seq), [1, 2]);
  assert.deepEqual(await new InMemoryNewsletterCampaignRepo({ campaigns: [first] }).listRevisions({ workspaceId: WS, campaignId: "camp-1" }), []);
  assert.deepEqual(await new InMemoryNewsletterCampaignRepo({ revisions }).list({ workspaceId: WS }), []);
  assert.deepEqual(await new InMemoryNewsletterCampaignRepo({}).list({ workspaceId: WS }), []);
});

test("memory list upserts and default lookup respect workspace and default flag", async () => {
  const ordinary: NewsletterListRow = { id: "list-1", workspaceId: WS, name: "Ordinary", slug: "ordinary",
    isDefault: false, status: "active", createdAt: NOW, updatedAt: NOW };
  const foreign = { ...ordinary, workspaceId: "other-workspace", isDefault: true };
  const chosen = { ...ordinary, id: "default", isDefault: true };
  const seeds = [foreign, ordinary, chosen];
  const repo = new InMemoryNewsletterListRepo(seeds);
  seeds.pop();
  assert.deepEqual(await repo.findDefault({ workspaceId: WS }), chosen);
  assert.equal(await repo.findDefault({ workspaceId: "missing" }), null);
  const changed = { ...ordinary, name: "Updated" };
  await repo.save(changed);
  assert.deepEqual(await repo.findById({ workspaceId: WS, id: "list-1" }), changed);
  assert.deepEqual(await repo.findById({ workspaceId: "other-workspace", id: "list-1" }), foreign);
  assert.deepEqual(await repo.list({ workspaceId: WS }), [changed, chosen]);
});

test("memory subscriptions distinguish subscriber, list and workspace during lookup and removal", async () => {
  const row: SubscriptionRow = { id: "sub-1", workspaceId: WS, listId: "list-1", subscriberId: "reader-1",
    status: "subscribed", source: "admin", consentRevisionIdAtSubscribe: null, subscribedAt: NOW,
    unsubscribedAt: null, createdAt: NOW, updatedAt: NOW };
  const foreign = { ...row, workspaceId: "other-workspace" };
  const otherList = { ...row, id: "sub-2", listId: "other-list" };
  const otherSubscriber = { ...row, id: "sub-3", subscriberId: "reader-2" };
  const seeds = [foreign, otherList, otherSubscriber, row];
  const repo = new InMemoryNewsletterSubscriptionRepo(seeds);
  seeds.pop();
  assert.deepEqual(await repo.findBySubscriberAndList({ workspaceId: WS, listId: "list-1", subscriberId: "reader-1" }), row);
  assert.equal(await repo.findBySubscriberAndList({ workspaceId: WS, listId: "list-1", subscriberId: "missing" }), null);
  assert.deepEqual(await repo.listSubscribed({ workspaceId: WS, listId: "list-1" }), [otherSubscriber, row]);
  const updated = { ...row, status: "unsubscribed" as const, unsubscribedAt: LATER };
  await repo.save(updated);
  assert.deepEqual(await repo.findById({ workspaceId: WS, id: "sub-1" }), updated);
  await repo.remove({ workspaceId: WS, id: "sub-1" });
  assert.equal(await repo.findById({ workspaceId: WS, id: "sub-1" }), null);
  assert.deepEqual(await repo.findById({ workspaceId: "other-workspace", id: "sub-1" }), foreign);
  assert.deepEqual(await repo.list({ workspaceId: WS, listId: "list-1" }), [otherSubscriber]);
});

test("memory audience snapshots miss on either lookup key and remain immutable within each workspace", async () => {
  const row: AudienceSnapshotRow = { id: "snapshot-1", workspaceId: WS, campaignId: "camp-1", listId: "list-1", recipientCount: 3, createdAt: NOW };
  const foreign = { ...row, workspaceId: "other-workspace" };
  const seeds = [foreign, row];
  const repo = new InMemoryNewsletterAudienceSnapshotRepo(seeds);
  seeds.pop();
  assert.equal(await repo.findById({ workspaceId: WS, id: "missing" }), null);
  assert.equal(await repo.findById({ workspaceId: "missing", id: "snapshot-1" }), null);
  assert.equal(await repo.findByCampaignId({ workspaceId: WS, campaignId: "missing" }), null);
  assert.equal(await repo.findByCampaignId({ workspaceId: "missing", campaignId: "camp-1" }), null);
  assert.deepEqual(await repo.findById({ workspaceId: WS, id: "snapshot-1" }), row);
  assert.deepEqual(await repo.findByCampaignId({ workspaceId: WS, campaignId: "camp-1" }), row);
  const second = { ...row, id: "snapshot-2", campaignId: "camp-2" };
  await repo.save(second);
  assert.deepEqual(await repo.findById({ workspaceId: WS, id: "snapshot-2" }), second);
  await assert.rejects(repo.save({ ...row, recipientCount: 99 }), { message: "AudienceSnapshotRow snapshot-1 already exists and is immutable (INV-06)" });
  assert.deepEqual(await repo.findById({ workspaceId: WS, id: "snapshot-1" }), row);
});

test("memory send filters distinguish workspace, campaign, audience and pending state", async () => {
  const row = makePendingSendRow();
  const foreign = { ...row, workspaceId: "other-workspace" };
  const otherCampaign = makePendingSendRow({ id: "send-2", campaignId: "other-campaign", idempotencyKey: "other-campaign" });
  const otherAudience = makePendingSendRow({ id: "send-3", audienceSnapshotId: "other-snapshot", idempotencyKey: "other-audience" });
  const delivered = makePendingSendRow({ id: "send-4", status: "delivered", idempotencyKey: "delivered" });
  const seeds = [foreign, otherCampaign, otherAudience, delivered, row];
  const repo = new InMemoryNewsletterSendRepo(seeds);
  seeds.pop();
  assert.equal(await repo.findById({ workspaceId: WS, id: "missing" }), null);
  assert.equal(await repo.findByIdempotencyKey({ workspaceId: WS, idempotencyKey: "missing" }), null);
  assert.equal(await repo.findByIdempotencyKey({ workspaceId: "missing", idempotencyKey: row.idempotencyKey }), null);
  assert.deepEqual(await repo.findByIdempotencyKey({ workspaceId: WS, idempotencyKey: row.idempotencyKey }), row);
  assert.deepEqual(await repo.listPendingByAudienceSnapshot({ workspaceId: WS, audienceSnapshotId: "snap-1", limit: 10 }), [otherCampaign, row]);
  assert.equal(await repo.countPendingByCampaign({ workspaceId: WS, campaignId: "camp-1" }), 2);
  assert.equal(await repo.claimForDispatch({ workspaceId: "missing", id: "send-1", nowIso: NOW, leaseUntilIso: LATER }), null);
  assert.equal(await repo.recordOutcome({ workspaceId: "missing", id: "send-1", status: "failed", providerMessageId: null, lastError: "wrong workspace", updatedAt: LATER }), null);
  assert.deepEqual(await repo.findById({ workspaceId: WS, id: "send-1" }), row);
  await repo.save({ ...row, status: "failed" });
  assert.deepEqual(await repo.findById({ workspaceId: "other-workspace", id: "send-1" }), foreign);
  assert.equal((await repo.findById({ workspaceId: WS, id: "send-1" }))?.status, "failed");
});

test("memory confirmation-token lookup requires the subscription and token hash as well as workspace", async () => {
  const row: ConfirmationTokenRecord = { id: "token-1", workspaceId: WS, subscriptionId: "sub-1", tokenHash: "hash-1",
    purpose: "newsletter_subscription_confirm", createdAt: NOW, expiresAt: LATER, consumedAt: null };
  const foreign = { ...row, workspaceId: "other-workspace" };
  const otherSubscription = { ...row, id: "token-2", subscriptionId: "other-subscription", tokenHash: "other-hash" };
  const consumed = { ...row, id: "token-3", tokenHash: "consumed-hash", consumedAt: NOW };
  const seeds = [foreign, otherSubscription, consumed, row];
  const repo = new InMemoryNewsletterConfirmationTokenRepo(seeds);
  seeds.pop();
  assert.deepEqual(await repo.findUnconsumedBySubscription({ workspaceId: WS, subscriptionId: "sub-1" }), [row]);
  assert.equal(await repo.findByTokenHash({ workspaceId: WS, tokenHash: "missing" }), null);
  assert.equal(await repo.findByTokenHash({ workspaceId: "missing", tokenHash: "hash-1" }), null);
  assert.deepEqual(await repo.findByTokenHash({ workspaceId: WS, tokenHash: "hash-1" }), row);
  await repo.save({ ...row, consumedAt: LATER });
  assert.deepEqual(await repo.findById({ workspaceId: "other-workspace", id: "token-1" }), foreign);
  assert.deepEqual(await repo.findUnconsumedBySubscription({ workspaceId: WS, subscriptionId: "sub-1" }), []);
});
