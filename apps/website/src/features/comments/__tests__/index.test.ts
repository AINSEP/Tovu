import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import type { EntryRecord, EntryStatus } from "../../entries/index.js";
import { createCommentsModule } from "@jini-ai/cms/comments";
import { createCommentsHostPorts, DEFAULT_COMMENTS_SETTINGS, ensureCommentsSettingDefinitions, setCommentsSettings } from "../index.js";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { InMemoryCommentRepo } from "@jini-ai/cms/comments";
import { HeuristicSpamCheck } from "@jini-ai/cms/comments";
import type { CommentSubmission, SpamVerdict } from "@jini-ai/cms/comments";
import type { SpamCheckPort } from "@jini-ai/cms/comments";
import { commentTrashDoubles } from "./comment-trash-doubles.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

/**
 * @file Regression test for the composition seam that used to hardcode `HeuristicSpamCheck`
 * internally — `createCommentsModule` silently ignored any other `SpamCheckPort` adapter a caller
 * might want to inject. Proves the injected adapter is the one actually consulted.
 *
 * Also covers the BUG REGRESSION documented in `Jini/packages/cms/src/comments/module.ts`'s own header: an entry that is `draft`
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

/** `entryLookup`/`isEntryOpenForComments` (`Jini/packages/cms/src/comments/module.ts`) only read `id`/`status`/`publishedAt`; the
 *  rest is filler so the fixture satisfies the real `EntryRepoPort.findById` return type. */
function makeEntry(status: EntryStatus, publishedAt: string | null): EntryRecord {
  return {
    id: "entry-1",
    workspaceId: WORKSPACE_ID,
    type: "post",
    slug: "entry-1",
    status,
    title: "Entry 1",
    bodyJson: { type: "doc", content: [] },
    fieldsJson: {},
    publishedAt,
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    version: 1,
  };
}

test("createCommentsModule uses the injected spamCheck, not a hardcoded HeuristicSpamCheck", async () => {
  let checked = false;
  const spyingSpamCheck: SpamCheckPort = {
    check: async (): Promise<SpamVerdict> => {
      checked = true;
      return { isSpam: true, score: 1, provider: "forced-by-test-spy" };
    },
  };

  const clock = createFakeClock({ startIso: "2026-08-29T00:00:00.000Z" });
  const commentsModule = createCommentsModule({
    commentRepo: new InMemoryCommentRepo(),
    // status: "published" is required — a bug fix in Jini's `comments/module.ts` (see its header) now rejects a
    // non-published entry before this spamCheck is ever consulted; this fixture's entry must be
    // published for THIS test to still be exercising spamCheck injection, not the open-gate.
    entryLookup: async () => makeEntry("published", null),
    outbox: new InMemoryOutbox(),
    clock,
    ...createCommentsHostPorts({ clock }, {}),
    idGen: { newId: () => "comment-1" },
    spamCheck: spyingSpamCheck,
    ...commentTrashDoubles(),
  }, {});

  const result = await commentsModule.ingressPolicy.submit(makeSubmission());

  assert.equal(checked, true, "the injected spamCheck was never called — createCommentsModule is not using deps.spamCheck");
  assert.equal(result.ok, true, `submit unexpectedly rejected: ${JSON.stringify(result)}`);
  if (result.ok) {
    assert.equal(result.autoClassified, "spam", "the injected spamCheck's forced spam verdict was not honored");
  }
});

test("BUG REGRESSION: a draft entry (never published) rejects a public comment as entry-closed", async () => {
  const clock = createFakeClock({ startIso: "2026-08-29T00:00:00.000Z" });
  const commentsModule = createCommentsModule({
    commentRepo: new InMemoryCommentRepo(),
    entryLookup: async () => makeEntry("draft", null),
    outbox: new InMemoryOutbox(),
    clock,
    ...createCommentsHostPorts({ clock }, {}),
    idGen: { newId: () => "comment-1" },
    spamCheck: new HeuristicSpamCheck(),
    ...commentTrashDoubles(),
  }, {});

  const result = await commentsModule.ingressPolicy.submit(makeSubmission());
  assert.equal(result.ok, false, "a draft entry must reject the submission, not accept it");
  if (!result.ok) assert.equal(result.reason, "entry-closed");
});

