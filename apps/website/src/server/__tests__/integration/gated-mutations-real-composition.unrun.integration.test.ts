// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap #5 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — two of the three
 * plan → confirm → execute gated mutations through the REAL site composition on both dialects:
 * taxonomy term merge and database migrate-forward. (Publish-content import has its own file,
 * `publish-content-import-real-composition.unrun.integration.test.ts`.)
 *
 * `taxonomy-merge-term-routes.test.ts` and `database-migrate-forward-routes.test.ts` run these routes
 * on the hermetic `createRouteDeps()` root, whose `gatedMutations` binds an `InMemoryTokenStore`.
 * `createSiteRouteDeps` binds `SqliteTokenStore` over the content kernel instead (the
 * `gated_mutation_tokens` table, migration 0052), so whether a confirmation token is really
 * persisted, really single-use under two concurrent executes (`tryRedeem`'s lockKey + conditional
 * UPDATE), and whether `repointTerm`'s upsert-then-delete really dedupes on Postgres, is proven
 * nowhere. Migrate-forward differs by dialect by design: SQLite captures a real file snapshot
 * (`costClass: "cheap"`), PGlite reports `"unavailable"` (`PostgresDbOpsAdapter`) and the execute
 * step must refuse with no override.
 */

interface PlanBody {
  domain: string;
  planId: string;
  planHash: string;
  details: Record<string, unknown>;
}

async function createPost(site: BootedSite, title: string): Promise<string> {
  return (await expectJson<{ post: { id: string } }>(await send(site, "POST", `${site.ws}/posts`, { title, status: "draft" }), 201)).post.id;
}

async function createTerms(site: BootedSite): Promise<{ fromTermId: string; intoTermId: string }> {
  const { taxonomy } = await expectJson<{ taxonomy: { id: string } }>(await send(site, "POST", "/api/admin/v1/taxonomy", { name: "Unrun Topics", hierarchical: false }), 201);
  const from = await expectJson<{ term: { id: string } }>(await send(site, "POST", `/api/admin/v1/taxonomy/${taxonomy.id}/terms`, { name: "Snacks" }), 201);
  const into = await expectJson<{ term: { id: string } }>(await send(site, "POST", `/api/admin/v1/taxonomy/${taxonomy.id}/terms`, { name: "Food" }), 201);
  return { fromTermId: from.term.id, intoTermId: into.term.id };
}

async function assign(site: BootedSite, postId: string, termIds: string[]): Promise<void> {
  const res = await send(site, "POST", "/api/admin/v1/taxonomy/assign-terms", { contentType: "post", contentId: postId, termIds });
  assert.equal(res.status, 204, await res.text());
}

async function assignedTerms(site: BootedSite, postId: string): Promise<string[]> {
  return (await expectJson<{ termIds: string[] }>(await send(site, "GET", `/api/admin/v1/taxonomy/assigned-terms?contentType=post&contentId=${postId}`), 200)).termIds;
}

async function planAndConfirmMerge(site: BootedSite, fromTermId: string, intoTermId: string): Promise<{ plan: PlanBody; confirmationToken: string }> {
  const plan = await expectJson<PlanBody>(await send(site, "POST", `/api/admin/v1/taxonomy/terms/${fromTermId}/merge/plan`, { intoTermId }), 200);
  const { confirmationToken } = await expectJson<{ confirmationToken: string }>(
    await send(site, "POST", `/api/admin/v1/taxonomy/terms/${fromTermId}/merge/confirm`, { planId: plan.planId, planHash: plan.planHash }),
    200
  );
  return { plan, confirmationToken };
}

