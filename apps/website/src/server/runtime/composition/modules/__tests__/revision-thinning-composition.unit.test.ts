import assert from "node:assert/strict";
import test from "node:test";

import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import type { PostRecord } from "@jini-ai/cms/posts/post";
import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";
import { createCleanupPreviewStore } from "@jini-ai/platform/retention";

import { postRepoFor } from "#src/features/post/repo";
import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqliteChangeSetRepo } from "#src/platform/db/sqlite/change-set-repo.sqlite";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { composeRevisionThinning } from "../revision-thinning-routes.js";

/**
 * @file The (uncalled, DISABLED until STOP 6) composition helper for revision thinning: the binding
 * runs on the production reference probes over a real migrated SQLite kernel, and both the binding
 * and the route owner check accept only the installation owner's own session.
 */

const WS = "ws-compose";
const OWNER = "owner-1";
const SCOPE = { workspaceId: WS, postId: "p1", kind: "post" } as const;

function post(version: number, extra: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "p1", workspaceId: WS, title: `v${version}`, slug: "p1", bodyJson: { type: "doc", content: [] }, bodyFormat: "doc",
    bodyHtml: null, status: "draft", kind: "post", updatedAt: `2026-0${version}-01T00:00:00.000Z`, version, ...extra,
  };
}

async function fixture() {
  const kernel = freshSqliteContentKernel();
  const repo = postRepoFor({ kernel, mediaAccessEvidence: createMediaAccessEvidence() }, {});
  const ids: string[] = [];
  for (let seq = 1; seq <= 6; seq++) {
    const state = post(seq);
    ids.push((await repo.appendRevision({ postId: "p1", workspaceId: WS, seq, op: "update", stateJson: state, actorId: "a", recordedAt: state.updatedAt })).id);
  }
  let i = 0;
  const composed = composeRevisionThinning({
    kernel, ownerPrincipalId: async () => OWNER, clock: () => Date.parse("2026-11-25T00:00:00.000Z"),
    previewStore: createCleanupPreviewStore({ randomToken: () => `t-${++i}`, mono: () => 0 }),
  }, {});
  return { kernel, repo, ids, ...composed };
}

test("composed binding keeps an undo-referenced revision through the real probes", async () => {
  const f = await fixture();
  await new SqliteChangeSetRepo({ store: f.kernel }).insert({
    record: { id: "cs-1", workspaceId: WS, actorId: "a", actor: { id: "a", kind: "user" }, status: "applied", summary: "edit", createdAt: "2026-06-01T00:00:00.000Z" },
    items: [{ id: "csi-1", changeSetId: "cs-1", entityType: "post", entityId: "p1", operation: "update", position: 0, beforeRevisionId: f.ids[1] }],
  });
  const preview = await f.binding.preview({ principal: OWNER, scope: SCOPE, before: "2026-11-01" }, {});
  const result = await f.binding.apply({ principal: OWNER, scope: SCOPE, previewToken: preview.previewToken, confirm: true }, {});
  assert.deepEqual(result.deleted, [f.ids[0]]);
  assert.deepEqual(result.kept, [{ id: f.ids[1], reason: "isUndoReferenced" }]);
  assert.deepEqual((await f.repo.listRevisions({ workspaceId: WS, postId: "p1" })).map((row) => row.id), f.ids.slice(1));
});

test("only the installation owner's own session may thin", async () => {
  const f = await fixture();
  await assert.rejects(f.binding.preview({ principal: "builtin-admin", scope: SCOPE, before: "2026-11-01" }, {}), /Only the site owner/);
  await assert.rejects(f.binding.preview({ principal: "", scope: SCOPE, before: "2026-11-01" }, {}), /Only the site owner/);
  for (const context of [undefined, { id: "builtin-admin" }, { id: "" }] as (OperatorPrincipalRecord | undefined)[]) {
    await assert.rejects(f.ownerCheck({ context }), (error: unknown) => error instanceof RouteRefusalError && error.response.status === 403 && /Only the site owner/.test(JSON.stringify(error.response.body)));
  }
  assert.deepEqual(await f.ownerCheck({ context: { id: OWNER } as OperatorPrincipalRecord }), { principal: OWNER });
});