test("BUG REGRESSION: an unpublished (retracted) entry rejects a public comment as entry-closed, even though publishedAt is still set", async () => {
  const clock = createFakeClock({ startIso: "2026-08-29T00:00:00.000Z" });
  const commentsModule = createCommentsModule({
    commentRepo: new InMemoryCommentRepo(),
    // publishedAt intentionally stale/non-null here, mirroring unpublishEntry's own real behavior
    // (it does not clear publishedAt on retraction) — the point of this test is that `status`
    // alone, not `publishedAt`, must decide this.
    entryLookup: async () => makeEntry("unpublished", "2020-01-01T00:00:00.000Z"),
    outbox: new InMemoryOutbox(),
    clock,
    ...createCommentsHostPorts({ clock }, {}),
    idGen: { newId: () => "comment-1" },
    spamCheck: new HeuristicSpamCheck(),
    ...commentTrashDoubles(),
  }, {});

  const result = await commentsModule.ingressPolicy.submit(makeSubmission());
  assert.equal(result.ok, false, "an unpublished entry must reject the submission, not accept it");
  if (!result.ok) assert.equal(result.reason, "entry-closed");
});

test("a published entry with no closeAfterDays cap still accepts a public comment (positive control)", async () => {
  const clock = createFakeClock({ startIso: "2026-08-29T00:00:00.000Z" });
  const commentsModule = createCommentsModule({
    commentRepo: new InMemoryCommentRepo(),
    entryLookup: async () => makeEntry("published", "2026-01-01T00:00:00.000Z"),
    outbox: new InMemoryOutbox(),
    clock,
    ...createCommentsHostPorts({ clock }, {}),
    idGen: { newId: () => "comment-1" },
    spamCheck: new HeuristicSpamCheck(),
    ...commentTrashDoubles(),
  }, {});

  const result = await commentsModule.ingressPolicy.submit(makeSubmission());
  assert.equal(result.ok, true, `a published, open entry must accept the submission: ${JSON.stringify(result)}`);
});

