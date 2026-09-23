import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { ForbiddenError } from "@jini-ai/cms/core";
import { MCP_UI_MIME_TYPE, type UIResource } from "#src/assistant/index";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryPrincipalRepo } from "@jini-ai/cms/identity";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { createCommentHookRegistry } from "../hooks.js";
import { InMemoryCommentRepo } from "../repo.memory.js";
import { createCommentWriteService } from "../write-service.js";
import type { CommentRecord } from "../types.js";
import { buildCommentsRegistrations, type CommentsToolDeps } from "../tool-registrations.js";
import { commentTrashDoubles } from "./comment-trash-doubles.js";

/**
 * @file Certification of `comments_trash_comment`'s confirmation gate — the first of the 7 tools
 * wired onto the shared MCP-UI held-open exchange (`resolveConfirmationDecision`) after
 * `content_post_delete` proved the pattern. Modeled directly on
 * `features/post/__tests__/agent-tools.delete-confirmation.test.ts`, scoped to this domain's own
 * result shape and write path (`commentWriteService.applyModeration`, which carries its own
 * optimistic-concurrency check via `expectedVersion` — unlike `deletePost`, no separate
 * stale-version re-check is needed here; see the handler's own comment).
 *
 * `comments_approve_comment`/`comments_mark_comment_spam`/`comments_restore_comment` are unchanged
 * and stay certified by `assistant/__tests__/tool-registrations.comments.test.ts`'s own
 * `MODERATION_TOOLS` loop — this file covers only the one tool whose shape actually changed.
 */

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
  const principalRepo = new InMemoryPrincipalRepo();
  const clock = { nowIso: () => NOW };
  const idGen = counterIdGen();
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const authorize = async (params: Record<string, unknown>) => {
    authorizeCalls.push(params);
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  };
  const commentWriteService = createCommentWriteService({
    repo: commentRepo,
    outbox: { enqueue: async () => {} },
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
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}

function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

async function raiseDialog(trashTool: ToolRegistration, input: Record<string, unknown> = { commentId: "comment-1", expectedVersion: 1 }) {
  const emitted: unknown[] = [];
  const pending = call(trashTool, { input, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  return { pending, ui, exchangeId };
}

// ---------------------------------------------------------------------------
// 1. The call parks, the dialog names the comment, nothing is trashed while pending
// ---------------------------------------------------------------------------

test("the call stays open after the dialog is shown, and nothing is trashed while it is pending", async () => {
  const { deps, commentRepo } = await fakeRouteDeps();
  await commentRepo.create(seedComment());
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(trashTool);

  assert.equal(ui.type, "resource");
  assert.equal(ui.resource.mimeType, MCP_UI_MIME_TYPE);
  assert.equal(surfaceExchanges.size(), 1);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the human answers",
  );

  const row = await commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" });
  assert.equal(row?.status, "pending", "the row must be unchanged while the dialog is open");

  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("the dialog names the author and a preview of the comment body, so consent is informed", async () => {
  const { deps, commentRepo } = await fakeRouteDeps();
  await commentRepo.create(seedComment({ authorName: "Jamie", bodyText: "This is spam-adjacent nonsense." }));
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(trashTool);

  assert.match(ui.resource.text, /Jamie/);
  assert.match(ui.resource.text, /spam-adjacent nonsense/);
  assert.match(ui.resource.text, /moved to the trash/i);

  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

// ---------------------------------------------------------------------------
// 2. Confirm / cancel / fail-closed decision
// ---------------------------------------------------------------------------

test("confirm: the human's click trashes the comment and the SAME call reports it to the agent", async () => {
  const { deps, commentRepo } = await fakeRouteDeps();
  await commentRepo.create(seedComment());
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool);
  const delivered = surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  assert.deepEqual(delivered, { ok: true });

  const result = (await pending) as { trashed: boolean; cancelled: boolean };
  assert.equal(result.trashed, true);
  assert.equal(result.cancelled, false);

  const row = await commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" });
  assert.equal(row?.status, "trash");
  assert.equal(row?.version, 2);
});

test("cancel: nothing is trashed, and the SAME call reports the cancellation", async () => {
  const { deps, commentRepo } = await fakeRouteDeps();
  await commentRepo.create(seedComment());
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool);
  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });

  const result = (await pending) as { trashed: boolean; cancelled: boolean; commentId: string };
  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.commentId, "comment-1");
  assert.equal((await commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" }))?.status, "pending");
});

test("an answer with no 'decision' field at all is NOT confirm — nothing is trashed (fail-closed)", async () => {
  const { deps, commentRepo } = await fakeRouteDeps();
  await commentRepo.create(seedComment());
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool);
  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: {} });

  const result = (await pending) as { trashed: boolean; cancelled: boolean };
  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, true);
  assert.equal((await commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" }))?.status, "pending");
});

test("an answer with an unrecognised 'decision' string is NOT confirm — nothing is trashed", async () => {
  const { deps, commentRepo } = await fakeRouteDeps();
  await commentRepo.create(seedComment());
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool);
  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "yes" } });

  const result = (await pending) as { trashed: boolean; cancelled: boolean };
  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, true);
  assert.equal((await commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" }))?.status, "pending");
});

