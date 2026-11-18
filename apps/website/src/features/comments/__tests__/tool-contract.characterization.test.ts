/**
 * @file Characterization of the Comments agent-tool contract, built THROUGH THE HOST CONTRIBUTOR
 * (`contributeCommentsTools().build(deps, surfaces)`), so it pins what the assistant's composition
 * root receives regardless of which package the catalog and handlers live in. It must stay green,
 * unedited, across the move of the tool catalog and handlers into `@jini-ai/cms/comments`.
 *
 * Pinned: registration ids and their order (saved in permissions and audit rows), every descriptor
 * byte-for-byte against a committed golden (including `metadata`: the host's search vocabulary and
 * approval policy), the derived-risk map, the per-tool permission refusal, one success view per
 * tool, and the three answers of the one approval-gated tool (confirmed, declined, expired).
 */
import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ToolInputError, type SurfaceEmitter, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { createCommentHookRegistry, createCommentWriteService, InMemoryCommentRepo, type CommentRecord } from "@jini-ai/cms/comments";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { ensureCommentsSettingDefinitions } from "../settings.js";
import { contributeCommentsTools, type CommentsToolDeps } from "../tool-registrations.js";
import { commentTrashDoubles } from "./comment-trash-doubles.js";

const WORKSPACE_ID = "ws-comments-contract";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-11-18T00:00:00.000Z";

const TOOL_IDS = [
  "comments_get_provider",
  "comments_set_provider",
  "comments_get_comment",
  "comments_list_moderation_queue",
  "comments_get_settings",
  "comments_update_settings",
  "comments_approve_comment",
  "comments_mark_comment_spam",
  "comments_trash_comment",
  "comments_restore_comment",
] as const;

const DERIVED_RISK: ReadonlyArray<readonly [string, string]> = [
  ["comments_get_provider", "none"],
  ["comments_set_provider", "mutates-durable-state"],
  ["comments_list_moderation_queue", "none"],
  ["comments_get_comment", "none"],
  ["comments_get_settings", "none"],
  ["comments_update_settings", "mutates-durable-state"],
  ["comments_approve_comment", "mutates-durable-state"],
  ["comments_mark_comment_spam", "mutates-durable-state"],
  ["comments_trash_comment", "mutates-durable-state"],
  ["comments_restore_comment", "mutates-durable-state"],
];

/** The permission each tool's refusal names: the gate is one evaluator whichever layer calls it. */
const REFUSAL_PERMISSION: Readonly<Record<(typeof TOOL_IDS)[number], string>> = {
  comments_get_provider: "comments.configure",
  comments_set_provider: "comments.configure",
  comments_get_comment: "comments.read",
  comments_list_moderation_queue: "comments.read",
  comments_get_settings: "comments.configure",
  comments_update_settings: "comments.configure",
  comments_approve_comment: "comments.moderate",
  comments_mark_comment_spam: "comments.moderate",
  comments_trash_comment: "comments.delete",
  comments_restore_comment: "comments.moderate",
};

const REFUSAL_INPUT: Readonly<Record<(typeof TOOL_IDS)[number], unknown>> = {
  comments_get_provider: {},
  comments_set_provider: { providerId: null, expectedRevision: 0 },
  comments_get_comment: { commentId: "comment-1" },
  comments_list_moderation_queue: {},
  comments_get_settings: {},
  comments_update_settings: { enabled: false },
  comments_approve_comment: { commentId: "comment-1", expectedVersion: 1 },
  comments_mark_comment_spam: { commentId: "comment-1", expectedVersion: 1 },
  comments_trash_comment: { commentId: "comment-1", expectedVersion: 1 },
  comments_restore_comment: { commentId: "comment-1", expectedVersion: 1 },
};

const GOLDEN = JSON.parse(readFileSync(new URL("./tool-contract.characterization.golden.json", import.meta.url), "utf8")) as Record<string, unknown>;

function seedComment(id: string): CommentRecord {
  return {
    id, workspaceId: WORKSPACE_ID, entryId: "entry-1", parentId: null, threadRootId: id, depth: 0, status: "pending",
    authorPrincipalId: null, authorName: "Visitor", authorEmail: "visitor@example.test", authorUrl: null, authorIpHash: "hash",
    bodyText: "Great post!", spamScore: 0.1, spamProvider: "heuristic", createdAt: NOW, updatedAt: NOW, version: 1,
  };
}

