import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createCommentHookRegistry } from "../hooks.js";
import { createCommentIngressPolicy } from "../ingress.js";
import type { EntryLookupResult } from "../ingress.js";
import { InMemoryCommentRepo } from "../repo.memory.js";
import { HeuristicSpamCheck } from "../spam.heuristic.js";
import { COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID } from "../types.js";
import type { CommentsSettings, CommentSubmission } from "../types.js";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";

/** @file SPEC-033 — `CommentIngressPolicy`, one rejection reason at a time. */

const WORKSPACE_ID = "workspace-1";
const OPEN_ENTRY: EntryLookupResult = { id: "entry-1", commentsClosed: false };

function alwaysAllowRateLimiter(): RateLimiter {
  return { check: () => ({ allowed: true }) };
}

function defaultSettings(overrides: Partial<CommentsSettings> = {}): CommentsSettings {
  return {
    enabled: true,
    requireModeration: true,
    maxDepth: 3,
    closeAfterDays: null,
    spamAutoRejectScore: 0.5,
    maxPerIpPerHour: 20,
    ...overrides,
  };
}

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

function makePolicy(overrides: {
  settings?: Partial<CommentsSettings>;
  entryLookup?: (required: { workspaceId: string; entryId: string }) => Promise<EntryLookupResult | null>;
  rateLimiter?: RateLimiter;
  repo?: InMemoryCommentRepo;
} = {}) {
  const repo = overrides.repo ?? new InMemoryCommentRepo();
  return createCommentIngressPolicy({
    repo,
    spamCheck: new HeuristicSpamCheck(),
    hooks: createCommentHookRegistry(),
    clock: { nowIso: () => "2026-07-16T00:00:00.000Z" },
    idGen: { newId: () => `comment-${Math.random().toString(36).slice(2)}` },
    getSettings: async () => defaultSettings(overrides.settings),
    entryLookup: overrides.entryLookup ?? (async () => OPEN_ENTRY),
    rateLimiter: overrides.rateLimiter ?? alwaysAllowRateLimiter(),
    outbox: new InMemoryOutbox(),
  });
}

test("a normal submission is accepted as pending (requireModeration: true)", async () => {
  const policy = makePolicy();
  const result = await policy.submit(makeSubmission());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.autoClassified, "pending");
    assert.equal(result.comment.status, "pending");
  }
});

test("requireModeration: false auto-approves a clean submission", async () => {
  const policy = makePolicy({ settings: { requireModeration: false } });
  const result = await policy.submit(makeSubmission());
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.autoClassified, "approved");
});

test("comments-disabled rejects before any repo/entry lookup", async () => {
  const policy = makePolicy({ settings: { enabled: false }, entryLookup: async () => { throw new Error("must not be called"); } });
  const result = await policy.submit(makeSubmission());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "comments-disabled");
});

test("entry-not-found", async () => {
  const policy = makePolicy({ entryLookup: async () => null });
  const result = await policy.submit(makeSubmission());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "entry-not-found");
});

test("entry-closed", async () => {
  const policy = makePolicy({ entryLookup: async () => ({ id: "entry-1", commentsClosed: true }) });
  const result = await policy.submit(makeSubmission());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "entry-closed");
});

