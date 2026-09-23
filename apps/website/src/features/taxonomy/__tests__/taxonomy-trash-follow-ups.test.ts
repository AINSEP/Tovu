import assert from "node:assert/strict";
import test from "node:test";

import { createTaxonomyPurgeFollowUp, createTermPurgeFollowUp } from "../taxonomy-trash-follow-ups.js";
import type { PurgeTrashLookupPort, TaxonomyEventOutboxPort, TaxonomyRevisionWritePort } from "../taxonomy-trash-follow-ups.js";

/**
 * @file Pure unit tests for the purge-only follow-ups (T6 item 5) — every dependency is a fake,
 * same style as `trash-term.test.ts`. Proves the revision + event shapes match `deleteTerm`/
 * `deleteTaxonomy` (`write-service.ts`), that the actor comes from the Trash row's own
 * `actorPrincipalId` (nothing else carries one down to a purge), and that `afterPurge` no-ops when
 * `beforePurge` found nothing (the defensive branch).
 */

const clock = { nowIso: () => "2026-09-21T12:00:00.000Z" };

function recordingRevisions(): TaxonomyRevisionWritePort & { rows: unknown[] } {
  const rows: unknown[] = [];
  return { rows, insert: async (row) => void rows.push(row) };
}

function recordingOutbox(): TaxonomyEventOutboxPort & { events: Record<string, unknown>[] } {
  const events: Record<string, unknown>[] = [];
  return { events, enqueue: async (event) => void events.push(event) };
}

function trashLookup(row: { actorPrincipalId: string } | null): PurgeTrashLookupPort {
  return { findByEntity: async () => row };
}

test("term purge follow-up: beforePurge reads the term (trash-blind) and the Trash row's actor, afterPurge writes the revision + event", async () => {
  const revisions = recordingRevisions();
  const outbox = recordingOutbox();
  const hooks = createTermPurgeFollowUp({
    termRepo: { findForPurgeAudit: async () => ({ id: "term-1", name: "Red", taxonomyId: "tax-1" }) },
    trash: trashLookup({ actorPrincipalId: "user-1" }),
    revisions,
    outbox,
    clock,
  });

  const priorState = await hooks.beforePurge({ workspaceId: "ws-1", entityId: "term-1" });
  await hooks.afterPurge({ workspaceId: "ws-1", entityId: "term-1", priorState });

  assert.deepEqual(revisions.rows, [
    { taxonomyId: "tax-1", op: "delete", previousState: { termId: "term-1", name: "Red" }, actorId: "user-1", recordedAt: "2026-09-21T12:00:00.000Z" },
  ]);
  assert.deepEqual(outbox.events, [
    { name: "taxonomy.term_deleted", termId: "term-1", taxonomyId: "tax-1", actorId: "user-1", occurredAt: "2026-09-21T12:00:00.000Z" },
  ]);
});

test("term purge follow-up: no Trash row found falls back to an 'unknown' actor rather than throwing", async () => {
  const revisions = recordingRevisions();
  const outbox = recordingOutbox();
  const hooks = createTermPurgeFollowUp({
    termRepo: { findForPurgeAudit: async () => ({ id: "term-1", name: "Red", taxonomyId: "tax-1" }) },
    trash: trashLookup(null),
    revisions,
    outbox,
    clock,
  });

  const priorState = await hooks.beforePurge({ workspaceId: "ws-1", entityId: "term-1" });
  await hooks.afterPurge({ workspaceId: "ws-1", entityId: "term-1", priorState });

  assert.equal((revisions.rows[0] as { actorId: string }).actorId, "unknown");
  assert.equal((outbox.events[0] as { actorId: string }).actorId, "unknown");
});

test("term purge follow-up: afterPurge no-ops when beforePurge found nothing (defensive — never reached through withFollowUps)", async () => {
  const revisions = recordingRevisions();
  const outbox = recordingOutbox();
  const hooks = createTermPurgeFollowUp({
    termRepo: { findForPurgeAudit: async () => null },
    trash: trashLookup({ actorPrincipalId: "user-1" }),
    revisions,
    outbox,
    clock,
  });

  const priorState = await hooks.beforePurge({ workspaceId: "ws-1", entityId: "does-not-exist" });
  assert.equal(priorState, null);
  await hooks.afterPurge({ workspaceId: "ws-1", entityId: "does-not-exist", priorState });

  assert.deepEqual(revisions.rows, []);
  assert.deepEqual(outbox.events, []);
});

test("taxonomy purge follow-up: beforePurge reads every member term id regardless of status, afterPurge writes the revision + event", async () => {
  const revisions = recordingRevisions();
  const outbox = recordingOutbox();
  const hooks = createTaxonomyPurgeFollowUp({
    termRepo: { listIdsForPurgeAudit: async () => ["term-1", "term-2"] },
    trash: trashLookup({ actorPrincipalId: "user-1" }),
    revisions,
    outbox,
    clock,
  });

  const priorState = await hooks.beforePurge({ workspaceId: "ws-1", entityId: "tax-1" });
  await hooks.afterPurge({ workspaceId: "ws-1", entityId: "tax-1", priorState });

  assert.deepEqual(revisions.rows, [
    { taxonomyId: "tax-1", op: "delete", previousState: { deletedTermIds: ["term-1", "term-2"] }, actorId: "user-1", recordedAt: "2026-09-21T12:00:00.000Z" },
  ]);
  assert.deepEqual(outbox.events, [
    { name: "taxonomy.deleted", taxonomyId: "tax-1", deletedTermIds: ["term-1", "term-2"], actorId: "user-1", occurredAt: "2026-09-21T12:00:00.000Z" },
  ]);
});

test("taxonomy purge follow-up: an empty (member-less) taxonomy still writes a revision + event with an empty deletedTermIds", async () => {
  const revisions = recordingRevisions();
  const outbox = recordingOutbox();
  const hooks = createTaxonomyPurgeFollowUp({
    termRepo: { listIdsForPurgeAudit: async () => [] },
    trash: trashLookup({ actorPrincipalId: "user-1" }),
    revisions,
    outbox,
    clock,
  });

  const priorState = await hooks.beforePurge({ workspaceId: "ws-1", entityId: "tax-1" });
  await hooks.afterPurge({ workspaceId: "ws-1", entityId: "tax-1", priorState });

  assert.deepEqual((revisions.rows[0] as { previousState: unknown }).previousState, { deletedTermIds: [] });
  assert.deepEqual((outbox.events[0] as { deletedTermIds: unknown }).deletedTermIds, []);
});
