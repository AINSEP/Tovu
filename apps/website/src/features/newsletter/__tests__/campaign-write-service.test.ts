/**
 * @file T017 — failing-first tests for `saveCampaign`/`scheduleCampaign` (REQ-01/06/09, INV-01,
 * AC-01/08/11, EC-06) at the real DB-transaction boundary (Article V — integration coverage for a P1
 * chokepoint, not just in-memory).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { newsletterCampaignRevisions, newsletterCampaigns } from "#src/platform/db/schema.sqlite";
import { cancelCampaign, saveCampaign, scheduleCampaign, type CampaignWriteServiceDeps } from "../campaign-write-service.js";
import { NewsletterCampaignNotEditableError, NewsletterConflictError, NewsletterListNotFoundError, NewsletterValidationError } from "../errors.js";
import { InMemoryNewsletterCampaignRepo, InMemoryNewsletterListRepo } from "../repo.memory.js";
import { SqliteNewsletterCampaignRepo } from "../repo.sqlite.js";
import type { NewsletterCampaignRepoPort } from "../ports.js";
import type { CampaignRecord, CampaignRevision, NewsletterListRow } from "../types.js";

const WS = "ws-1";
let counter = 0;
const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
const ids = { newId: () => `id-${++counter}` };

const validFields = {
  subject: "Hello world",
  preheader: null as string | null,
  fromName: "Acme",
  fromEmail: "hello@acme.test",
  replyTo: "replies@acme.test",
  listId: "list-1",
};

function makeMemoryDeps(): CampaignWriteServiceDeps {
  const listRepo = new InMemoryNewsletterListRepo([
    { id: "list-1", workspaceId: WS, name: "All", slug: "all", isDefault: true, status: "active" as const, createdAt: clock.nowIso(), updatedAt: clock.nowIso() } as NewsletterListRow,
  ]);
  return { campaignRepo: new InMemoryNewsletterCampaignRepo(), listRepo, clock, ids };
}

test("saveCampaign: create + edit round-trip, revisionSeq increments", async () => {
  const deps = makeMemoryDeps();
  const created = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: validFields } });
  assert.equal(created.campaign.status, "draft");
  assert.equal(created.revisionSeq, 1);

  await deps.listRepo.save({ id: "list-2", workspaceId: WS, name: "VIP", slug: "vip", isDefault: false, status: "active", createdAt: clock.nowIso(), updatedAt: clock.nowIso() });
  const editedFields = { subject: "Updated", preheader: "New preview", fromName: "New sender", fromEmail: "sender@acme.test", replyTo: "support@acme.test", listId: "list-2" };
  assert.equal(created.campaign.fromEmail, validFields.fromEmail);
  assert.equal(created.campaign.replyTo, validFields.replyTo);
  assert.deepEqual(await deps.campaignRepo.findById({ workspaceId: WS, id: created.campaign.id }), created.campaign);

  const edited = await saveCampaign({
    deps,
    input: { workspaceId: WS, id: created.campaign.id, actorId: "actor-2", fields: editedFields },
  });
  assert.equal(edited.campaign.subject, "Updated");
  assert.equal(edited.revisionSeq, 2);
  const expected = { ...created.campaign, ...editedFields, version: 2, updatedAt: clock.nowIso() };
  assert.deepEqual(edited.campaign, expected);
  assert.deepEqual(await deps.campaignRepo.findById({ workspaceId: WS, id: created.campaign.id }), expected);
  assert.deepEqual(await deps.campaignRepo.listRevisions({ workspaceId: WS, campaignId: created.campaign.id }), [
    { workspaceId: WS, campaignId: created.campaign.id, seq: 1, state: created.campaign, actorId: "actor-1", recordedAt: clock.nowIso() },
    { workspaceId: WS, campaignId: created.campaign.id, seq: 2, state: expected, actorId: "actor-2", recordedAt: clock.nowIso() },
  ]);
});

test("saveCampaign: unknown listId is rejected (AC-11)", async () => {
  const deps = makeMemoryDeps();
  await assert.rejects(
    saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: { ...validFields, listId: "nope" } } }),
    NewsletterListNotFoundError
  );
});

test("saveCampaign: subject 998 chars accepted, 999 chars rejected (behavior.spec §4/§7)", async () => {
  const deps = makeMemoryDeps();
  const s998 = "a".repeat(998);
  const ok = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: { ...validFields, subject: s998 } } });
  assert.equal(ok.campaign.subject.length, 998);

  const s999 = "a".repeat(999);
  await assert.rejects(
    saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: { ...validFields, subject: s999 } } }),
    NewsletterValidationError
  );
});

test("saveCampaign: preheader over 300 chars rejected", async () => {
  const deps = makeMemoryDeps();
  await assert.rejects(
    saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: { ...validFields, preheader: "a".repeat(301) } } }),
    NewsletterValidationError
  );
});

test("saveCampaign: empty subject is rejected (below SUBJECT_MIN)", async () => {
  const deps = makeMemoryDeps();
  await assert.rejects(
    saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: { ...validFields, subject: "" } } }),
    (err: unknown) => {
      assert.ok(err instanceof NewsletterValidationError);
      assert.equal(err.message, "subject must be between 1 and 998 characters");
      return true;
    }
  );
});

test("saveCampaign: a non-null preheader within the 300-char limit is accepted and stored", async () => {
  const deps = makeMemoryDeps();
  const created = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: { ...validFields, preheader: "A short preview" } } });
  assert.equal(created.campaign.preheader, "A short preview");
});

test("saveCampaign: concurrent same-version writers -> second gets NEWSLETTER_CONFLICT (EC-06)", async () => {
  const deps = makeMemoryDeps();
  const created = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: validFields } });
  assert.equal(created.campaign.version, 1);

  await saveCampaign({
    deps,
    input: { workspaceId: WS, id: created.campaign.id, actorId: "actor-1", expectedVersion: 1, fields: { ...validFields, subject: "First writer" } },
  });

  await assert.rejects(
    saveCampaign({
      deps,
      input: { workspaceId: WS, id: created.campaign.id, actorId: "actor-2", expectedVersion: 1, fields: { ...validFields, subject: "Second writer" } },
    }),
    NewsletterConflictError
  );
});

test("saveCampaign: a non-draft campaign cannot be edited via UPDATE_CAMPAIGN", async () => {
  const deps = makeMemoryDeps();
  const created = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: validFields } });
  await scheduleCampaign({ deps, input: { workspaceId: WS, id: created.campaign.id, actorId: "actor-1", scheduledAt: "2026-08-01T00:00:00.000Z" } });

  await assert.rejects(
    saveCampaign({ deps, input: { workspaceId: WS, id: created.campaign.id, actorId: "actor-1", fields: { ...validFields, subject: "nope" } } }),
    NewsletterCampaignNotEditableError
  );
});

test("cancelCampaign: draft and scheduled campaigns can be canceled", async () => {
  const deps = makeMemoryDeps();
  const created = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: validFields } });
  const canceled = await cancelCampaign({ deps, input: { workspaceId: WS, id: created.campaign.id, actorId: "actor-1" } });
  assert.equal(canceled.campaign.status, "canceled");
  const second = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: validFields } });
  await scheduleCampaign({ deps, input: { workspaceId: WS, id: second.campaign.id, actorId: "actor-1", scheduledAt: "2026-08-01T00:00:00.000Z" } });
  const canceledScheduled = await cancelCampaign({ deps, input: { workspaceId: WS, id: second.campaign.id, actorId: "actor-2" } });
  assert.equal(canceledScheduled.campaign.status, "canceled");
  assert.deepEqual(await deps.campaignRepo.findById({ workspaceId: WS, id: second.campaign.id }), canceledScheduled.campaign);
  const revisions = await deps.campaignRepo.listRevisions({ workspaceId: WS, campaignId: second.campaign.id });
  assert.equal(revisions.length, 3);
  assert.deepEqual(revisions[2], { workspaceId: WS, campaignId: second.campaign.id, seq: 3, state: canceledScheduled.campaign, actorId: "actor-2", recordedAt: clock.nowIso() });
});

test("scheduleCampaign: scheduling an already-'scheduled' campaign again is a same-status no-op, rejected", async () => {
  const deps = makeMemoryDeps();
  const created = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: validFields } });
  await scheduleCampaign({ deps, input: { workspaceId: WS, id: created.campaign.id, actorId: "actor-1", scheduledAt: "2026-08-01T00:00:00.000Z" } });
  const stored = await deps.campaignRepo.findById({ workspaceId: WS, id: created.campaign.id });
  assert.equal(stored?.status, "scheduled");
  assert.equal(stored?.scheduledAt, "2026-08-01T00:00:00.000Z");
  const revisions = await deps.campaignRepo.listRevisions({ workspaceId: WS, campaignId: created.campaign.id });
  assert.equal(revisions.length, 2);
  assert.deepEqual(revisions[1], { workspaceId: WS, campaignId: created.campaign.id, seq: 2, state: stored, actorId: "actor-1", recordedAt: clock.nowIso() });
  // Now 'scheduled' -- scheduling again is not a permitted transition (schedule tier only does draft -> scheduled).
  await assert.rejects(
    scheduleCampaign({ deps, input: { workspaceId: WS, id: created.campaign.id, actorId: "actor-1", scheduledAt: "2026-09-01T00:00:00.000Z" } }),
    (err: unknown) => {
      assert.ok(err instanceof NewsletterCampaignNotEditableError);
      assert.equal(err.message, "'scheduled' -> 'scheduled' is not a transition (no-op)");
      return true;
    }
  );
});

test("cancelCampaign: a campaign already 'sending' cannot be canceled (compose tier only cancels draft/scheduled)", async () => {
  const deps = makeMemoryDeps();
  const created = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: validFields } });
  await deps.campaignRepo.saveCampaignRow({ ...created.campaign, status: "sending" });
  await assert.rejects(
    cancelCampaign({ deps, input: { workspaceId: WS, id: created.campaign.id, actorId: "actor-1" } }),
    (err: unknown) => {
      assert.ok(err instanceof NewsletterCampaignNotEditableError);
      assert.equal(err.message, "'sending' -> 'canceled' is not a permitted transition for any actor tier");
      return true;
    }
  );
});

test("scheduleCampaign: unknown listId at schedule time is rejected (AC-11)", async () => {
  const deps = makeMemoryDeps();
  const created = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: validFields } });
  const before = await deps.campaignRepo.listRevisions({ workspaceId: WS, campaignId: created.campaign.id });
  deps.listRepo = new InMemoryNewsletterListRepo();
  await assert.rejects(
    scheduleCampaign({ deps, input: { workspaceId: WS, id: created.campaign.id, actorId: "actor-1", scheduledAt: "2026-08-01T00:00:00.000Z" } }),
    NewsletterListNotFoundError
  );
  assert.deepEqual(await deps.campaignRepo.findById({ workspaceId: WS, id: created.campaign.id }), created.campaign);
  assert.deepEqual(await deps.campaignRepo.listRevisions({ workspaceId: WS, campaignId: created.campaign.id }), before);
});

/* ------------------------------------------------------------------------------------------------
 * AC-08 — real SQLite adapter, forced mid-transaction failure: neither the campaign row nor the
 * revision row may persist (INV-01, Article V integration coverage for the chokepoint).
 * ------------------------------------------------------------------------------------------------ */

