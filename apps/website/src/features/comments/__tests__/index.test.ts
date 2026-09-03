import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import type { EntryRecord, EntryStatus } from "../../entries/index.js";
import { createCommentsModule } from "../index.js";
import { InMemoryCommentRepo } from "../repo.memory.js";
import { HeuristicSpamCheck } from "../spam.heuristic.js";
import type { CommentSubmission, SpamVerdict } from "../types.js";
import type { SpamCheckPort } from "../ports.js";

/**
 * @file Regression test for the composition seam that used to hardcode `HeuristicSpamCheck`
 * internally — `createCommentsModule` silently ignored any other `SpamCheckPort` adapter a caller
 * might want to inject. Proves the injected adapter is the one actually consulted.
 *
 * Also covers the BUG REGRESSION documented in `index.ts`'s own header: an entry that is `draft`
 * (never published) or `unpublished` (deliberately retracted, `publishedAt` intentionally left
 * stale by `unpublishEntry`) must not accept a new public comment, even though nothing about a
 * bare `publishedAt` value alone would tell the two states apart.
 */

const WORKSPACE_ID = "workspace-1";

function makeSubmission(overrides: Partial<CommentSubmission> = {}): CommentSubmission {
  return {
    workspaceId: WORKSPACE_ID,
    entryId: "entry-1",
    parentId: null,
    authorName: "Visitor",
    authorEmail: null,
    authorUrl: null,
    bodyRaw: "This is a normal comment.",
    authorPrincipalId: null,
    ingressContext: { authorIpHash: "hash-1" },
    ...overrides,
  };
}

/** Only the fields `entryLookup`/`isEntryOpenForComments` (`index.ts`) actually read — matches
 *  this file's existing minimal-fixture convention rather than constructing a full `EntryRecord`. */
function makeEntry(status: EntryStatus, publishedAt: string | null): Pick<EntryRecord, "id" | "status" | "publishedAt"> {
  return { id: "entry-1", status, publishedAt };
}

test("createCommentsModule uses the injected spamCheck, not a hardcoded HeuristicSpamCheck", async () => {
  let checked = false;
  const spyingSpamCheck: SpamCheckPort = {
    check: async (): Promise<SpamVerdict> => {
      checked = true;
      return { isSpam: true, score: 1, reasons: ["forced-by-test-spy"] };
    },
  };

  const commentsModule = createCommentsModule({
    commentRepo: new InMemoryCommentRepo(),
    // status: "published" is required — a bug fix in `index.ts` (see its header) now rejects a
    // non-published entry before this spamCheck is ever consulted; this fixture's entry must be
    // published for THIS test to still be exercising spamCheck injection, not the open-gate.
    entryRepo: { findById: async () => ({ id: "entry-1", status: "published", publishedAt: null }) },
    outbox: new InMemoryOutbox(),
    clock: { nowIso: () => "2026-08-29T00:00:00.000Z" },
    idGen: { newId: () => "comment-1" },
    spamCheck: spyingSpamCheck,
  });

  const result = await commentsModule.ingressPolicy.submit(makeSubmission());

  assert.equal(checked, true, "the injected spamCheck was never called — createCommentsModule is not using deps.spamCheck");
  assert.equal(result.ok, true, `submit unexpectedly rejected: ${JSON.stringify(result)}`);
  if (result.ok) {
    assert.equal(result.autoClassified, "spam", "the injected spamCheck's forced spam verdict was not honored");
  }
});

test("BUG REGRESSION: a draft entry (never published) rejects a public comment as entry-closed", async () => {
  const commentsModule = createCommentsModule({
    commentRepo: new InMemoryCommentRepo(),
    entryRepo: { findById: async () => makeEntry("draft", null) },
    outbox: new InMemoryOutbox(),
    clock: { nowIso: () => "2026-08-29T00:00:00.000Z" },
    idGen: { newId: () => "comment-1" },
    spamCheck: new HeuristicSpamCheck(),
  });

  const result = await commentsModule.ingressPolicy.submit(makeSubmission());
  assert.equal(result.ok, false, "a draft entry must reject the submission, not accept it");
  if (!result.ok) assert.equal(result.reason, "entry-closed");
});

test("BUG REGRESSION: an unpublished (retracted) entry rejects a public comment as entry-closed, even though publishedAt is still set", async () => {
  const commentsModule = createCommentsModule({
    commentRepo: new InMemoryCommentRepo(),
    // publishedAt intentionally stale/non-null here, mirroring unpublishEntry's own real behavior
    // (it does not clear publishedAt on retraction) — the point of this test is that `status`
    // alone, not `publishedAt`, must decide this.
    entryRepo: { findById: async () => makeEntry("unpublished", "2020-01-01T00:00:00.000Z") },
    outbox: new InMemoryOutbox(),
    clock: { nowIso: () => "2026-08-29T00:00:00.000Z" },
    idGen: { newId: () => "comment-1" },
    spamCheck: new HeuristicSpamCheck(),
  });

  const result = await commentsModule.ingressPolicy.submit(makeSubmission());
  assert.equal(result.ok, false, "an unpublished entry must reject the submission, not accept it");
  if (!result.ok) assert.equal(result.reason, "entry-closed");
});

test("a published entry with no closeAfterDays cap still accepts a public comment (positive control)", async () => {
  const commentsModule = createCommentsModule({
    commentRepo: new InMemoryCommentRepo(),
    entryRepo: { findById: async () => makeEntry("published", "2026-01-01T00:00:00.000Z") },
    outbox: new InMemoryOutbox(),
    clock: { nowIso: () => "2026-08-29T00:00:00.000Z" },
    idGen: { newId: () => "comment-1" },
    spamCheck: new HeuristicSpamCheck(),
  });

  const result = await commentsModule.ingressPolicy.submit(makeSubmission());
  assert.equal(result.ok, true, `a published, open entry must accept the submission: ${JSON.stringify(result)}`);
});