for (const ageDays of [6, 7, 7 + 1 / 86400, 8]) {
  test(`a published entry aged ${ageDays} days respects the seven-day closing window`, async () => {
    const nowIso = "2026-08-29T00:00:00.000Z";
    const commentRepo = new InMemoryCommentRepo();
    const publishedAt = new Date(Date.parse(nowIso) - ageDays * 86400_000).toISOString();
    const clock = createFakeClock({ startIso: nowIso });
    const commentsModule = createCommentsModule({
      commentRepo,
      entryLookup: async () => makeEntry("published", publishedAt),
      outbox: new InMemoryOutbox(),
      clock,
      ...createCommentsHostPorts({ clock }, { settings: { ...DEFAULT_COMMENTS_SETTINGS, closeAfterDays: 7 } }),
      idGen: { newId: () => "comment-1" },
      spamCheck: new HeuristicSpamCheck(),
      ...commentTrashDoubles(),
    }, {});
    const result = await commentsModule.ingressPolicy.submit(makeSubmission());
    assert.equal(result.ok, ageDays <= 7, JSON.stringify(result));
    if (!result.ok) assert.equal(result.reason, "entry-closed");
    assert.equal((await commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" })) !== null, ageDays <= 7);
  });
}

test("one composed module reads ledger changes live for both ingress and the entry closing window", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowIso: () => "2026-08-29T00:00:00.000Z", nowMs: () => Date.parse("2026-08-29T00:00:00.000Z") };
  let sequence = 0;
  const ids = { newId: () => `comments-live-${++sequence}` };
  const settingsDeps = { settingsRepo, clock, ids, authorize: async () => ({ allowed: true, reason: "matched" }), principals: new InMemoryPrincipalRepo({}, { initialRows: [] }) };
  await ensureCommentsSettingDefinitions(settingsDeps, { workspaceId: WORKSPACE_ID, systemPrincipalId: "system-comments" });
  const commentsModule = createCommentsModule({
    commentRepo: new InMemoryCommentRepo(),
    entryLookup: async () => makeEntry("published", "2026-08-21T00:00:00.000Z"),
    outbox: new InMemoryOutbox(), clock, idGen: ids, spamCheck: new HeuristicSpamCheck(),
    // The ledger takes precedence over this deliberately conflicting fixed fallback.
    ...createCommentsHostPorts({ clock, settingsRepo }, { settings: { ...DEFAULT_COMMENTS_SETTINGS, enabled: false } }),
    ...commentTrashDoubles(),
  }, {});
  const patch = (values: Parameters<typeof setCommentsSettings>[1]["patch"]) => setCommentsSettings(settingsDeps, {
    workspaceId: WORKSPACE_ID, callerPrincipalId: "operator", patch: values,
  });
  assert.equal((await commentsModule.ingressPolicy.submit(makeSubmission())).ok, true);
  await patch({ closeAfterDays: 7 });
  assert.deepEqual(await commentsModule.ingressPolicy.submit(makeSubmission()), { ok: false, reason: "entry-closed" });
  await patch({ closeAfterDays: null, enabled: false });
  assert.deepEqual(await commentsModule.ingressPolicy.submit(makeSubmission()), { ok: false, reason: "comments-disabled" });
  await patch({ enabled: true, requireModeration: false });
  const accepted = await commentsModule.ingressPolicy.submit(makeSubmission());
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.comment.status, "approved");
});

test("the composed writeService forwards removal, restore, and transaction dependencies", async () => {
  const commentRepo = new InMemoryCommentRepo();
  const trash = commentTrashDoubles();
  let transactions = 0;
  let sequence = 0;
  const clock = createFakeClock({ startIso: "2026-08-29T00:00:00.000Z" });
  const commentsModule = createCommentsModule({
    commentRepo,
    entryLookup: async () => makeEntry("published", null),
    outbox: new InMemoryOutbox(),
    clock,
    ...createCommentsHostPorts({ clock }, {}),
    idGen: { newId: () => `composed-comment-${++sequence}` },
    spamCheck: new HeuristicSpamCheck(),
    ...trash,
    runInTransaction: async (fn) => { transactions += 1; return fn(); },
  }, {});
  const submitted = await commentsModule.ingressPolicy.submit(makeSubmission());
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  const id = submitted.comment.id;
  const required = { workspaceId: WORKSPACE_ID, id, actorPrincipalId: "moderator", note: null };
  assert.deepEqual(await commentsModule.writeService.applyModeration({
    ...required, expectedVersion: submitted.comment.version, action: "trash", toStatus: "trash",
  }), { ok: true });
  assert.deepEqual(trash.removed, [{ workspaceId: WORKSPACE_ID, id, display: { title: "Comment on entry-1", subtitle: "This is a normal comment." } }]);
  const trashed = await commentRepo.findById({ workspaceId: WORKSPACE_ID, id });
  assert.equal(trashed?.status, "trash");
  assert.deepEqual(await commentsModule.writeService.applyModeration({
    ...required, expectedVersion: trashed!.version, action: "approve", toStatus: "approved",
  }), { ok: true });
  assert.deepEqual(trash.forgotten, [{ workspaceId: WORKSPACE_ID, id }]);
  assert.equal((await commentRepo.findById({ workspaceId: WORKSPACE_ID, id }))?.status, "approved");
  assert.equal(transactions, 2);
});
