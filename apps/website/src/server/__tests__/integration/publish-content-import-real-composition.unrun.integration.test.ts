// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap #5 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — the publish-content
 * import ceremony (`.../publish-content/import/{plan,confirm,execute}`) between two REAL site
 * compositions: a post is written on site A, exported, staged on site B, and imported there.
 *
 * `publish-content-import-routes.test.ts` self-imports on ONE hermetic `createRouteDeps()` root and
 * replaces `publishContentApplyPort` with a fake, so the real apply loop, the persisted bundle row,
 * the durable confirmation token and the real restore-point capture on the destination are proven
 * nowhere. The source is always SQLite (the export is dialect-free JSON); the destination is each
 * dialect. On a PGlite destination the restore-point mechanism is `unavailable`
 * (`PostgresDbOpsAdapter`), so execute must refuse with no override and write nothing.
 */

interface PlanBody {
  planId: string;
  planHash: string;
  details: {
    refused: boolean;
    rows: Array<{ entityType: string; entityId: string; outcome: string; writes: boolean }>;
  };
}

async function exportBundleWithPost(source: BootedSite, title: string): Promise<{ bundle: unknown; postId: string }> {
  const { post } = await expectJson<{ post: { id: string } }>(await send(source, "POST", `${source.ws}/posts`, { title, status: "draft" }), 201);
  const bundle = await expectJson<unknown>(await send(source, "GET", `${source.ws}/publish-content/export`), 200);
  return { bundle, postId: post.id };
}

async function stage(destination: BootedSite, bundle: unknown): Promise<string> {
  return (await expectJson<{ bundleId: string }>(await send(destination, "POST", `${destination.ws}/publish-content/bundles`, bundle), 201)).bundleId;
}

async function planAndConfirm(destination: BootedSite, bundleId: string): Promise<{ plan: PlanBody; confirmationToken: string }> {
  const plan = await expectJson<PlanBody>(await send(destination, "POST", `${destination.ws}/publish-content/import/plan`, { bundleId }), 200);
  const { confirmationToken } = await expectJson<{ confirmationToken: string }>(
    await send(destination, "POST", `${destination.ws}/publish-content/import/confirm`, { planId: plan.planId, planHash: plan.planHash }),
    200
  );
  return { plan, confirmationToken };
}

async function destinationPostIds(destination: BootedSite): Promise<string[]> {
  const listed = await expectJson<{ posts: Array<{ post: { id: string } }> }>(await send(destination, "GET", `${destination.ws}/posts`), 200);
  return listed.posts.map((row) => row.post.id);
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] publish-content import [sqlite → ${dialect}]: an exported post plans as 'created' on the destination`, async (t) => {
    const source = await bootSite(t, "sqlite");
    const destination = await bootSite(t, dialect);
    const { bundle, postId } = await exportBundleWithPost(source, "Published from A");
    const bundleId = await stage(destination, bundle);

    const { plan } = await planAndConfirm(destination, bundleId);
    assert.equal(plan.details.refused, false);
    const rows = plan.details.rows.filter((row) => row.entityType === "post" && row.entityId === postId);
    assert.deepEqual(rows.map((row) => ({ outcome: row.outcome, writes: row.writes })), [{ outcome: "created", writes: true }]);
    assert.equal((await destinationPostIds(destination)).includes(postId), false, "planning and confirming write nothing");
  });

  test(`[unrun] publish-content import [${dialect}]: planning an unknown bundle id is 404 BUNDLE_NOT_FOUND with the exact message`, async (t) => {
    const destination = await bootSite(t, dialect);
    const missing = await expectJson<{ error: string; code: string }>(
      await send(destination, "POST", `${destination.ws}/publish-content/import/plan`, { bundleId: "unrun-missing-bundle" }),
      404
    );
    assert.deepEqual(missing, {
      error: `publish-content: bundle 'unrun-missing-bundle' was not found, or has expired, for workspace '${destination.deps.workspaceId}'`,
      code: "BUNDLE_NOT_FOUND",
    });
  });
}

test("[unrun] publish-content import [sqlite → sqlite]: execute captures a restore point first, applies the post, and a replayed token is 409 TOKEN_ALREADY_REDEEMED", async (t) => {
  const source = await bootSite(t, "sqlite");
  const destination = await bootSite(t, "sqlite");
  const { bundle, postId } = await exportBundleWithPost(source, "Published from A");
  const bundleId = await stage(destination, bundle);
  const { confirmationToken } = await planAndConfirm(destination, bundleId);

  const executed = await expectJson<{ restorePointId: string; runId: string; changeSetIds: string[] }>(
    await send(destination, "POST", `${destination.ws}/publish-content/import/execute`, { bundleId, confirmationToken }),
    200
  );
  assert.equal(typeof executed.restorePointId, "string");
  assert.equal(typeof executed.runId, "string");
  assert.equal((await destinationPostIds(destination)).includes(postId), true, "the source post now exists on the destination under the same id");

  const points = await expectJson<{ items: Array<{ id: string; trigger: string }> }>(await send(destination, "GET", "/api/admin/v1/database/restore-points"), 200);
  assert.deepEqual(points.items.filter((item) => item.id === executed.restorePointId).map((item) => item.trigger), ["publish-content-import"]);

  const run = await send(destination, "GET", `${destination.ws}/publish-content/runs/${executed.runId}`);
  assert.equal(run.status, 200, await run.clone().text());

  const replay = await expectJson<{ code: string }>(
    await send(destination, "POST", `${destination.ws}/publish-content/import/execute`, { bundleId, confirmationToken }),
    409
  );
  assert.equal(replay.code, "TOKEN_ALREADY_REDEEMED");
});

test("[unrun] publish-content import [sqlite → pglite]: execute refuses 409 RESTORE_POINT_UNAVAILABLE and the post never lands", async (t) => {
  const source = await bootSite(t, "sqlite");
  const destination = await bootSite(t, "pglite");
  const { bundle, postId } = await exportBundleWithPost(source, "Published from A");
  const bundleId = await stage(destination, bundle);
  const { confirmationToken } = await planAndConfirm(destination, bundleId);

  const refused = await expectJson<{ error: string; code: string }>(
    await send(destination, "POST", `${destination.ws}/publish-content/import/execute`, { bundleId, confirmationToken }),
    409
  );
  assert.deepEqual(refused, {
    error:
      `workspace '${destination.deps.workspaceId}' has restore-point costClass 'unavailable' — publish-content import ` +
      "is refused with no attestation override (mirrors ADR-041 §2's forward-migrate rule)",
    code: "RESTORE_POINT_UNAVAILABLE",
  });
  assert.equal((await destinationPostIds(destination)).includes(postId), false);
});
