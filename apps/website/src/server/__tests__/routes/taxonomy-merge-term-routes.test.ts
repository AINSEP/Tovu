import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminTaxonomyCreateRoute } from "../../inbound/admin-http/routes/taxonomy/create-taxonomy.js";
import { registerAdminTaxonomyCreateTermRoute } from "../../inbound/admin-http/routes/taxonomy/create-term.js";
import { registerAdminTaxonomyMergeTermRoutes } from "../../inbound/admin-http/routes/taxonomy/merge-term.js";
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
  const sourceTerm = await deps.termRepo.findByIdFull({ id: fromTermId });
  assert.ok(sourceTerm);
  const unrelatedRes = await fetch(`${baseUrl}/api/admin/v1/taxonomy/${sourceTerm.taxonomyId}/terms`, {
    method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ name: "Unrelated" }),
  });
  assert.equal(unrelatedRes.status, 201);
  const { term: unrelated } = await unrelatedRes.json() as { term: { id: string } };

  await deps.entryTermRepo.upsert({ contentType: "post", contentId: "post-1", termId: fromTermId, addedAt: "2026-07-15T00:00:00.000Z" });
  await deps.entryTermRepo.upsert({ contentType: "post", contentId: "post-1", termId: unrelated.id, addedAt: "2026-07-15T00:00:00.000Z" });

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
  const assignments = await deps.entryTermRepo.listForContent({ contentType: "post", contentId: "post-1" });
  assert.deepEqual(assignments.map((row) => row.termId).sort(), [intoTermId, unrelated.id].sort());
  assert.equal((await deps.termRepo.findByIdFull({ id: fromTermId }))?.status, "deprecated");
  assert.equal((await deps.termRepo.findByIdFull({ id: intoTermId }))?.status, "active");
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

// ---- Direct-invoke contracts (hand-built req, fake ports layered over the real composition) ----

const MERGE_BASE = "/api/admin/v1/taxonomy/terms/:id/merge";
/** Every method of this repo/store port throws a non-Error value, as a broken driver might. */
function throwingNonErrorPort(): unknown {
  return new Proxy({}, { get: () => async () => { throw "storage offline"; } });
}
async function invokeMerge(app: express.Express, step: "plan" | "confirm" | "execute", req: { params: Record<string, string>; body?: unknown }, principalId = "owner") {
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: principalId };
  await extractRouteHandler(app, "post", `${MERGE_BASE}/${step}`)(req, res);
  return capture;
}
function mergeApp(deps: RouteDeps): express.Express {
  const app = express();
  registerAdminTaxonomyMergeTermRoutes(app, deps);
  return app;
}
async function ownerOf(deps: RouteDeps): Promise<string> {
  return (await deps.ownerPrincipalId) as string;
}

test("taxonomy mergeTerm: each step rejects a missing or non-string body field with 400 before any gateway call", async () => {
  const { deps } = buildTestApp();
  const app = mergeApp({ ...deps, gatedMutations: { gatewayDeps: throwingNonErrorPort() } } as unknown as RouteDeps);
  const cases: Array<["plan" | "confirm" | "execute", unknown, string]> = [
    ["plan", undefined, "'intoTermId' (string) is required"],
    ["plan", { intoTermId: 7 }, "'intoTermId' (string) is required"],
    ["confirm", undefined, "'planId' and 'planHash' (strings) are required"],
    ["confirm", { planId: "plan-1" }, "'planId' and 'planHash' (strings) are required"],
    ["execute", undefined, "'intoTermId' and 'confirmationToken' (strings) are required"],
    ["execute", { intoTermId: "term-2" }, "'intoTermId' and 'confirmationToken' (strings) are required"],
  ];
  for (const [step, body, error] of cases) {
    assert.deepEqual(await invokeMerge(app, step, { params: { id: "term-1" }, body }), { statusCode: 400, jsonBody: { error, code: "VALIDATION_ERROR" } });
  }
});