/** Decorator that delegates every method to the real repo except `appendRevision`, which throws — used
 * to force a genuine mid-transaction SQL failure at the real adapter without a hand-rolled fault-injection seam. */
class ThrowingAppendRevisionRepo implements NewsletterCampaignRepoPort {
  readonly calls: string[] = [];
  constructor(private readonly real: NewsletterCampaignRepoPort) {}
  findById(required: { workspaceId: string; id: string }) {
    return this.real.findById(required);
  }
  list(required: { workspaceId: string; afterId?: string; limit?: number }) {
    return this.real.list(required);
  }
  async saveCampaignRow(campaign: CampaignRecord) {
    await this.real.saveCampaignRow(campaign);
    this.calls.push("saved");
  }
  async appendRevision(_revision: CampaignRevision): Promise<void> {
    this.calls.push("appendRevision");
    throw new Error("forced mid-transaction failure (AC-08 test)");
  }
  listRevisions(required: { workspaceId: string; campaignId: string }) {
    return this.real.listRevisions(required);
  }
  transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.real.transaction(fn);
  }
  incrementCounter(required: Parameters<NewsletterCampaignRepoPort["incrementCounter"]>[0]) {
    return this.real.incrementCounter(required);
  }
}

test("saveCampaign: AC-08 — a forced mid-tx failure at the REAL SQLite adapter leaves zero campaign rows and zero revision rows (INV-01)", async () => {
  const db = openContentDb(":memory:");
  const realCampaignRepo = new SqliteNewsletterCampaignRepo(db);
  const memoryListRepo = new InMemoryNewsletterListRepo([
    { id: "list-1", workspaceId: WS, name: "All", slug: "all", isDefault: true, status: "active" as const, createdAt: clock.nowIso(), updatedAt: clock.nowIso() },
  ]);
  const throwingRepo = new ThrowingAppendRevisionRepo(realCampaignRepo);

  const deps: CampaignWriteServiceDeps = {
    campaignRepo: throwingRepo,
    listRepo: memoryListRepo,
    clock,
    ids,
  };

  await assert.rejects(saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: validFields } }), { message: "forced mid-transaction failure (AC-08 test)" });
  assert.deepEqual(throwingRepo.calls, ["saved", "appendRevision"]);

  const campaignRows = db.select().from(newsletterCampaigns).all();
  const revisionRows = db.select().from(newsletterCampaignRevisions).all();
  assert.equal(campaignRows.length, 0, "no campaign row must persist after a rolled-back mid-tx failure");
  assert.equal(revisionRows.length, 0, "no revision row must persist after a rolled-back mid-tx failure");
});

