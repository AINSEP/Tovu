import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { createCommentHookRegistry } from "../hooks.js";
import { InMemoryCommentRepo } from "../repo.memory.js";
import { createCommentWriteService } from "../write-service.js";
import type { CommentRecord } from "../types.js";
import { buildCommentsRegistrations, type CommentsToolDeps } from "../tool-registrations.js";
import { commentTrashDoubles } from "./comment-trash-doubles.js";
import { InMemoryOutbox } from "#src/contracts/core/events/index";

/** Owner policy: reversible removal runs immediately; authorization and data integrity remain enforced. */

const WORKSPACE_ID = "ws-comments-trash-confirm";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-30T00:00:00.000Z";
const TRASH_TOOL_ID = "comments_trash_comment";

function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

async function fakeRouteDeps(options: { allow?: boolean } = {}) {
  let allow = options.allow ?? true;
  const commentRepo = new InMemoryCommentRepo();
  const settingsRepo = new InMemorySettingsRepo();
  const principalRepo = new InMemoryPrincipalRepo({});
  const clock = { nowIso: () => NOW, nowMs: () => Date.parse(NOW) };
  const idGen = counterIdGen();
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const authorize = async (params: Record<string, unknown>) => {
    authorizeCalls.push(params);
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  };
  const commentWriteService = createCommentWriteService({
    repo: commentRepo,
    outbox: new InMemoryOutbox(),
    hooks: createCommentHookRegistry(),
    clock,
    idGen,
    ...commentTrashDoubles(),
  });

  const deps = {
    workspaceId: WORKSPACE_ID,
    clock,
    idGen,
    authorize,
    commentRepo,
    commentWriteService,
    commentsReady: Promise.resolve(),
    commentsSettingsReady: Promise.resolve(),
    settingsRepo,
    principalRepo,
  } as unknown as CommentsToolDeps;

  return {
    deps,
    commentRepo,
    authorizeCalls,
    setAllow: (value: boolean) => {
      allow = value;
    },
  };
}

function seedComment(overrides: Partial<CommentRecord> = {}): CommentRecord {
  return {
    id: overrides.id ?? "comment-1",
    workspaceId: WORKSPACE_ID,
    entryId: "entry-1",
    parentId: null,
    threadRootId: overrides.id ?? "comment-1",
    depth: 0,
    status: "pending",
    authorPrincipalId: null,
    authorName: "Visitor",
    authorEmail: "visitor@example.test",
    authorUrl: null,
    authorIpHash: "hash",
    bodyText: "Great post!",
    spamScore: 0.1,
    spamProvider: "heuristic",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

function buildRegistrations(deps: CommentsToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildCommentsRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

interface CallOptions {
  input?: unknown;
  emitSurface?: SurfaceEmitter;
  signal?: AbortSignal;
}

function call(registration: ToolRegistration, options: CallOptions = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: options.input ?? { commentId: "comment-1", expectedVersion: 1 },
    signal: options.signal ?? new AbortController().signal,
  };
  return registration.handler(ctx, { emitSurface: options.emitSurface });
}


test("comments.delete is checked before any dialog is raised, and a denied principal never sees one", async () => {
  const { deps, commentRepo, authorizeCalls } = await fakeRouteDeps({ allow: false });
  await commentRepo.create(seedComment());
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  await assert.rejects(() => call(trashTool), (error: unknown) => {
    // The denial reaches the model as a classified refusal (wm S16), not a redacted internal error.
    assert.ok(error instanceof ToolInputError);
    assert.match(error.message, /^COMMENTS_FORBIDDEN: /);
    return true;
  });
  assert.equal(authorizeCalls[0]?.permission, "comments.delete");
  assert.equal(surfaceExchanges.size(), 0, "a denied principal must never get a dialog opened for them");
});

test("a nonexistent comment id is refused before any dialog is raised", async () => {
  const { deps } = await fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  await assert.rejects(() => call(trashTool, { input: { commentId: "nope", expectedVersion: 1 } }), /was not found/);
  assert.equal(surfaceExchanges.size(), 0);
});

test("n06: reversible removal runs without a confirmation channel", async () => {
  const { deps, commentRepo } = await fakeRouteDeps();
  await commentRepo.save(seedComment());
  const store = createSurfaceExchangeStore();
  const result = await call(tool(buildRegistrations(deps, store), TRASH_TOOL_ID)) as {trashed: boolean; cancelled: boolean};
  assert.equal(result.trashed, true);
  assert.equal(result.cancelled, false);
  assert.equal((await commentRepo.findById({workspaceId: WORKSPACE_ID, id: "comment-1"}))?.status, "trash");
  assert.equal(store.size(), 0);
});

test("a stale expectedVersion still refuses the trash", async () => {
  const {deps, commentRepo} = await fakeRouteDeps();
  await commentRepo.save(seedComment({version: 2}));
  await assert.rejects(call(tool(buildRegistrations(deps, createSurfaceExchangeStore()), TRASH_TOOL_ID)), { message: "COMMENTS_VERSION_CONFLICT: comment 'comment-1' was modified concurrently (current version is 2). Re-read it with comments_list_moderation_queue and retry with the fresh version" });
  assert.equal((await commentRepo.findById({workspaceId: WORKSPACE_ID, id: "comment-1"}))?.status, "pending");
});