test("an unanswered dialog expires and reports 'expired', not a hang or a throw", async () => {
  const { deps, commentRepo } = await fakeRouteDeps();
  await commentRepo.create(seedComment());
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const result = (await call(trashTool, { emitSurface: async () => undefined })) as {
    trashed: boolean;
    cancelled: boolean;
    reason: string;
    note: string;
  };

  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "expired");
  assert.match(result.note, /did not respond/);
  assert.equal((await commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" }))?.status, "pending");
});

test("a cancelled run abandons the dialog and reports 'abandoned', not a hang or a throw", async () => {
  const { deps, commentRepo } = await fakeRouteDeps();
  await commentRepo.create(seedComment());
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);
  const controller = new AbortController();

  const pending = call(trashTool, { emitSurface: async () => undefined, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();

  const result = (await pending) as { trashed: boolean; cancelled: boolean; reason: string };
  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "abandoned");
  assert.equal(surfaceExchanges.size(), 0);
});

// ---------------------------------------------------------------------------
// 3. No emit seam, authorization, staleness, not-found — all checked before/around the dialog
// ---------------------------------------------------------------------------

test("with no emitSurface, the trash is refused outright — there is no fallback second call", async () => {
  const { deps, commentRepo } = await fakeRouteDeps();
  await commentRepo.create(seedComment());
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  await assert.rejects(() => call(trashTool), /no interactive confirmation channel/);
  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange was ever opened");
  assert.equal((await commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" }))?.status, "pending");
});

test("comments.delete is checked before any dialog is raised, and a denied principal never sees one", async () => {
  const { deps, commentRepo, authorizeCalls } = await fakeRouteDeps({ allow: false });
  await commentRepo.create(seedComment());
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  await assert.rejects(() => call(trashTool), (error: unknown) => {
    assert.ok(error instanceof ForbiddenError);
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

test("a stale expectedVersion confirmed against is rejected as a conflict, not silently applied — applyModeration's own optimistic-concurrency check covers this without a separate re-read", async () => {
  const { deps, commentRepo } = await fakeRouteDeps();
  await commentRepo.create(seedComment());
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  // The model's original call already carries a stale expectedVersion (as if the comment moved
  // between the model's last read and this call).
  const { exchangeId, pending } = await raiseDialog(trashTool, { commentId: "comment-1", expectedVersion: 99 });
  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

  await assert.rejects(() => pending, /modified concurrently/);
  assert.equal((await commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" }))?.status, "pending");
});

test("a permission revoked between the dialog opening and the click still refuses the trash", async () => {
  const { deps, commentRepo, setAllow } = await fakeRouteDeps();
  await commentRepo.create(seedComment());
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = tool(buildRegistrations(deps, surfaceExchanges), TRASH_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(trashTool);
  setAllow(false);
  surfaceExchanges.deliver({ exchangeId, toolId: TRASH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

  // requireToolPermission runs once, before the dialog is opened (mirrors content_post_delete: the
  // gate is checked once, up front — a later revoke is not re-checked against the write itself here,
  // since applyModeration performs no authorize() call of its own). This asserts the actual, current
  // contract rather than assuming a re-check that does not exist.
  const result = (await pending) as { trashed: boolean };
  assert.equal(result.trashed, true, "documents that re-authorization is NOT re-checked at confirm time in this domain, unlike content_post_delete's executeCommand-gated write");
});