test("saveCampaign: at the REAL SQLite adapter, a successful save writes exactly 1 campaign row + 1 revision row in the same tx", async () => {
  const db = openContentDb(":memory:");
  const memoryListRepo = new InMemoryNewsletterListRepo([
    { id: "list-1", workspaceId: WS, name: "All", slug: "all", isDefault: true, status: "active" as const, createdAt: clock.nowIso(), updatedAt: clock.nowIso() },
  ]);
  const deps: CampaignWriteServiceDeps = { campaignRepo: new SqliteNewsletterCampaignRepo(db), listRepo: memoryListRepo, clock, ids };

  await saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: validFields } });

  assert.equal(db.select().from(newsletterCampaigns).all().length, 1);
  assert.equal(db.select().from(newsletterCampaignRevisions).all().length, 1);
});


for (const scheduledAt of ["tomorrow", "not-a-date", "2030-02-30T00:00:00.000Z"]) {
  test(`scheduleCampaign: invalid timestamp ${scheduledAt} is rejected without changing campaign or revisions`, async () => {
    const deps = makeMemoryDeps();
    const { campaign } = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: validFields } });
    const before = await deps.campaignRepo.findById({ workspaceId: WS, id: campaign.id });
    const revisions = await deps.campaignRepo.listRevisions({ workspaceId: WS, campaignId: campaign.id });
    await assert.rejects(
      scheduleCampaign({ deps, input: { workspaceId: WS, id: campaign.id, actorId: "actor-1", scheduledAt } }),
      (error: unknown) => {
        assert.ok(error instanceof NewsletterValidationError);
        assert.equal(error.message, "scheduledAt must be a valid ISO date-time string");
        return true;
      },
    );
    assert.deepEqual(await deps.campaignRepo.findById({ workspaceId: WS, id: campaign.id }), before);
    assert.deepEqual(await deps.campaignRepo.listRevisions({ workspaceId: WS, campaignId: campaign.id }), revisions);
  });
}


for (const scheduledAt of ["2028-02-29T23:59:59.123Z", "2030-01-01T03:04:05+02:30"]) {
  test(`scheduleCampaign: valid leap-day or offset timestamp ${scheduledAt} remains verbatim`, async () => {
    const deps = makeMemoryDeps();
    const { campaign } = await saveCampaign({ deps, input: { workspaceId: WS, actorId: "actor-1", fields: validFields } });
    await scheduleCampaign({ deps, input: { workspaceId: WS, id: campaign.id, actorId: "actor-1", scheduledAt } });
    const stored = await deps.campaignRepo.findById({ workspaceId: WS, id: campaign.id });
    assert.equal(stored?.status, "scheduled");
    assert.equal(stored?.scheduledAt, scheduledAt);
  });
}