test("parent-not-found", async () => {
  const policy = makePolicy();
  const result = await policy.submit(makeSubmission({ parentId: "does-not-exist" }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "parent-not-found");
});

test("max-depth-exceeded", async () => {
  const repo = new InMemoryCommentRepo();
  await repo.create({
    id: "deep-parent",
    workspaceId: WORKSPACE_ID,
    entryId: "entry-1",
    parentId: null,
    threadRootId: "deep-parent",
    depth: 3, // at the max already (maxDepth: 3 in defaultSettings)
    status: "approved",
    authorPrincipalId: null,
    authorName: "x",
    authorEmail: null,
    authorUrl: null,
    authorIpHash: null,
    bodyText: "x",
    spamScore: null,
    spamProvider: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    version: 0,
  });
  const policy = makePolicy({ repo });
  const result = await policy.submit(makeSubmission({ parentId: "deep-parent" }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "max-depth-exceeded");
});

test("rate-limited", async () => {
  const policy = makePolicy({ rateLimiter: { check: () => ({ allowed: false, retryAfterSeconds: 60 }) } });
  const result = await policy.submit(makeSubmission());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "rate-limited");
});

test("body-too-large", async () => {
  const policy = makePolicy();
  const result = await policy.submit(makeSubmission({ bodyRaw: "x".repeat(20_000) }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "body-too-large");
});

test("too-many-links", async () => {
  const policy = makePolicy();
  const manyLinks = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`).join(" ");
  const result = await policy.submit(makeSubmission({ bodyRaw: manyLinks }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "too-many-links");
});

test("honeypot-tripped", async () => {
  const policy = makePolicy();
  const result = await policy.submit(makeSubmission({ ingressContext: { authorIpHash: "hash-1", honeypotValue: "bot-filled-this" } }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "honeypot-tripped");
});

test("a spam-scored submission is stored silently as spam, never rejected at the boundary", async () => {
  const policy = makePolicy();
  const result = await policy.submit(makeSubmission({ bodyRaw: "buy cheap viagra and cialis now, click here now" }));
  assert.equal(result.ok, true, "spam must never be a rejection — it's an oracle for spammers");
  if (result.ok) {
    assert.equal(result.autoClassified, "spam");
    assert.equal(result.comment.status, "spam");
  }
});

test("the stored bodyText is sanitized (HTML stripped)", async () => {
  const policy = makePolicy();
  const result = await policy.submit(makeSubmission({ bodyRaw: "<script>alert(1)</script>hello <b>world</b>" }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.comment.bodyText, "alert(1)hello world");
});

// OQ-3 resolution (ADR-031 round-2 fold, SPEC-035): every ingress-created comment gets a `submit`
// moderation_log row attributed to the seeded system principal, with `toStatus` matching whatever
// the ingress auto-classified.

test("a pending submission gets a submit log entry attributed to the system principal, toStatus 'pending'", async () => {
  const repo = new InMemoryCommentRepo();
  const policy = makePolicy({ repo });
  const result = await policy.submit(makeSubmission());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const log = await repo.listModerationLog({ workspaceId: WORKSPACE_ID, commentId: result.comment.id });
  assert.equal(log.length, 1);
  assert.equal(log[0].action, "submit");
  assert.equal(log[0].fromStatus, null);
  assert.equal(log[0].toStatus, "pending");
  assert.equal(log[0].actorPrincipalId, COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID);
});

test("an auto-approved submission (requireModeration: false) gets a submit log entry, toStatus 'approved'", async () => {
  const repo = new InMemoryCommentRepo();
  const policy = makePolicy({ repo, settings: { requireModeration: false } });
  const result = await policy.submit(makeSubmission());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const log = await repo.listModerationLog({ workspaceId: WORKSPACE_ID, commentId: result.comment.id });
  assert.equal(log.length, 1);
  assert.equal(log[0].toStatus, "approved");
  assert.equal(log[0].actorPrincipalId, COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID);
});

test("a spam-classified submission gets a submit log entry, toStatus 'spam'", async () => {
  const repo = new InMemoryCommentRepo();
  const policy = makePolicy({ repo });
  const result = await policy.submit(makeSubmission({ bodyRaw: "buy cheap viagra and cialis now, click here now" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.autoClassified, "spam");

  const log = await repo.listModerationLog({ workspaceId: WORKSPACE_ID, commentId: result.comment.id });
  assert.equal(log.length, 1);
  assert.equal(log[0].toStatus, "spam");
  assert.equal(log[0].actorPrincipalId, COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID);
});

// SPEC-035 (ADR-028 Settings Layered Ledger wiring) — `getSettings` is a per-call resolver, not a
// boot-captured snapshot. Proves a settings change between two submissions is observed on the
// SECOND submission without reconstructing the policy — i.e. an operator's ledger write takes
// effect on the next request, not only after a restart.
test("getSettings is read fresh on every submit() call, not captured once at construction", async () => {
  const repo = new InMemoryCommentRepo();
  let requireModeration = true;
  const policy = createCommentIngressPolicy({
    repo,
    spamCheck: new HeuristicSpamCheck(),
    hooks: createCommentHookRegistry(),
    clock: { nowIso: () => "2026-07-16T00:00:00.000Z" },
    idGen: { newId: () => `comment-${Math.random().toString(36).slice(2)}` },
    getSettings: async () => defaultSettings({ requireModeration }),
    entryLookup: async () => OPEN_ENTRY,
    rateLimiter: alwaysAllowRateLimiter(),
    outbox: new InMemoryOutbox(),
  });

  const first = await policy.submit(makeSubmission());
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(first.autoClassified, "pending");

  requireModeration = false; // mutate the underlying "ledger" between requests
  const second = await policy.submit(makeSubmission());
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.autoClassified, "approved", "the SAME policy instance must reflect the settings change");
});

test("a reply's threadRootId is the ROOT ancestor's id, not the immediate parent's", async () => {
  const repo = new InMemoryCommentRepo();
  await repo.create({
    id: "root",
    workspaceId: WORKSPACE_ID,
    entryId: "entry-1",
    parentId: null,
    threadRootId: "root",
    depth: 0,
    status: "approved",
    authorPrincipalId: null,
    authorName: "x",
    authorEmail: null,
    authorUrl: null,
    authorIpHash: null,
    bodyText: "x",
    spamScore: null,
    spamProvider: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    version: 0,
  });
  await repo.create({
    id: "reply-1",
    workspaceId: WORKSPACE_ID,
    entryId: "entry-1",
    parentId: "root",
    threadRootId: "root",
    depth: 1,
    status: "approved",
    authorPrincipalId: null,
    authorName: "x",
    authorEmail: null,
    authorUrl: null,
    authorIpHash: null,
    bodyText: "x",
    spamScore: null,
    spamProvider: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    version: 0,
  });

  const policy = makePolicy({ repo });
  const result = await policy.submit(makeSubmission({ parentId: "reply-1" }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.comment.threadRootId, "root");
    assert.equal(result.comment.depth, 2);
  }
});
