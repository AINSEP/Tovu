import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { newsletterCampaignRepoFor } from "../repo.js";
import type { CampaignRecord, CampaignRevision } from "../types.js";

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

function repos(kernel: ContentKernel) {
  return { kernel, campaigns: newsletterCampaignRepoFor(kernel) };
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
  }
);
