import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminTaxonomyCreateRoute } from "../../routes/admin/taxonomy/create-taxonomy.js";
import { registerAdminTaxonomyCreateTermRoute } from "../../routes/admin/taxonomy/create-term.js";
import { registerAdminTaxonomyMergeTermRoutes } from "../../routes/admin/taxonomy/merge-term.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file SPEC-018 C-207 — real-HTTP integration tests for the taxonomy `mergeTerm` gated-mutation
 * route triple (`core/gated-mutations`'s gateway composed into a real composition root for the
 * first time, this dispatch). Mirrors `content-types-routes.test.ts`'s real-auth pattern.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminTaxonomyCreateRoute(app, deps);
  registerAdminTaxonomyCreateTermRoute(app, deps);
  registerAdminTaxonomyMergeTermRoutes(app, deps);
  return { app, deps };
}

async function createTermPair(baseUrl: string, cookie: string): Promise<{ fromTermId: string; intoTermId: string }> {
  const taxonomyRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Category", hierarchical: false }),
  });
  const { taxonomy } = (await taxonomyRes.json()) as { taxonomy: { id: string } };

  const fromTermRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Snacks" }),
  });
  const { term: fromTerm } = (await fromTermRes.json()) as { term: { id: string } };

  const intoTermRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${taxonomy.id}/terms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Food" }),
  });
  const { term: intoTerm } = (await intoTermRes.json()) as { term: { id: string } };

  return { fromTermId: fromTerm.id, intoTermId: intoTerm.id };
}

test("taxonomy mergeTerm: plan -> confirm -> execute succeeds end-to-end and repoints entry_terms", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const { fromTermId, intoTermId } = await createTermPair(baseUrl, cookie);

  await deps.entryTermRepo.upsert({ contentType: "post", contentId: "post-1", termId: fromTermId, addedAt: "2026-07-15T00:00:00.000Z" });

  const planRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${fromTermId}/merge/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ intoTermId }),
  });
  assert.equal(planRes.status, 200);
  const planBody = (await planRes.json()) as { planId: string; planHash: string; details: { overlappingContentCount: number } };
  assert.equal(planBody.details.overlappingContentCount, 0);

  const confirmRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${fromTermId}/merge/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ planId: planBody.planId, planHash: planBody.planHash }),
  });
  assert.equal(confirmRes.status, 200);
  const { confirmationToken } = (await confirmRes.json()) as { confirmationToken: string };
  assert.ok(confirmationToken);

  const executeRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${fromTermId}/merge/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ intoTermId, confirmationToken }),
  });
  assert.equal(executeRes.status, 200);
  const executed = (await executeRes.json()) as { mergedCount: number };
  assert.equal(executed.mergedCount, 1);

  // The content previously assigned to fromTermId is now re-pointed to intoTermId.
  const remainingOverlap = await deps.entryTermRepo.countOverlap({ fromTermId, intoTermId });
  assert.equal(remainingOverlap, 0, "fromTermId's rows were repointed away, not duplicated");
});

test("taxonomy mergeTerm: a stale plan (overlap count changed between confirm and execute) is rejected PLAN_STALE", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const { fromTermId, intoTermId } = await createTermPair(baseUrl, cookie);

  const planRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${fromTermId}/merge/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ intoTermId }),
  });
  const planBody = (await planRes.json()) as { planId: string; planHash: string };

  const confirmRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${fromTermId}/merge/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ planId: planBody.planId, planHash: planBody.planHash }),
  });
  const { confirmationToken } = (await confirmRes.json()) as { confirmationToken: string };

  // Mutate live state between confirm and execute so the live-recomputed overlap count (and thus
  // the re-derived plan hash) diverges from what was confirmed (CIC U-001-B3).
  await deps.entryTermRepo.upsert({ contentType: "post", contentId: "post-1", termId: fromTermId, addedAt: "2026-07-15T00:00:00.000Z" });
  await deps.entryTermRepo.upsert({ contentType: "post", contentId: "post-1", termId: intoTermId, addedAt: "2026-07-15T00:00:00.000Z" });

  const executeRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${fromTermId}/merge/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ intoTermId, confirmationToken }),
  });
  assert.equal(executeRes.status, 409);
  const body = (await executeRes.json()) as { code: string };
  assert.equal(body.code, "PLAN_STALE");
});

test("taxonomy mergeTerm: replaying an already-redeemed confirmation token is rejected TOKEN_ALREADY_REDEEMED", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const { fromTermId, intoTermId } = await createTermPair(baseUrl, cookie);

  const planRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${fromTermId}/merge/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ intoTermId }),
  });
  const planBody = (await planRes.json()) as { planId: string; planHash: string };

  const confirmRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${fromTermId}/merge/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ planId: planBody.planId, planHash: planBody.planHash }),
  });
  const { confirmationToken } = (await confirmRes.json()) as { confirmationToken: string };

  const firstExecuteRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${fromTermId}/merge/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ intoTermId, confirmationToken }),
  });
  assert.equal(firstExecuteRes.status, 200);

  const replayRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/terms/${fromTermId}/merge/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ intoTermId, confirmationToken }),
  });
  assert.equal(replayRes.status, 409);
  const body = (await replayRes.json()) as { code: string };
  assert.equal(body.code, "TOKEN_ALREADY_REDEEMED");
});
