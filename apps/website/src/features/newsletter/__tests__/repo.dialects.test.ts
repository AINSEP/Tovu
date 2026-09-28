import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { sql } from "kysely";

import { describeEachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { newsletterAudienceSnapshotRepoFor, newsletterCampaignRepoFor, newsletterListRepoFor, newsletterSubscriptionRepoFor } from "../repo.js";
import type { AudienceSnapshotRow, CampaignRecord, CampaignRevision, NewsletterListRow, SubscriptionRow } from "../types.js";

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
];

function repos(base: ContentKernel) {
  const pending = CREATE_TABLES.reduce((chain, statement) => chain.then(() => base.execute(statement)), Promise.resolve());
  pending.catch(() => {});
  const kernel = heldUntil(base, pending);
  return { kernel, campaigns: newsletterCampaignRepoFor(kernel), lists: newsletterListRepoFor(kernel), subscriptions: newsletterSubscriptionRepoFor(kernel), snapshots: newsletterAudienceSnapshotRepoFor(kernel) };
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
  }
);
