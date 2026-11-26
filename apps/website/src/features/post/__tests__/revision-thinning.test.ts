import { schemaErasedKernel } from "#src/platform/db/content-kernel";
import { postRevisionLockKey } from "@jini-ai/core/contracts/site/post-revision-lock";
import { approvalToolHandler } from "#src/contracts/core/human-confirm";
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import type { SurfaceEmission, ToolExecutionContext } from "@jini-ai/core";
import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import type { PostRecord, PostRevisionRecord } from "@jini-ai/cms/posts/post";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock } from "@jini-ai/platform/system";
import { createCleanupPreviewStore } from "@jini-ai/platform/retention";

import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { postRepoFor } from "../repo.js";
import { type RevisionRefProbe } from "@jini-ai/cms/posts/sql/revision-thinning";
import { bindRevisionThinning, revisionThinningApprovalHandler, thinningCard } from "@jini-ai/cms/posts/sql/revision-thinning";

/**
 * @file The host revision-thinning adapter over a real migrated SQLite content kernel: date-only
 * preview of one post, apply under the post's revision fence, and the four protections rechecked
 * against the confirmed ids at apply time. Disabled in composition: nothing here is scheduled.
 */

const WS = "ws-thin";
const OWNER = "operator-9";
const NOW = Date.parse("2026-11-25T12:00:00.000Z");
const DATES = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"];

function state(seq: number): PostRecord {
  return {
    id: "p1", workspaceId: WS, title: `v${seq}`, slug: "p1", bodyJson: { type: "doc", content: [] }, bodyFormat: "doc",
    bodyHtml: null, status: "draft", kind: "post", updatedAt: `${DATES[seq - 1] ?? DATES[4]}T00:00:00.000Z`, version: seq,
  };
}

async function fixture({ published = new Set<string>(), restore = new Set<string>(), undo = new Set<string>() } = {}) {
  const kernel = freshSqliteContentKernel();
  const repo = postRepoFor({ kernel, mediaAccessEvidence: createMediaAccessEvidence() }, {});
  const ids: string[] = [];
  for (let seq = 1; seq <= DATES.length; seq++) {
    const s = state(seq);
    ids.push((await repo.appendRevision({ postId: "p1", workspaceId: WS, seq, op: "update", stateJson: s, actorId: "a", recordedAt: s.updatedAt })).id);
  }
  const probe = (set: Set<string>): RevisionRefProbe => async ({ revision }) => set.has(revision.id);
  let i = 0;
  const previewStore = createCleanupPreviewStore({ randomToken: () => `token-${++i}`, mono: () => 0 });
  const binding = bindRevisionThinning({
    kernel: schemaErasedKernel({ store: kernel }), postRevisionLockKey, publishedRefs: probe(published), restoreRefs: probe(restore), undoRefs: probe(undo), previewStore, clock: () => NOW,
    authorize: async ({ principal }) => { if (principal !== OWNER) throw new Error("Only the site owner can thin revisions."); },
  }, {});
  const history = () => repo.listRevisions({ workspaceId: WS, postId: "p1" });
  return { kernel, repo, ids, binding, history, sets: { published, restore, undo } };
}

const SCOPE = { workspaceId: WS, postId: "p1", kind: "post" } as const;

async function thin(f: Awaited<ReturnType<typeof fixture>>, before = "2026-11-01") {
  const preview = await f.binding.preview({ principal: OWNER, scope: SCOPE, before }, {});
  return f.binding.apply({ principal: OWNER, scope: SCOPE, previewToken: preview.previewToken, confirm: true }, {});
}

test("published / restore / undo targets kept", async () => {
  for (const [ref, reason] of [["published", "isPublished"], ["restore", "isRestoreTarget"], ["undo", "isUndoReferenced"]] as const) {
    const f = await fixture();
    f.sets[ref].add(f.ids[1]!);
    const result = await thin(f);
    assert.deepEqual(result.deleted, [f.ids[0]], ref);
    assert.deepEqual(result.kept, [{ id: f.ids[1], reason }], ref);
  }
  // A `restored_from` target: the actual column on a later "restore" row keeps the row it names.
  const f = await fixture();
  const restored = state(6);
  await f.repo.appendRevision({ postId: "p1", workspaceId: WS, seq: 6, op: "restore", stateJson: restored, actorId: "a", recordedAt: restored.updatedAt, restoredFrom: f.ids[1]! });
  const result = await thin(f);
  assert.deepEqual(result.deleted, [f.ids[0]]);
  assert.deepEqual(result.kept, [{ id: f.ids[1], reason: "isRestoredFrom" }]);
});

test("newest kept", async () => {
  const f = await fixture();
  const result = await thin(f);
  assert.deepEqual(result.deleted, f.ids.slice(0, 4));
  assert.deepEqual(result.kept, [{ id: f.ids[4], reason: "newest" }]);
  assert.deepEqual((await f.history()).map((row) => row.id), [f.ids[4]]);
});