interface Fixture {
  deps: CommentsToolDeps;
  allow: { value: boolean };
  /** How many times the provider registry was asked to select. */
  selections: { count: number };
  commentRepo: InMemoryCommentRepo;
}

async function makeFixture(): Promise<Fixture> {
  let counter = 0;
  const allow = { value: true };
  const selections = { count: 0 };
  const clock = { nowIso: () => NOW, nowMs: () => Date.parse(NOW) };
  const idGen = { newId: () => { counter += 1; return `id-${counter}`; } };
  const settingsRepo = new InMemorySettingsRepo();
  const principalRepo = new InMemoryPrincipalRepo({}, { initialRows: [] });
  await ensureCommentsSettingDefinitions({ settingsRepo, principals: principalRepo, clock, ids: idGen }, { workspaceId: WORKSPACE_ID, systemPrincipalId: "system" });
  const commentRepo = new InMemoryCommentRepo();
  for (const id of ["comment-1", "comment-2", "comment-3", "comment-4"]) await commentRepo.create({ record: seedComment(id) }, {});
  const commentWriteService = createCommentWriteService({
    repo: commentRepo, outbox: new InMemoryOutbox(), hooks: createCommentHookRegistry({}, {}), clock, idGen, ...commentTrashDoubles(),
  });
  let revision = 0;
  let providerId: string | null = "built-in";
  const deps = {
    workspaceId: WORKSPACE_ID, clock, idGen, settingsRepo, principalRepo, commentRepo, commentWriteService,
    commentsReady: Promise.resolve(), commentsSettingsReady: Promise.resolve(),
    authorize: async () => (allow.value ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
    commentsProviders: {
      active: async () => ({ providerId, revision, adapter: providerId ? {} : undefined }),
      select: async (input: { providerId: string | null }) => { providerId = input.providerId; revision++; selections.count++; },
    },
  } as unknown as CommentsToolDeps;
  return { deps, allow, selections, commentRepo };
}

/** A scheduler that holds its timers so a test can fire them, which is how an exchange expires. */
function manualScheduler() {
  const pending: Array<() => void> = [];
  return {
    scheduler: { schedule: ({ callback }: { delayMs: number; callback: () => void }) => { pending.push(callback); return () => undefined; } },
    fireAll: () => { for (const callback of pending.splice(0)) callback(); },
  };
}

function newSurfaceStore(scheduler = manualScheduler()): { store: SurfaceExchangeStore; timers: ReturnType<typeof manualScheduler> } {
  let exchanges = 0;
  const store = createSurfaceExchangeStore({ scheduler: scheduler.scheduler, clock: createSystemClock(), idGenerator: { newId: () => { exchanges += 1; return `exchange-${exchanges}`; } }, defaultChannel: "mcp-ui" });
  return { store, timers: scheduler };
}

function buildThroughContributor(deps: CommentsToolDeps, store: SurfaceExchangeStore = newSurfaceStore().store): ToolRegistration[] {
  const surfaces = { surfaceExchanges: store, assertAccessApprover: async () => {} };
  return contributeCommentsTools().build(deps, surfaces);
}

function caller(registrations: ToolRegistration[]) {
  return (id: string, input: unknown, options: { emitSurface?: SurfaceEmitter } = {}): Promise<unknown> => {
    const found = registrations.find((registration) => registration.descriptor.id === id);
    assert.ok(found, `expected '${id}' to be wired`);
    const ctx: ToolExecutionContext = { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
    return Promise.resolve(found.handler(ctx, options));
  };
}

test("(a) registration ids, in order, are the ten comments tools", async () => {
  const ids = buildThroughContributor((await makeFixture()).deps).map((registration) => registration.descriptor.id);
  assert.deepEqual(ids, [...TOOL_IDS]);
});

test("(b) every descriptor equals the committed golden, metadata included", async () => {
  for (const registration of buildThroughContributor((await makeFixture()).deps)) {
    const descriptor = JSON.parse(JSON.stringify(registration.descriptor));
    assert.deepStrictEqual(descriptor, GOLDEN[registration.descriptor.id], registration.descriptor.id);
  }
  assert.deepEqual(Object.keys(GOLDEN).sort(), [...TOOL_IDS].sort());
});

test("(c) the contributor's derived-risk map is the ten authored entries", () => {
  assert.deepEqual([...contributeCommentsTools().risk.entries()], DERIVED_RISK.map(([id, risk]) => [id, risk]));
});

for (const toolId of TOOL_IDS) {
  test(`(d) ${toolId}: a principal without the permission is refused with the model-facing forbidden error`, async () => {
    const fixture = await makeFixture();
    const call = caller(buildThroughContributor(fixture.deps));
    fixture.allow.value = false;
    await assert.rejects(call(toolId, REFUSAL_INPUT[toolId]), (error: unknown) => {
      assert.ok(error instanceof ToolInputError, `got ${(error as Error)?.constructor?.name}`);
      assert.equal(error.message, `COMMENTS_FORBIDDEN: principal '${PRINCIPAL_ID}' is not authorized for '${REFUSAL_PERMISSION[toolId]}' (insufficient_permission)`);
      return true;
    });
    assert.equal(fixture.selections.count, 0);
  });
}

const moderationView = (id: string, status: string, version: number) => ({
  id, entryId: "entry-1", parentId: null, status, authorName: "Visitor", authorEmail: "visitor@example.test",
  bodyText: "Great post!", spamScore: 0.1, createdAt: NOW, version,
});
const DEFAULT_SETTINGS = { enabled: true, requireModeration: true, maxDepth: 5, closeAfterDays: null, spamAutoRejectScore: 0.5, maxPerIpPerHour: 20 };

test("(e) one success call per read tool returns the model-facing view", async () => {
  const call = caller(buildThroughContributor((await makeFixture()).deps));
  assert.deepEqual(await call("comments_get_provider", {}), { providerId: "built-in", revision: 0, ready: true, pendingCount: 4 });
  assert.deepEqual(await call("comments_get_comment", { commentId: "comment-1" }), { comment: moderationView("comment-1", "pending", 1) });
  const queue = (await call("comments_list_moderation_queue", {})) as { items: unknown[]; nextCursor: unknown };
  assert.equal(queue.items.length, 4);
  assert.deepEqual(queue.items[0], moderationView("comment-1", "pending", 1));
  assert.equal(queue.nextCursor, null);
  assert.deepEqual(await call("comments_get_settings", {}), { settings: DEFAULT_SETTINGS });
});

test("(e) one success call per write tool returns the model-facing acknowledgement", async () => {
  const fixture = await makeFixture();
  const call = caller(buildThroughContributor(fixture.deps));
  assert.deepEqual(await call("comments_update_settings", { maxDepth: 4 }), { settings: { ...DEFAULT_SETTINGS, maxDepth: 4 } });
  assert.deepEqual(await call("comments_approve_comment", { commentId: "comment-1", expectedVersion: 1 }), { moderated: { commentId: "comment-1", toStatus: "approved" } });
  assert.deepEqual(await call("comments_mark_comment_spam", { commentId: "comment-2", expectedVersion: 1 }), { moderated: { commentId: "comment-2", toStatus: "spam" } });
  assert.deepEqual(await call("comments_trash_comment", { commentId: "comment-3", expectedVersion: 1 }), { trashed: true, cancelled: false, moderated: { commentId: "comment-3", toStatus: "trash" } });
  assert.deepEqual(await call("comments_restore_comment", { commentId: "comment-3", expectedVersion: 2 }), { moderated: { commentId: "comment-3", toStatus: "approved" } });
  assert.equal((await fixture.commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" }))?.status, "approved");
  assert.equal((await fixture.commentRepo.findById({ workspaceId: WORKSPACE_ID, id: "comment-2" }))?.status, "spam");
});

test("(e) a moderation write with a stale version is refused with the same model-facing conflict", async () => {
  const call = caller(buildThroughContributor((await makeFixture()).deps));
  await assert.rejects(call("comments_approve_comment", { commentId: "comment-1", expectedVersion: 9 }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError);
    assert.match(error.message, /^COMMENTS_VERSION_CONFLICT: /);
    return true;
  });
  await assert.rejects(call("comments_get_comment", { commentId: "missing" }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError);
    assert.match(error.message, /^COMMENTS_NOT_FOUND: /);
    return true;
  });
});

const providerInput = { providerId: null, expectedRevision: 0 };
const confirmedEmit = (store: SurfaceExchangeStore): SurfaceEmitter => async () => {
  store.deliver({ exchangeId: "exchange-1", principalId: PRINCIPAL_ID, params: { decision: "confirm" } }, { toolId: "comments_set_provider" });
};

test("(e) comments_set_provider confirmed runs the write once", async () => {
  const fixture = await makeFixture();
  const { store } = newSurfaceStore();
  const call = caller(buildThroughContributor(fixture.deps, store));
  const result = await call("comments_set_provider", providerInput, { emitSurface: confirmedEmit(store) });
  assert.deepEqual(result, { changed: true, providerId: null });
  assert.equal(fixture.selections.count, 1);
});

test("(e) comments_set_provider declined returns the not-confirmed result and writes nothing", async () => {
  const fixture = await makeFixture();
  const { store } = newSurfaceStore();
  const call = caller(buildThroughContributor(fixture.deps, store));
  const emit: SurfaceEmitter = async () => { store.deliver({ exchangeId: "exchange-1", principalId: PRINCIPAL_ID, params: { decision: "cancel" } }, { toolId: "comments_set_provider" }); };
  assert.deepEqual(await call("comments_set_provider", providerInput, { emitSurface: emit }), { changed: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
  assert.equal(fixture.selections.count, 0);
});

test("(e) comments_set_provider expired returns the not-confirmed result and writes nothing", async () => {
  const fixture = await makeFixture();
  const { store, timers } = newSurfaceStore();
  const call = caller(buildThroughContributor(fixture.deps, store));
  const emit: SurfaceEmitter = async () => { timers.fireAll(); };
  const result = (await call("comments_set_provider", providerInput, { emitSurface: emit })) as Record<string, unknown>;
  assert.deepEqual({ ...result, note: undefined }, { changed: false, cancelled: false, reason: "expired", note: undefined });
  assert.match(String(result.note), /^The user did not answer the confirmation dialog before it expired\. Nothing was changed\./);
  assert.equal(fixture.selections.count, 0);
});

test("(f) a settings write refused by the host returns the same refusal code and message, and stores nothing", async () => {
  const fixture = await makeFixture();
  const call = caller(buildThroughContributor(fixture.deps));
  fixture.allow.value = false;
  await assert.rejects(call("comments_update_settings", { enabled: false }), { message: `COMMENTS_FORBIDDEN: principal '${PRINCIPAL_ID}' is not authorized for 'comments.configure' (insufficient_permission)` });
  fixture.allow.value = true;
  assert.deepEqual(await call("comments_get_settings", {}), { settings: DEFAULT_SETTINGS });
});

test("(f) an out-of-range settings value is refused as a model-facing input error naming the field", async () => {
  const call = caller(buildThroughContributor((await makeFixture()).deps));
  await assert.rejects(call("comments_update_settings", { maxDepth: 21 }), (error: unknown) => error instanceof ToolInputError && /maxDepth/.test(error.message));
  await assert.rejects(call("comments_update_settings", { maxPerIpPerHour: 1001 }), (error: unknown) => error instanceof ToolInputError && /maxPerIpPerHour/.test(error.message));
});

test("(g) comments_set_provider declined makes no settings call and creates no stray exchange", async () => {
  const fixture = await makeFixture();
  const { store } = newSurfaceStore();
  const call = caller(buildThroughContributor(fixture.deps, store));
  const emit: SurfaceEmitter = async () => { store.deliver({ exchangeId: "exchange-1", principalId: PRINCIPAL_ID, params: { decision: "cancel" } }, { toolId: "comments_set_provider" }); };
  await call("comments_set_provider", providerInput, { emitSurface: emit });
  assert.equal(store.size(), 0);
  assert.deepEqual(await call("comments_get_settings", {}), { settings: DEFAULT_SETTINGS });
});