async function tokenStatus(site: BootedSite, token: string): Promise<string[]> {
  const kernel = site.deps.contentKernel;
  assert.ok(kernel, "the site composition exposes its content kernel");
  const rows = await kernel.run((db) => db.selectFrom("gated_mutation_tokens").select("status").where("confirmation_token", "=", token).execute());
  return rows.map((row) => row.status);
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] term merge [${dialect}]: plan discloses the overlap, confirm persists a minted token, execute repoints and dedupes every assignment and redeems the token`, async (t) => {
    const site = await bootSite(t, dialect);
    const { fromTermId, intoTermId } = await createTerms(site);
    const both = await createPost(site, "Tagged with both");
    const onlyFrom = await createPost(site, "Tagged with the source only");
    await assign(site, both, [fromTermId, intoTermId]);
    await assign(site, onlyFrom, [fromTermId]);

    const { plan, confirmationToken } = await planAndConfirmMerge(site, fromTermId, intoTermId);
    assert.equal(plan.domain, "taxonomy.merge");
    assert.deepEqual(plan.details, { fromTermId, intoTermId, overlapLossDisclosed: true, overlappingContentCount: 1 });
    assert.match(confirmationToken, /^ctok_/);
    assert.deepEqual(await tokenStatus(site, confirmationToken), ["minted"], "the token is a durable row, not process memory");

    const executed = await expectJson<{ mergedCount: number }>(
      await send(site, "POST", `/api/admin/v1/taxonomy/terms/${fromTermId}/merge/execute`, { intoTermId, confirmationToken }),
      200
    );
    assert.deepEqual(executed, { mergedCount: 2 });
    assert.deepEqual(await assignedTerms(site, both), [intoTermId], "the overlapping post collapses to one assignment, not a unique-violation");
    assert.deepEqual(await assignedTerms(site, onlyFrom), [intoTermId]);
    assert.equal((await site.deps.termRepo.findByIdFull({ id: fromTermId }))?.status, "deprecated");
    assert.equal((await site.deps.termRepo.findByIdFull({ id: intoTermId }))?.status, "active");
    assert.deepEqual(await tokenStatus(site, confirmationToken), ["redeemed"]);

    const replay = await expectJson<{ code: string }>(
      await send(site, "POST", `/api/admin/v1/taxonomy/terms/${fromTermId}/merge/execute`, { intoTermId, confirmationToken }),
      409
    );
    assert.equal(replay.code, "TOKEN_ALREADY_REDEEMED");
  });

  test(`[unrun] term merge [${dialect}]: two concurrent executes with one token → exactly one 200, the other 409 TOKEN_ALREADY_REDEEMED`, async (t) => {
    const site = await bootSite(t, dialect);
    const { fromTermId, intoTermId } = await createTerms(site);
    // No overlap before or after the merge, so the plan hash cannot go stale under the winner:
    // the loser can only lose on redemption, which is what this test isolates.
    const post = await createPost(site, "Tagged once");
    await assign(site, post, [fromTermId]);
    const { confirmationToken } = await planAndConfirmMerge(site, fromTermId, intoTermId);

    const responses = await Promise.all(
      [0, 1].map(() => send(site, "POST", `/api/admin/v1/taxonomy/terms/${fromTermId}/merge/execute`, { intoTermId, confirmationToken }))
    );
    const outcomes = await Promise.all(responses.map(async (res) => ({ status: res.status, body: JSON.parse(await res.text()) as Record<string, unknown> })));
    const ok = outcomes.filter((outcome) => outcome.status === 200);
    const lost = outcomes.filter((outcome) => outcome.status !== 200);
    assert.equal(ok.length, 1, JSON.stringify(outcomes));
    assert.deepEqual(ok[0].body, { mergedCount: 1 });
    assert.equal(lost.length, 1);
    assert.deepEqual({ status: lost[0].status, code: lost[0].body.code }, { status: 409, code: "TOKEN_ALREADY_REDEEMED" });
    assert.deepEqual(await assignedTerms(site, post), [intoTermId]);
  });

  test(`[unrun] term merge [${dialect}]: an assignment added between confirm and execute makes execute 409 PLAN_STALE and changes nothing`, async (t) => {
    const site = await bootSite(t, dialect);
    const { fromTermId, intoTermId } = await createTerms(site);
    const post = await createPost(site, "Late overlap");
    await assign(site, post, [fromTermId]);
    const { confirmationToken } = await planAndConfirmMerge(site, fromTermId, intoTermId);

    await assign(site, post, [intoTermId]);
    const stale = await expectJson<{ code: string }>(
      await send(site, "POST", `/api/admin/v1/taxonomy/terms/${fromTermId}/merge/execute`, { intoTermId, confirmationToken }),
      409
    );
    assert.equal(stale.code, "PLAN_STALE");
    assert.deepEqual(await assignedTerms(site, post), [fromTermId, intoTermId].sort());
    assert.equal((await site.deps.termRepo.findByIdFull({ id: fromTermId }))?.status, "active");
    assert.deepEqual(await tokenStatus(site, confirmationToken), ["minted"], "a stale plan never burns the token");
  });
}

test("[unrun] migrate-forward [sqlite]: plan → confirm → execute captures a real content.db snapshot, lists it as a restore point, and records a core.migration ledger row", async (t) => {
  const site = await bootSite(t, "sqlite");
  const plan = await expectJson<PlanBody>(await send(site, "POST", "/api/admin/v1/database/migrate-forward/plan"), 200);
  assert.equal(plan.domain, "database.migrate");
  assert.deepEqual(plan.details, { costClass: "cheap", siteId: site.deps.workspaceId });

  const { confirmationToken } = await expectJson<{ confirmationToken: string }>(
    await send(site, "POST", "/api/admin/v1/database/migrate-forward/confirm", { planId: plan.planId, planHash: plan.planHash }),
    200
  );
  const executed = await expectJson<{ migrated: boolean }>(await send(site, "POST", "/api/admin/v1/database/migrate-forward/execute", { confirmationToken }), 200);
  assert.deepEqual(executed, { migrated: true });

  const listed = await expectJson<{ items: Array<{ id: string; trigger: string; costClass: string; kind: string; artifactRef: string }> }>(
    await send(site, "GET", "/api/admin/v1/database/restore-points"),
    200
  );
  const points = listed.items.filter((item) => item.trigger === "migrate-forward");
  assert.equal(points.length, 1, JSON.stringify(listed.items));
  assert.deepEqual({ costClass: points[0].costClass, kind: points[0].kind }, { costClass: "cheap", kind: "file-snapshot" });
  assert.equal(path.dirname(points[0].artifactRef), site.siteDir, "the snapshot is written beside content.db");
  assert.equal(fs.statSync(points[0].artifactRef).size > 0, true, "the snapshot file really exists and is not empty");

  const ledger = await site.deps.databaseLedgerRepo.query({ limit: 50 });
  const rows = ledger.items.filter((row) => row.kind === "core.migration" && row.restorePointId === points[0].id);
  assert.equal(rows.length, 1, JSON.stringify(ledger.items));
  assert.equal(rows[0].outcome, "success");
});

test("[unrun] migrate-forward [pglite]: plan reports costClass 'unavailable' and execute refuses 409 RESTORE_POINT_UNAVAILABLE without redeeming the token or saving a restore point", async (t) => {
  const site = await bootSite(t, "pglite");
  const plan = await expectJson<PlanBody>(await send(site, "POST", "/api/admin/v1/database/migrate-forward/plan"), 200);
  assert.deepEqual(plan.details, { costClass: "unavailable", siteId: site.deps.workspaceId });

  const { confirmationToken } = await expectJson<{ confirmationToken: string }>(
    await send(site, "POST", "/api/admin/v1/database/migrate-forward/confirm", { planId: plan.planId, planHash: plan.planHash }),
    200
  );
  const refused = await expectJson<{ error: string; code: string }>(
    await send(site, "POST", "/api/admin/v1/database/migrate-forward/execute", { confirmationToken }),
    409
  );
  assert.deepEqual(refused, {
    error: `REQ-08: site '${site.deps.workspaceId}' has costClass 'unavailable' — the in-product forward migrate is refused with no attestation override (ADR-041 §2)`,
    code: "RESTORE_POINT_UNAVAILABLE",
  });
  assert.deepEqual(await tokenStatus(site, confirmationToken), ["minted"]);
  const listed = await expectJson<{ items: unknown[] }>(await send(site, "GET", "/api/admin/v1/database/restore-points"), 200);
  assert.deepEqual(listed.items, []);
});