test("requires explicit scope", async () => {
  const f = await fixture();
  for (const scope of [{ workspaceId: WS, kind: "post" }, { workspaceId: WS, postId: "p1" }, { postId: "p1", kind: "post" }, { workspaceId: WS, postId: "p1", kind: "page" }]) {
    await assert.rejects(f.binding.preview({ principal: OWNER, scope: scope as never, before: "2026-11-01" }, {}), /Choose one workspace and one post or page/);
  }
  // Date-only: a timestamp, a non-date and a future date are refused, never widened or guessed.
  for (const before of ["2026-11-01T00:00:00Z", "last week", "2026-12-01"]) {
    await assert.rejects(f.binding.preview({ principal: OWNER, scope: SCOPE, before }, {}), /Choose a past date/);
  }
  await assert.rejects(f.binding.preview({ principal: "someone-else", scope: SCOPE, before: "2026-11-01" }, {}), /Only the site owner/);
  const preview = await f.binding.preview({ principal: OWNER, scope: SCOPE, before: "2026-11-01" }, {});
  await assert.rejects(f.binding.apply({ principal: OWNER, scope: { ...SCOPE, postId: "p2" }, previewToken: preview.previewToken, confirm: true }, {}), /Choose one workspace and one post or page/);
  assert.equal((await f.history()).length, 5);
});

test("undo reference added after preview is kept", async () => {
  const f = await fixture();
  const preview = await f.binding.preview({ principal: OWNER, scope: SCOPE, before: "2026-11-01" }, {});
  f.sets.undo.add(f.ids[2]!);
  const result = await f.binding.apply({ principal: OWNER, scope: SCOPE, previewToken: preview.previewToken, confirm: true }, {});
  assert.deepEqual(result.deleted, f.ids.slice(0, 2));
  assert.deepEqual(result.kept, [{ id: f.ids[2], reason: "isUndoReferenced" }]);
});

test("history reads the same after thinning", async () => {
  const f = await fixture({ published: new Set<string>() });
  const before: PostRevisionRecord[] = await f.history();
  const preview = await f.binding.preview({ principal: OWNER, scope: SCOPE, before: "2026-11-01" }, {});
  assert.deepEqual(await f.history(), before, "a preview changes nothing");
  f.sets.published.add(f.ids[3]!);
  const result = await f.binding.apply({ principal: OWNER, scope: SCOPE, previewToken: preview.previewToken, confirm: true }, {});
  const gone = new Set(result.deleted);
  // Every surviving row reads byte-for-byte as before: same id, seq, restored_from and state. No
  // survivor was rewritten to point past the removed rows.
  assert.deepEqual(await f.history(), before.filter((row) => !gone.has(row.id)));
  assert.deepEqual(result.deleted, f.ids.slice(0, 3));
});

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
/** Waits (bounded) until the card has been emitted: `prepare` reads the database first. */
async function cardRaised(emitted: readonly SurfaceEmission[]): Promise<void> {
  for (let i = 0; i < 200 && emitted.length === 0; i++) await turn();
}

function surfaces(t: TestContext) {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => "confirmation-7" }, defaultChannel: "mcp-ui" }, { idleTtlMs: 60_000, maxLifetimeMs: 120_000 });
  const controller = new AbortController();
  t.after(() => controller.abort());
  const ctx: ToolExecutionContext = { executionId: "execution-7", principal: { id: OWNER }, run: { id: "run-7" }, input: { postId: "p1", kind: "post", before: "2026-11-01" }, signal: controller.signal };
  const emitted: SurfaceEmission[] = [];
  const answer = (decision: "confirm" | "cancel") => store.deliver({ exchangeId: "confirmation-7", principalId: OWNER, params: { decision } }, { toolId: "post_thin_revisions" });
  return { store, ctx, emitted, answer, emitSurface: async (surface: SurfaceEmission) => { emitted.push(surface); } };
}

test("approval card raised before any revision delete; decline deletes nothing", async (t) => {
  const f = await fixture();
  const h = surfaces(t);
  const handler = revisionThinningApprovalHandler({ approvalToolHandler, thinningCard, binding: f.binding, surfaces: { surfaceExchanges: h.store }, workspaceId: WS }, {});
  const pending = handler(h.ctx, { emitSurface: h.emitSurface });
  await cardRaised(h.emitted);
  assert.equal(h.emitted.length, 1, "the owner card is raised first");
  assert.equal((await f.history()).length, 5, "nothing is deleted while the card is open");
  assert.deepEqual(h.answer("cancel"), { ok: true });
  assert.equal((await pending as { thinned: boolean }).thinned, false);
  assert.equal((await f.history()).length, 5);

  const confirmed = surfaces(t);
  const approve = revisionThinningApprovalHandler({ approvalToolHandler, thinningCard, binding: f.binding, surfaces: { surfaceExchanges: confirmed.store }, workspaceId: WS }, {});
  const approved = approve(confirmed.ctx, { emitSurface: confirmed.emitSurface });
  await cardRaised(confirmed.emitted);
  assert.deepEqual(confirmed.answer("confirm"), { ok: true });
  assert.deepEqual((await approved as { deleted: string[] }).deleted, f.ids.slice(0, 4));
});