test("taxonomy mergeTerm: merging a term into itself is rejected 400 SAME_TERM_MERGE", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const { fromTermId } = await createTermPair(baseUrl, cookie);
  assert.deepEqual(await invokeMerge(mergeApp(deps), "plan", { params: { id: fromTermId }, body: { intoTermId: fromTermId } }, await ownerOf(deps)), {
    statusCode: 400, jsonBody: { error: `cannot merge term '${fromTermId}' into itself`, code: "SAME_TERM_MERGE" },
  });
});

test("taxonomy mergeTerm: a caller without admin.taxonomy.manage is refused 403 with the gateway's reason code", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const { fromTermId, intoTermId } = await createTermPair(baseUrl, cookie);
  const capture = await invokeMerge(mergeApp(deps), "plan", { params: { id: fromTermId }, body: { intoTermId } }, "stranger");
  assert.equal(capture.statusCode, 403);
  assert.equal(typeof (capture.jsonBody as { code: unknown }).code, "string");
  assert.notEqual((capture.jsonBody as { code: string }).code, "INTERNAL_ERROR");
});

test("taxonomy mergeTerm: an expired confirmation token is rejected 409 TOKEN_EXPIRED", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const { fromTermId, intoTermId } = await createTermPair(baseUrl, cookie);
  const planRes = await fetch(`${baseUrl}${MERGE_BASE.replace(":id", fromTermId)}/plan`, {
    method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ intoTermId }),
  });
  const plan = (await planRes.json()) as { planId: string; planHash: string };
  const confirmRes = await fetch(`${baseUrl}${MERGE_BASE.replace(":id", fromTermId)}/confirm`, {
    method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(plan),
  });
  const { confirmationToken } = (await confirmRes.json()) as { confirmationToken: string };
  const farFuture = Date.parse("2100-01-01T00:00:00.000Z");
  const lateClock = { nowIso: () => new Date(farFuture).toISOString(), nowMs: () => farFuture };
  const lateApp = mergeApp({ ...deps, gatedMutations: { gatewayDeps: { ...deps.gatedMutations.gatewayDeps, clock: lateClock } } } as unknown as RouteDeps);
  const capture = await invokeMerge(lateApp, "execute", { params: { id: fromTermId }, body: { intoTermId, confirmationToken } }, await ownerOf(deps));
  assert.equal(capture.statusCode, 409);
  assert.equal((capture.jsonBody as { code: string }).code, "TOKEN_EXPIRED");
});

test("taxonomy mergeTerm: a non-Error failure in any step returns a generic 500 INTERNAL_ERROR", async () => {
  const { deps } = buildTestApp();
  const owner = await ownerOf(deps);
  const broken = mergeApp({ ...deps, termRepo: throwingNonErrorPort(), entryTermRepo: throwingNonErrorPort(),
    gatedMutations: { gatewayDeps: { ...deps.gatedMutations.gatewayDeps, tokens: throwingNonErrorPort(), authorize: async () => { throw "authz offline"; } } } } as unknown as RouteDeps);
  const expected = { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } };
  assert.deepEqual(await invokeMerge(broken, "plan", { params: { id: "term-1" }, body: { intoTermId: "term-2" } }, owner), expected);
  assert.deepEqual(await invokeMerge(broken, "confirm", { params: { id: "term-1" }, body: { planId: "plan-1", planHash: "hash-1" } }, owner), expected);
  assert.deepEqual(await invokeMerge(broken, "execute", { params: { id: "term-1" }, body: { intoTermId: "term-2", confirmationToken: "token-1" } }, owner), expected);
});

test("taxonomy mergeTerm: an Error thrown by a step keeps its message on the 500 (no authenticated principal)", async () => {
  const { deps } = buildTestApp();
  const app = mergeApp(deps);
  for (const [step, body] of [["plan", { intoTermId: "t" }], ["confirm", { planId: "p", planHash: "h" }], ["execute", { intoTermId: "t", confirmationToken: "c" }]] as const) {
    const { res, capture } = createCapturingResponse();
    await extractRouteHandler(app, "post", `${MERGE_BASE}/${step}`)({ params: { id: "term-1" }, body }, res);
    assert.equal(capture.statusCode, 500);
    assert.equal((capture.jsonBody as { code: string }).code, "INTERNAL_ERROR");
    assert.notEqual((capture.jsonBody as { error: string }).error, "internal error");
  }
});
