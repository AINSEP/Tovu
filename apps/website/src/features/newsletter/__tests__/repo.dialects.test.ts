import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { sql } from "kysely";

import { describeEachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { newsletterAudienceSnapshotRepoFor, newsletterCampaignRepoFor, newsletterConfirmationTokenRepoFor, newsletterListRepoFor, newsletterSendRepoFor, newsletterSubscriptionRepoFor } from "../repo.js";
import type { AudienceSnapshotRow, CampaignRecord, CampaignRevision, ConfirmationTokenRecord, NewsletterListRow, SendRow, SubscriptionRow } from "../types.js";

/**
 * @file The six newsletter repos on every dialect through the kernel's matrix (`describeEachDialect`
 * + ONE factory: one query body serves every dialect), one `describe` per class. Covers every
 * public method: hit, miss, other-workspace isolation and rollback. The campaign pair is in the
 * migrated core schema; the five `p_newsletter__*` dataModule tables are not, and the real install
 * (`data-module-manifest.ts`) runs SQLite-only DDL, so `make` creates the same columns with portable
 * DDL on each dialect (moving the install to the kernel is plan slice P1's job).
 */

const WS = "ws-dialects";
const OTHER = "ws-other";
const T0 = "2026-09-28T00:00:00.000Z";
const T1 = "2026-09-28T01:00:00.000Z";

const CREATE_TABLES = [
  sql`DROP TABLE IF EXISTS p_newsletter__lists`,
  sql`CREATE TABLE p_newsletter__lists (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL,
    is_default INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  sql`DROP TABLE IF EXISTS p_newsletter__subscriptions`,
  sql`CREATE TABLE p_newsletter__subscriptions (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, list_id TEXT NOT NULL, subscriber_id TEXT NOT NULL,
    status TEXT NOT NULL, source TEXT NOT NULL, consent_revision_id_at_subscribe TEXT, subscribed_at TEXT,
    unsubscribed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  sql`DROP TABLE IF EXISTS p_newsletter__audience_snapshots`,
  sql`CREATE TABLE p_newsletter__audience_snapshots (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, campaign_id TEXT NOT NULL, list_id TEXT NOT NULL,
    recipient_count INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  sql`DROP TABLE IF EXISTS p_newsletter__sends`,
  sql`CREATE TABLE p_newsletter__sends (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, campaign_id TEXT NOT NULL, audience_snapshot_id TEXT NOT NULL,
    subscriber_id TEXT NOT NULL, recipient_email TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL, provider_message_id TEXT, last_error TEXT, next_attempt_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  sql`DROP TABLE IF EXISTS p_newsletter__confirmation_tokens`,
  sql`CREATE TABLE p_newsletter__confirmation_tokens (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, subscription_id TEXT NOT NULL, token_hash TEXT NOT NULL,
    purpose TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT)`,
];

function repos(base: ContentKernel) {
  const pending = CREATE_TABLES.reduce((chain, statement) => chain.then(() => base.execute(statement)), Promise.resolve());
  pending.catch(() => {});
  const kernel = heldUntil(base, pending);
  return { kernel, campaigns: newsletterCampaignRepoFor(kernel), lists: newsletterListRepoFor(kernel), subscriptions: newsletterSubscriptionRepoFor(kernel), snapshots: newsletterAudienceSnapshotRepoFor(kernel), sends: newsletterSendRepoFor(kernel), tokens: newsletterConfirmationTokenRepoFor(kernel) };
}

function list(id: string, overrides: Partial<NewsletterListRow> = {}): NewsletterListRow {
  return { id, workspaceId: WS, name: `List ${id}`, slug: `slug-${id}`, isDefault: false, status: "active", createdAt: T0, updatedAt: T0, ...overrides };
}

function campaign(id: string, overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id,
    workspaceId: WS,
    status: "draft",
    subject: `Subject ${id}`,
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
    createdByPrincipal: "p1",
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function revision(c: CampaignRecord, actorId = "p1"): CampaignRevision {
  return { campaignId: c.id, workspaceId: c.workspaceId, seq: 0, state: c, actorId, recordedAt: T0 };
}

function subscription(id: string, overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id,
    workspaceId: WS,
    listId: "list-1",
    subscriberId: `sub-${id}`,
    status: "subscribed",
    source: "signup_form",
    consentRevisionIdAtSubscribe: "rev-1",
    subscribedAt: T0,
    unsubscribedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function snapshot(id: string, overrides: Partial<AudienceSnapshotRow> = {}): AudienceSnapshotRow {
  return { id, workspaceId: WS, campaignId: `camp-${id}`, listId: "list-1", recipientCount: 3, createdAt: T0, ...overrides };
}

function send(id: string, overrides: Partial<SendRow> = {}): SendRow {
  return {
    id,
    workspaceId: WS,
    campaignId: "camp-1",
    audienceSnapshotId: "snap-1",
    subscriberId: `sub-${id}`,
    recipientEmail: `${id}@example.com`,
    status: "pending",
    attempts: 0,
    idempotencyKey: `key-${id}`,
    providerMessageId: null,
    lastError: null,
    nextAttemptAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function token(id: string, overrides: Partial<ConfirmationTokenRecord> = {}): ConfirmationTokenRecord {
  return {
    id,
    workspaceId: WS,
    subscriptionId: "sub-1",
    tokenHash: `hash-${id}`,
    purpose: "confirm",
    createdAt: T0,
    expiresAt: "2026-09-29T00:00:00.000Z",
    consumedAt: null,
    ...overrides,
  };
}

describeEachDialect(
  "newsletter repos",
  { tables: ["newsletter_campaigns", "newsletter_campaign_revisions"], make: repos },
  (makeRepos) => {
    describe("campaign repo", () => {
      test("saveCampaignRow then findById round-trips; misses and other workspaces are null", async () => {
        const { campaigns } = makeRepos();
        const full = campaign("c1", { preheader: "pre", scheduledAt: T1, audienceSnapshotId: "snap-1" });
        await campaigns.saveCampaignRow(full);
        assert.deepEqual(await campaigns.findById({ workspaceId: WS, id: "c1" }), full);
        assert.equal(await campaigns.findById({ workspaceId: WS, id: "nope" }), null);
        assert.equal(await campaigns.findById({ workspaceId: OTHER, id: "c1" }), null);
      });

      test("re-saving updates every editorial field but keeps the stored counters and id", async () => {
        const { campaigns } = makeRepos();
        await campaigns.saveCampaignRow(campaign("c1"));
        await campaigns.incrementCounter({ workspaceId: WS, id: "c1", counter: "delivered", updatedAt: T1 });
        await campaigns.saveCampaignRow(campaign("c1", { subject: "Changed", status: "scheduled", version: 2, updatedAt: T1 }));
        const after = await campaigns.findById({ workspaceId: WS, id: "c1" });
        assert.equal(after?.subject, "Changed");
        assert.equal(after?.status, "scheduled");
        assert.equal(after?.version, 2);
        assert.equal(after?.counters.delivered, 1);
      });

      test("list is scoped, ordered by id, and keyset-paginated with a limit", async () => {
        const { campaigns } = makeRepos();
        for (const id of ["c3", "c1", "c2"]) await campaigns.saveCampaignRow(campaign(id));
        await campaigns.saveCampaignRow(campaign("x1", { workspaceId: OTHER }));
        assert.deepEqual((await campaigns.list({ workspaceId: WS })).map((c) => c.id), ["c1", "c2", "c3"]);
        assert.deepEqual((await campaigns.list({ workspaceId: WS, limit: 2 })).map((c) => c.id), ["c1", "c2"]);
        assert.deepEqual((await campaigns.list({ workspaceId: WS, afterId: "c1", limit: 1 })).map((c) => c.id), ["c2"]);
        assert.deepEqual(await campaigns.list({ workspaceId: "empty" }), []);
      });

      test("revisions append in seq order, are scoped, and carry the JSON state", async () => {
        const { campaigns } = makeRepos();
        const c = campaign("c1");
        await campaigns.appendRevision(revision(c));
        await campaigns.appendRevision(revision({ ...c, subject: "v2" }, "p2"));
        await campaigns.appendRevision(revision(campaign("c2")));
        const revs = await campaigns.listRevisions({ workspaceId: WS, campaignId: "c1" });
        assert.deepEqual(revs.map((r) => [r.actorId, r.state.subject]), [["p1", "Subject c1"], ["p2", "v2"]]);
        assert.ok(revs[0].seq < revs[1].seq);
        assert.deepEqual(await campaigns.listRevisions({ workspaceId: OTHER, campaignId: "c1" }), []);
      });

      test("incrementCounter bumps one counter, sets updatedAt, ignores misses and other workspaces", async () => {
        const { campaigns } = makeRepos();
        await campaigns.saveCampaignRow(campaign("c1"));
        await campaigns.incrementCounter({ workspaceId: WS, id: "c1", counter: "delivered", updatedAt: T1 });
        await campaigns.incrementCounter({ workspaceId: WS, id: "c1", counter: "delivered", updatedAt: T1 });
        await campaigns.incrementCounter({ workspaceId: WS, id: "c1", counter: "failed", updatedAt: T1 });
        await campaigns.incrementCounter({ workspaceId: WS, id: "missing", counter: "failed", updatedAt: T1 });
        await campaigns.incrementCounter({ workspaceId: OTHER, id: "c1", counter: "failed", updatedAt: T1 });
        const after = await campaigns.findById({ workspaceId: WS, id: "c1" });
        assert.equal(after?.counters.delivered, 2);
        assert.equal(after?.counters.failed, 1);
        assert.equal(after?.counters.recipients, 0);
        assert.equal(after?.updatedAt, T1);
        assert.equal(after?.status, "draft");
      });

      test("concurrent increments never lose a count", async () => {
        const { campaigns } = makeRepos();
        await campaigns.saveCampaignRow(campaign("c1"));
        await Promise.all(
          Array.from({ length: 8 }, () => campaigns.incrementCounter({ workspaceId: WS, id: "c1", counter: "delivered", updatedAt: T1 }))
        );
        assert.equal((await campaigns.findById({ workspaceId: WS, id: "c1" }))?.counters.delivered, 8);
      });

      test("transaction commits its writes and returns the callback's value", async () => {
        const { campaigns } = makeRepos();
        const c = campaign("c1");
        const value = await campaigns.transaction(async () => {
          await campaigns.saveCampaignRow(c);
          await campaigns.appendRevision(revision(c));
          return "done";
        });
        assert.equal(value, "done");
        assert.ok(await campaigns.findById({ workspaceId: WS, id: "c1" }));
        assert.equal((await campaigns.listRevisions({ workspaceId: WS, campaignId: "c1" })).length, 1);
      });

      test("a throw inside transaction rolls back both the row and its revision", async () => {
        const { campaigns } = makeRepos();
        const c = campaign("c1");
        await assert.rejects(
          campaigns.transaction(async () => {
            await campaigns.saveCampaignRow(c);
            await campaigns.appendRevision(revision(c));
            throw new Error("boom");
          }),
          /boom/
        );
        assert.equal(await campaigns.findById({ workspaceId: WS, id: "c1" }), null);
        assert.deepEqual(await campaigns.listRevisions({ workspaceId: WS, campaignId: "c1" }), []);
      });
    });

    describe("list repo", () => {
      test("save then findById round-trips; misses and other workspaces are null", async () => {
        const { lists } = makeRepos();
        await lists.save(list("l1", { isDefault: true }));
        assert.deepEqual(await lists.findById({ workspaceId: WS, id: "l1" }), list("l1", { isDefault: true }));
        assert.equal(await lists.findById({ workspaceId: WS, id: "nope" }), null);
        assert.equal(await lists.findById({ workspaceId: OTHER, id: "l1" }), null);
      });

      test("findDefault returns only the workspace's default list", async () => {
        const { lists } = makeRepos();
        assert.equal(await lists.findDefault({ workspaceId: WS }), null);
        await lists.save(list("l1"));
        await lists.save(list("l2", { isDefault: true }));
        await lists.save(list("lx", { workspaceId: OTHER, isDefault: true }));
        assert.equal((await lists.findDefault({ workspaceId: WS }))?.id, "l2");
        assert.equal((await lists.findDefault({ workspaceId: OTHER }))?.id, "lx");
        assert.equal(await lists.findDefault({ workspaceId: "empty" }), null);
      });

      test("list is scoped to the workspace and ordered by id", async () => {
        const { lists } = makeRepos();
        for (const id of ["l2", "l1"]) await lists.save(list(id));
        await lists.save(list("lx", { workspaceId: OTHER }));
        assert.deepEqual((await lists.list({ workspaceId: WS })).map((l) => l.id), ["l1", "l2"]);
        assert.deepEqual(await lists.list({ workspaceId: "empty" }), []);
      });

      test("re-saving updates name, slug, default flag, status and updatedAt but keeps createdAt", async () => {
        const { lists } = makeRepos();
        await lists.save(list("l1"));
        await lists.save(list("l1", { name: "Renamed", slug: "renamed", isDefault: true, status: "archived", createdAt: T1, updatedAt: T1 }));
        assert.deepEqual(
          await lists.findById({ workspaceId: WS, id: "l1" }),
          list("l1", { name: "Renamed", slug: "renamed", isDefault: true, status: "archived", createdAt: T0, updatedAt: T1 })
        );
        assert.equal((await lists.list({ workspaceId: WS })).length, 1);
      });

      test("a failed save inside a rolled-back transaction leaves no list behind", async () => {
        const { kernel, lists } = makeRepos();
        await assert.rejects(
          kernel.transaction(async () => {
            await lists.save(list("l1"));
            throw new Error("boom");
          }),
          /boom/
        );
        assert.equal(await lists.findById({ workspaceId: WS, id: "l1" }), null);
      });
    });

    describe("subscription repo", () => {
      test("save then findById round-trips (with nulls); misses and other workspaces are null", async () => {
        const { subscriptions } = makeRepos();
        const pending = subscription("s1", { status: "pending", consentRevisionIdAtSubscribe: null, subscribedAt: null });
        await subscriptions.save(pending);
        assert.deepEqual(await subscriptions.findById({ workspaceId: WS, id: "s1" }), pending);
        assert.equal(await subscriptions.findById({ workspaceId: WS, id: "nope" }), null);
        assert.equal(await subscriptions.findById({ workspaceId: OTHER, id: "s1" }), null);
      });

      test("findBySubscriberAndList hits on all three keys and misses on any other", async () => {
        const { subscriptions } = makeRepos();
        await subscriptions.save(subscription("s1", { listId: "l1", subscriberId: "who" }));
        assert.equal((await subscriptions.findBySubscriberAndList({ workspaceId: WS, listId: "l1", subscriberId: "who" }))?.id, "s1");
        assert.equal(await subscriptions.findBySubscriberAndList({ workspaceId: WS, listId: "l2", subscriberId: "who" }), null);
        assert.equal(await subscriptions.findBySubscriberAndList({ workspaceId: WS, listId: "l1", subscriberId: "else" }), null);
        assert.equal(await subscriptions.findBySubscriberAndList({ workspaceId: OTHER, listId: "l1", subscriberId: "who" }), null);
      });

      test("list is scoped to workspace and list, ordered by id, keyset-paginated with a limit", async () => {
        const { subscriptions } = makeRepos();
        for (const id of ["s3", "s1", "s2"]) await subscriptions.save(subscription(id));
        await subscriptions.save(subscription("s9", { listId: "list-2" }));
        await subscriptions.save(subscription("sx", { workspaceId: OTHER }));
        assert.deepEqual((await subscriptions.list({ workspaceId: WS, listId: "list-1" })).map((s) => s.id), ["s1", "s2", "s3"]);
        assert.deepEqual((await subscriptions.list({ workspaceId: WS, listId: "list-1", limit: 2 })).map((s) => s.id), ["s1", "s2"]);
        assert.deepEqual((await subscriptions.list({ workspaceId: WS, listId: "list-1", afterId: "s1", limit: 1 })).map((s) => s.id), ["s2"]);
        assert.deepEqual(await subscriptions.list({ workspaceId: OTHER, listId: "list-2" }), []);
      });

      test("listSubscribed returns only subscribed rows of that workspace and list", async () => {
        const { subscriptions } = makeRepos();
        await subscriptions.save(subscription("s1"));
        await subscriptions.save(subscription("s2", { status: "pending" }));
        await subscriptions.save(subscription("s3", { status: "unsubscribed", unsubscribedAt: T1 }));
        await subscriptions.save(subscription("s4", { listId: "list-2" }));
        await subscriptions.save(subscription("s5", { workspaceId: OTHER }));
        assert.deepEqual((await subscriptions.listSubscribed({ workspaceId: WS, listId: "list-1" })).map((s) => s.id), ["s1"]);
        assert.deepEqual(await subscriptions.listSubscribed({ workspaceId: "empty", listId: "list-1" }), []);
      });

      test("re-saving updates the lifecycle fields only, never the identity fields", async () => {
        const { subscriptions } = makeRepos();
        await subscriptions.save(subscription("s1", { status: "pending", subscribedAt: null }));
        await subscriptions.save(
          subscription("s1", { status: "unsubscribed", subscribedAt: T1, unsubscribedAt: T1, updatedAt: T1, consentRevisionIdAtSubscribe: "rev-2", listId: "hijack", source: "import", createdAt: T1 })
        );
        assert.deepEqual(
          await subscriptions.findById({ workspaceId: WS, id: "s1" }),
          subscription("s1", { status: "unsubscribed", subscribedAt: T1, unsubscribedAt: T1, updatedAt: T1, consentRevisionIdAtSubscribe: "rev-2" })
        );
      });

      test("remove deletes one row of its workspace and is a no-op on a miss or another workspace", async () => {
        const { subscriptions } = makeRepos();
        await subscriptions.save(subscription("s1"));
        await subscriptions.save(subscription("s2"));
        await subscriptions.remove({ workspaceId: OTHER, id: "s1" });
        await subscriptions.remove({ workspaceId: WS, id: "nope" });
        assert.ok(await subscriptions.findById({ workspaceId: WS, id: "s1" }));
        await subscriptions.remove({ workspaceId: WS, id: "s1" });
        assert.equal(await subscriptions.findById({ workspaceId: WS, id: "s1" }), null);
        assert.ok(await subscriptions.findById({ workspaceId: WS, id: "s2" }));
      });

      test("a save and a remove inside a rolled-back transaction leave the table as it was", async () => {
        const { kernel, subscriptions } = makeRepos();
        await subscriptions.save(subscription("s1"));
        await assert.rejects(
          kernel.transaction(async () => {
            await subscriptions.save(subscription("s2"));
            await subscriptions.remove({ workspaceId: WS, id: "s1" });
            throw new Error("boom");
          }),
          /boom/
        );
        assert.equal(await subscriptions.findById({ workspaceId: WS, id: "s2" }), null);
        assert.ok(await subscriptions.findById({ workspaceId: WS, id: "s1" }));
      });
    });

    describe("audience snapshot repo", () => {
      test("save then findById / findByCampaignId round-trip; misses and other workspaces are null", async () => {
        const { snapshots } = makeRepos();
        await snapshots.save(snapshot("a1"));
        assert.deepEqual(await snapshots.findById({ workspaceId: WS, id: "a1" }), snapshot("a1"));
        assert.deepEqual(await snapshots.findByCampaignId({ workspaceId: WS, campaignId: "camp-a1" }), snapshot("a1"));
        assert.equal(await snapshots.findById({ workspaceId: WS, id: "nope" }), null);
        assert.equal(await snapshots.findById({ workspaceId: OTHER, id: "a1" }), null);
        assert.equal(await snapshots.findByCampaignId({ workspaceId: WS, campaignId: "nope" }), null);
        assert.equal(await snapshots.findByCampaignId({ workspaceId: OTHER, campaignId: "camp-a1" }), null);
      });

      test("a snapshot is immutable: saving the same id again throws and keeps the original", async () => {
        const { snapshots } = makeRepos();
        await snapshots.save(snapshot("a1"));
        await assert.rejects(snapshots.save(snapshot("a1", { recipientCount: 99, listId: "other" })));
        assert.deepEqual(await snapshots.findById({ workspaceId: WS, id: "a1" }), snapshot("a1"));
      });

      test("a snapshot saved inside a rolled-back transaction is not there afterwards", async () => {
        const { kernel, snapshots } = makeRepos();
        await assert.rejects(
          kernel.transaction(async () => {
            await snapshots.save(snapshot("a1"));
            throw new Error("boom");
          }),
          /boom/
        );
        assert.equal(await snapshots.findById({ workspaceId: WS, id: "a1" }), null);
      });
    });

    describe("send repo", () => {
      test("save then findById / findByIdempotencyKey round-trip; misses and other workspaces are null", async () => {
        const { sends } = makeRepos();
        const full = send("s1", { providerMessageId: "pm-1", lastError: "e", nextAttemptAt: T1 });
        await sends.save(full);
        assert.deepEqual(await sends.findById({ workspaceId: WS, id: "s1" }), full);
        assert.deepEqual(await sends.findByIdempotencyKey({ workspaceId: WS, idempotencyKey: "key-s1" }), full);
        assert.equal(await sends.findById({ workspaceId: WS, id: "nope" }), null);
        assert.equal(await sends.findById({ workspaceId: OTHER, id: "s1" }), null);
        assert.equal(await sends.findByIdempotencyKey({ workspaceId: WS, idempotencyKey: "nope" }), null);
        assert.equal(await sends.findByIdempotencyKey({ workspaceId: OTHER, idempotencyKey: "key-s1" }), null);
      });

      test("re-saving updates delivery state only, never the identity fields", async () => {
        const { sends } = makeRepos();
        await sends.save(send("s1"));
        await sends.save(
          send("s1", { status: "delivered", attempts: 2, providerMessageId: "pm", lastError: "x", nextAttemptAt: T1, recipientEmail: "new@example.com", updatedAt: T1, campaignId: "hijack", idempotencyKey: "hijack", createdAt: T1 })
        );
        assert.deepEqual(
          await sends.findById({ workspaceId: WS, id: "s1" }),
          send("s1", { status: "delivered", attempts: 2, providerMessageId: "pm", lastError: "x", nextAttemptAt: T1, recipientEmail: "new@example.com", updatedAt: T1 })
        );
      });

      test("listByCampaign is scoped, ordered by id and keyset-paginated with a limit", async () => {
        const { sends } = makeRepos();
        for (const id of ["s3", "s1", "s2"]) await sends.save(send(id));
        await sends.save(send("s9", { campaignId: "camp-2" }));
        await sends.save(send("sx", { workspaceId: OTHER }));
        assert.deepEqual((await sends.listByCampaign({ workspaceId: WS, campaignId: "camp-1" })).map((s) => s.id), ["s1", "s2", "s3"]);
        assert.deepEqual((await sends.listByCampaign({ workspaceId: WS, campaignId: "camp-1", limit: 2 })).map((s) => s.id), ["s1", "s2"]);
        assert.deepEqual((await sends.listByCampaign({ workspaceId: WS, campaignId: "camp-1", afterId: "s1", limit: 1 })).map((s) => s.id), ["s2"]);
        assert.deepEqual((await sends.listByCampaign({ workspaceId: OTHER, campaignId: "camp-1" })).map((s) => s.id), ["sx"]);
        assert.deepEqual(await sends.listByCampaign({ workspaceId: "empty", campaignId: "camp-1" }), []);
      });

      test("listPendingByAudienceSnapshot returns only pending rows of that snapshot, up to the limit", async () => {
        const { sends } = makeRepos();
        await sends.save(send("s1"));
        await sends.save(send("s2"));
        await sends.save(send("s3"));
        await sends.save(send("s4", { status: "delivered" }));
        await sends.save(send("s5", { audienceSnapshotId: "snap-2" }));
        await sends.save(send("s6", { workspaceId: OTHER }));
        assert.deepEqual((await sends.listPendingByAudienceSnapshot({ workspaceId: WS, audienceSnapshotId: "snap-1", limit: 10 })).map((s) => s.id), ["s1", "s2", "s3"]);
        assert.deepEqual((await sends.listPendingByAudienceSnapshot({ workspaceId: WS, audienceSnapshotId: "snap-1", limit: 2 })).map((s) => s.id), ["s1", "s2"]);
        assert.deepEqual(await sends.listPendingByAudienceSnapshot({ workspaceId: OTHER, audienceSnapshotId: "snap-2", limit: 10 }), []);
      });

      test("countPendingByCampaign counts only pending rows of that campaign and workspace", async () => {
        const { sends } = makeRepos();
        await sends.save(send("s1"));
        await sends.save(send("s2"));
        await sends.save(send("s3", { status: "failed" }));
        await sends.save(send("s4", { campaignId: "camp-2" }));
        await sends.save(send("s5", { workspaceId: OTHER }));
        assert.equal(await sends.countPendingByCampaign({ workspaceId: WS, campaignId: "camp-1" }), 2);
        assert.equal(await sends.countPendingByCampaign({ workspaceId: WS, campaignId: "nope" }), 0);
        assert.equal(await sends.countPendingByCampaign({ workspaceId: OTHER, campaignId: "camp-1" }), 1);
      });

      test("saveBatch stores every row, and a failing row rolls the whole batch back", async () => {
        const { sends } = makeRepos();
        await sends.saveBatch([]);
        await sends.saveBatch([send("s1"), send("s2")]);
        assert.equal((await sends.listByCampaign({ workspaceId: WS, campaignId: "camp-1" })).length, 2);
        const bad = { ...send("s3"), recipientEmail: null } as unknown as SendRow;
        await assert.rejects(sends.saveBatch([send("s4"), bad]));
        assert.equal(await sends.findById({ workspaceId: WS, id: "s4" }), null);
      });

      test("claimForDispatch leases a due pending row once and rejects every other case", async () => {
        const { sends } = makeRepos();
        await sends.save(send("s1"));
        await sends.save(send("s2", { nextAttemptAt: "2026-09-28T09:00:00.000Z" }));
        await sends.save(send("s3", { nextAttemptAt: "2026-09-28T00:30:00.000Z" }));
        await sends.save(send("s4", { status: "delivered" }));
        const claim = (id: string, workspaceId = WS) => sends.claimForDispatch({ workspaceId, id, nowIso: T1, leaseUntilIso: "2026-09-28T02:00:00.000Z" });
        const claimed = await claim("s1");
        assert.deepEqual(claimed, send("s1", { nextAttemptAt: "2026-09-28T02:00:00.000Z", updatedAt: T1 }));
        assert.equal(await claim("s1"), null, "a live lease blocks the second claim");
        assert.equal(await claim("s2"), null, "not due yet");
        assert.ok(await claim("s3"), "an expired lease can be re-claimed");
        assert.equal(await claim("s4"), null, "not pending");
        assert.equal(await claim("nope"), null);
        assert.equal(await claim("s1", OTHER), null);
      });

      test("concurrent claims of one send: exactly one wins", async () => {
        const { sends } = makeRepos();
        await sends.save(send("s1"));
        const results = await Promise.all(
          Array.from({ length: 5 }, () => sends.claimForDispatch({ workspaceId: WS, id: "s1", nowIso: T1, leaseUntilIso: "2026-09-28T02:00:00.000Z" }))
        );
        assert.equal(results.filter((r) => r !== null).length, 1);
      });

      test("recordOutcome writes the outcome once, keeps a stored provider id when given null, and rejects a repeat", async () => {
        const { sends } = makeRepos();
        await sends.save(send("s1", { nextAttemptAt: T1 }));
        await sends.save(send("s2", { providerMessageId: "old", nextAttemptAt: T1 }));
        const outcome = { workspaceId: WS, status: "delivered" as const, lastError: null, updatedAt: T1 };
        const first = await sends.recordOutcome({ ...outcome, id: "s1", providerMessageId: "pm-1" });
        assert.deepEqual(first, send("s1", { status: "delivered", attempts: 1, providerMessageId: "pm-1", nextAttemptAt: null, updatedAt: T1 }));
        assert.equal(await sends.recordOutcome({ ...outcome, id: "s1", providerMessageId: "pm-2" }), null);
        assert.equal((await sends.findById({ workspaceId: WS, id: "s1" }))?.providerMessageId, "pm-1");
        const kept = await sends.recordOutcome({ ...outcome, id: "s2", status: "failed", lastError: "bounce", providerMessageId: null });
        assert.deepEqual([kept?.status, kept?.providerMessageId, kept?.lastError], ["failed", "old", "bounce"]);
        assert.equal(await sends.recordOutcome({ ...outcome, id: "nope", providerMessageId: null }), null);
        assert.equal(await sends.recordOutcome({ ...outcome, workspaceId: OTHER, id: "s1", providerMessageId: null }), null);
      });
    });

    describe("confirmation token repo", () => {
      test("save then findById / findByTokenHash round-trip; misses and other workspaces are null", async () => {
        const { tokens } = makeRepos();
        await tokens.save(token("t1", { consumedAt: T1 }));
        assert.deepEqual(await tokens.findById({ workspaceId: WS, id: "t1" }), token("t1", { consumedAt: T1 }));
        assert.deepEqual(await tokens.findByTokenHash({ workspaceId: WS, tokenHash: "hash-t1" }), token("t1", { consumedAt: T1 }));
        assert.equal(await tokens.findById({ workspaceId: WS, id: "nope" }), null);
        assert.equal(await tokens.findById({ workspaceId: OTHER, id: "t1" }), null);
        assert.equal(await tokens.findByTokenHash({ workspaceId: WS, tokenHash: "nope" }), null);
        assert.equal(await tokens.findByTokenHash({ workspaceId: OTHER, tokenHash: "hash-t1" }), null);
      });

      test("findUnconsumedBySubscription skips consumed tokens and other subscriptions or workspaces", async () => {
        const { tokens } = makeRepos();
        await tokens.save(token("t2"));
        await tokens.save(token("t1"));
        await tokens.save(token("t3", { consumedAt: T1 }));
        await tokens.save(token("t4", { subscriptionId: "sub-2" }));
        await tokens.save(token("t5", { workspaceId: OTHER }));
        assert.deepEqual((await tokens.findUnconsumedBySubscription({ workspaceId: WS, subscriptionId: "sub-1" })).map((t) => t.id), ["t1", "t2"]);
        assert.deepEqual(await tokens.findUnconsumedBySubscription({ workspaceId: "empty", subscriptionId: "sub-1" }), []);
      });

      test("re-saving only moves consumedAt; every other field stays as first stored", async () => {
        const { tokens } = makeRepos();
        await tokens.save(token("t1"));
        await tokens.save(token("t1", { consumedAt: T1, tokenHash: "hijack", purpose: "unsubscribe", expiresAt: T1, subscriptionId: "sub-x" }));
        assert.deepEqual(await tokens.findById({ workspaceId: WS, id: "t1" }), token("t1", { consumedAt: T1 }));
        assert.deepEqual(await tokens.findUnconsumedBySubscription({ workspaceId: WS, subscriptionId: "sub-1" }), []);
      });

      test("a consume saved inside a rolled-back transaction leaves the token unconsumed", async () => {
        const { kernel, tokens } = makeRepos();
        await tokens.save(token("t1"));
        await assert.rejects(
          kernel.transaction(async () => {
            await tokens.save(token("t1", { consumedAt: T1 }));
            await tokens.save(token("t2"));
            throw new Error("boom");
          }),
          /boom/
        );
        assert.equal((await tokens.findById({ workspaceId: WS, id: "t1" }))?.consumedAt, null);
        assert.equal(await tokens.findById({ workspaceId: WS, id: "t2" }), null);
      });
    });
  }
);
