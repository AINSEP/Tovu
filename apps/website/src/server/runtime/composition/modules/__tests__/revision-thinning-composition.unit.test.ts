import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import type { PostRecord } from "@jini-ai/cms/posts/post";
import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";
import { createCleanupPreviewStore } from "@jini-ai/platform/retention";

import { postRepoFor } from "#src/features/post/repo";
import { freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqliteChangeSetRepo } from "#src/platform/db/sqlite/change-set-repo.sqlite";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { adminSameOriginWrites, mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { composeRevisionThinning, mountRevisionThinning, refusalForThinningError } from "../revision-thinning-routes.js";

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

test("revision thinning HTTP requires owner, same origin and a confirmed fresh token before deleting history", async (t) => {
  const { kernel, repo, ids, binding, ownerCheck } = await fixture();
  t.after(() => (kernel as unknown as { close(): Promise<void> }).close());

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.principal = { id: req.get("x-fixture-principal") ?? OWNER, workspaceId: WS, kind: "user", roles: [] };
    next();
  });
  const incidents = createRouteIncidentReporter();
  mountRevisionThinning({ app, binding, ownerCheck, adminPorts: {
    errors: incidents.errors, mount: mountAdminJsonRoute, origin: adminSameOriginWrites,
    deps: { workspaceId: WS, authorize: async () => ({ allowed: true, reason: "test" }) },
  } });
  const origin = await startTestServer(app, t);
  async function call(path: "preview" | "apply", body: unknown, { requestOrigin = origin, principal = OWNER } = {}) {
    const res = await fetch(`${origin}/api/admin/posts/revisions/thinning/${path}`, {
      method: "POST", headers: { "content-type": "application/json", origin: requestOrigin, "x-fixture-principal": principal },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as { previewToken?: string; code?: string } };
  }
  const scope = { postId: "p1", kind: "post" };
  const before = { ...scope, before: "2026-03-01" };
  assert.equal((await call("preview", before, { requestOrigin: "https://unrelated.example" })).status, 403);
  assert.deepEqual(await call("preview", before, { principal: "editor-2" }), {
    status: 403, body: { code: "OWNER_ONLY", error: "Only the site owner can thin revisions." },
  });
  const invalid = await call("preview", { ...before, before: "not-a-date" });
  assert.deepEqual([invalid.status, invalid.body.code], [400, "INVALID_INPUT"]);
  const preview = await call("preview", before);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.previewToken, "t-1");
  const apply = { ...scope, previewToken: "t-1", confirm: true };
  assert.deepEqual(await call("apply", { ...apply, confirm: "true" }), {
    status: 400, body: { code: "INVALID_INPUT", error: "Confirm the revision preview first." },
  });
  assert.deepEqual(await call("apply", { ...scope, confirm: true }), {
    status: 400, body: { code: "INVALID_INPUT", error: "Preview the revisions to delete first." },
  });
  assert.equal((await call("apply", apply, { requestOrigin: "https://unrelated.example" })).status, 403);
  assert.equal((await call("apply", apply, { principal: "editor-2" })).status, 403);

  const savedIds = async () => (await repo.listRevisions({ workspaceId: WS, postId: "p1" })).map((row) => row.id);
  assert.deepEqual(await savedIds(), ids);
  assert.deepEqual(await call("apply", apply), { status: 200, body: { deleted: ids.slice(0, 2), kept: [] } });
  assert.deepEqual(await savedIds(), ids.slice(2));
  const reused = await call("apply", apply);
  assert.deepEqual([reused.status, reused.body.code], [410, "PREVIEW_EXPIRED"]);
  assert.deepEqual(await savedIds(), ids.slice(2));
  assert.deepEqual(incidents.entries, []);
});

test("thinning engine errors map to the panel's refusals by their fixed wording; refusals and unknown failures pass through unchanged", () => {
  const refusal = (status: number, code: string, error: string) => (thrown: unknown) => {
    assert.ok(thrown instanceof RouteRefusalError, `expected a refusal, got ${String(thrown)}`);
    assert.deepEqual([thrown.response.status, thrown.response.body], [status, { code, error }]);
    return true;
  };
  const expired = "The revision preview expired. Preview again.";
  assert.throws(() => refusalForThinningError({ error: new Error(expired) }), refusal(410, "PREVIEW_EXPIRED", expired));
  assert.throws(() => refusalForThinningError({ error: new Error("Choose a post or page.") }), refusal(400, "INVALID_INPUT", "Choose a post or page."));
  assert.throws(() => refusalForThinningError({ error: new Error("Confirm the revision preview first.") }), refusal(400, "INVALID_INPUT", "Confirm the revision preview first."));
  assert.throws(() => refusalForThinningError({ error: new Error("Only the site owner can thin revisions.") }), refusal(403, "OWNER_ONLY", "Only the site owner can thin revisions."));
  const already = new RouteRefusalError({ status: 409, body: { code: "BUSY", error: "busy" } });
  assert.throws(() => refusalForThinningError({ error: already }), (thrown: unknown) => thrown === already);
  const unknown = new Error("disk I/O error");
  assert.throws(() => refusalForThinningError({ error: unknown }), (thrown: unknown) => thrown === unknown);
  // A non-Error rejection has no wording to match, so it is never mistaken for a refusal.
  assert.throws(() => refusalForThinningError({ error: "The revision preview expired" }), (thrown: unknown) => thrown === "The revision preview expired");
});
