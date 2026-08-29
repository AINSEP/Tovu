import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createCommentsModule } from "../index.js";
import { InMemoryCommentRepo } from "../repo.memory.js";
import type { CommentSubmission, SpamVerdict } from "../types.js";
import type { SpamCheckPort } from "../ports.js";

/**
 * @file Regression test for the composition seam that used to hardcode `HeuristicSpamCheck`
 * internally — `createCommentsModule` silently ignored any other `SpamCheckPort` adapter a caller
 * might want to inject. Proves the injected adapter is the one actually consulted.
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
    entryRepo: { findById: async () => ({ id: "entry-1", publishedAt: null }) },
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
