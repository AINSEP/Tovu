/**
 * @file RED->GREEN for wm S16: Comments' tool handlers threw bare `Error`s for not-found and version
 * conflicts, and never wrapped their handlers with `withModelFacingErrors` — so every refusal
 * (including a permission denial) reached the model as the transport's redacted INTERNAL_ERROR,
 * indistinguishable from a crash. Asserts the exact `ToolInputError` text the model now sees, the
 * fact `ToolExecutor.execute` branches its BAD_REQUEST-vs-internal classification on.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";

import { buildCommentsRegistrations, type CommentsToolDeps } from "../tool-registrations.js";

function ctxWithInput(input: unknown): ToolExecutionContext {
  return { executionId: "e1", principal: { id: "p1" }, run: { id: "r1" }, input, signal: new AbortController().signal };
}

function makeDeps(options: { allow?: boolean; moderation?: { ok: false; reason: "not-found" | "conflict"; currentVersion?: number }; existing?: boolean } = {}): CommentsToolDeps {
  return {
    workspaceId: "ws-comments-errors",
    authorize: async () => (options.allow ?? true ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
    commentsReady: Promise.resolve(),
    commentsSettingsReady: Promise.resolve(),
    commentRepo: { findById: async () => (options.existing ? { id: "c1" } : null) },
    commentWriteService: { applyModeration: async () => options.moderation ?? { ok: true } },
  } as unknown as CommentsToolDeps;
}

function handlerFor(deps: CommentsToolDeps, toolId: string) {
  const registration = buildCommentsRegistrations(deps).find((r) => r.descriptor.id === toolId);
  assert.ok(registration, `expected ${toolId} to be wired`);
  return registration.handler;
}

async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}: ${(err as Error)?.message}`);
    return err.message;
  }
  assert.fail("expected the handler to reject");
}

test("a moderation action on a missing comment tells the model COMMENTS_NOT_FOUND, not a redacted internal error", async () => {
  const handler = handlerFor(makeDeps({ moderation: { ok: false, reason: "not-found" } }), "comments_approve_comment");
  assert.equal(
    await rejectionMessage(handler(ctxWithInput({ commentId: "c1", expectedVersion: 1 }))),
    "COMMENTS_NOT_FOUND: comment 'c1' was not found",
  );
});

test("a moderation version conflict tells the model the current version and how to recover", async () => {
  const handler = handlerFor(makeDeps({ moderation: { ok: false, reason: "conflict", currentVersion: 3 } }), "comments_restore_comment");
  assert.equal(
    await rejectionMessage(handler(ctxWithInput({ commentId: "c1", expectedVersion: 1 }))),
    "COMMENTS_VERSION_CONFLICT: comment 'c1' was modified concurrently (current version is 3). Re-read it with comments_list_moderation_queue and retry with the fresh version",
  );
});

test("trashing a missing comment tells the model COMMENTS_NOT_FOUND", async () => {
  const handler = handlerFor(makeDeps({ existing: false }), "comments_trash_comment");
  assert.equal(
    await rejectionMessage(handler(ctxWithInput({ commentId: "c1", expectedVersion: 1 }))),
    "COMMENTS_NOT_FOUND: comment 'c1' was not found",
  );
});

test("a trash version conflict tells the model the current version and how to recover", async () => {
  const handler = handlerFor(makeDeps({ existing: true, moderation: { ok: false, reason: "conflict", currentVersion: 5 } }), "comments_trash_comment");
  assert.equal(
    await rejectionMessage(handler(ctxWithInput({ commentId: "c1", expectedVersion: 1 }))),
    "COMMENTS_VERSION_CONFLICT: comment 'c1' was modified concurrently (current version is 5). Re-read it with comments_list_moderation_queue and retry with the fresh version",
  );
});

test("a permission denial is COMMENTS_FORBIDDEN on every handler, not a redacted internal error", async () => {
  const deps = makeDeps({ allow: false });
  const permissionByTool = {
    comments_list_moderation_queue: "comments.read",
    comments_get_settings: "comments.configure",
    comments_approve_comment: "comments.moderate",
    comments_trash_comment: "comments.delete",
  };
  for (const [toolId, permission] of Object.entries(permissionByTool)) {
    assert.equal(
      await rejectionMessage(handlerFor(deps, toolId)(ctxWithInput({ commentId: "c1", expectedVersion: 1 }))),
      `COMMENTS_FORBIDDEN: principal 'p1' is not authorized for '${permission}' (insufficient_permission)`,
      toolId,
    );
  }
});
