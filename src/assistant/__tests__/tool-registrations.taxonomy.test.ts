import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryTokenStore } from "../../core/gated-mutations/token";
import { createPost, InMemoryPostRepo } from "../../features/post";
import { taxonomyAgentToolCatalog, type AgentToolDefinition as TaxonomyAgentToolDefinition } from "../../features/taxonomy/agent-tools";
import {
  InMemoryEntryTermRepo,
  InMemoryTaxonomyRepo,
  InMemoryTaxonomyRevisionRepo,
  InMemoryTermRepo,
  noopStampWatermark,
} from "../../features/taxonomy";
import type { RouteDeps } from "../../server/routes/types";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations";

/**
 * @file The Taxonomy (Categories & Tags) tool-wiring test file — mirrors
 * `tool-registrations.widgets-contracts.test.ts`/`tool-registrations.database-recovery.test.ts`'s
 * own shape: catalog completeness (including the ONE deliberate exclusion, `taxonomy_execute_merge_term`,
 * and why), published contract parity, the risk cross-check, the ADR-021 §2 authorization half
 * (self-enforcing writes + inline-gated read + the gated-mutation plan()'s own authorize), the
 * merge-plan's self-merge guard, and a multi-tool workflow test chaining create -> create -> assign
 * -> plan-merge -> rename -> list.
 *
 * Real in-memory adapters throughout (`InMemoryTaxonomyRepo`, `InMemoryTermRepo`,
 * `InMemoryEntryTermRepo`, `InMemoryTaxonomyRevisionRepo`, `InMemoryPostRepo`,
 * `InMemoryTokenStore`), no mocking of the chokepoint itself, per Constitution Article V
 * (Integration-First Testing).
 */

const WORKSPACE_ID = "ws-taxonomy-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const taxonomyRepo = new InMemoryTaxonomyRepo();
  const termRepo = new InMemoryTermRepo();
  const entryTermRepo = new InMemoryEntryTermRepo();
  const taxonomyRevisionRepo = new InMemoryTaxonomyRevisionRepo();
  const postRepo = new InMemoryPostRepo();
  const authorizeCalls: Array<Record<string, unknown>> = [];

  let counter = 0;
  const authorize = async (params: Record<string, unknown>) => {
    authorizeCalls.push(params);
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  };
  const clock = { nowIso: () => NOW };
  const idGen = { newId: () => `id-${++counter}` };

  const deps = {
    workspaceId: WORKSPACE_ID,
    clock,
    idGen,
    outbox: { enqueue: async () => undefined },
    taxonomyRepo,
    termRepo,
    entryTermRepo,
    taxonomyRevisionRepo,
    postRepo,
    authorize,
    stampWatermark: noopStampWatermark,
    gatedMutations: { gatewayDeps: { clock, idGen, authorize, tokens: new InMemoryTokenStore() } },
  };

  return { deps: deps as unknown as RouteDeps, taxonomyRepo, termRepo, entryTermRepo, taxonomyRevisionRepo, postRepo, authorizeCalls };
}

/** Seeds one real 'post' row through the real chokepoint, for assign-terms/merge-overlap tests. */
async function seedPost(deps: RouteDeps, title = "My Post"): Promise<string> {
  const routeDeps = deps as unknown as { postRepo: InMemoryPostRepo; clock: { nowIso: () => string }; idGen: { newId: () => string } };
  const id = routeDeps.idGen.newId();
  const { post } = await createPost({
    deps: { repo: routeDeps.postRepo, clock: routeDeps.clock },
    input: { workspaceId: WORKSPACE_ID, id, title, kind: "post" },
  });
  return post.id;
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function catalogEntry(toolId: string): TaxonomyAgentToolDefinition {
  const entry = taxonomyAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

function taxonomyRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps).filter((r) => r.descriptor.id.startsWith("taxonomy_")).map((r) => [r.descriptor.id, r]));
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = taxonomyRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

const WIRED_TAXONOMY_TOOL_IDS = [
  "taxonomy_assign_terms",
  "taxonomy_create_taxonomy",
  "taxonomy_create_term",
  "taxonomy_list",
  "taxonomy_plan_merge_term",
  "taxonomy_rename_term",
].sort();

// ---------------------------------------------------------------------------
// 1. Catalog completeness — the 6 wireable entries vs. the 1 declared-but-excluded destructive tool
// ---------------------------------------------------------------------------

test("exactly the 6 wireable taxonomy entries are registered", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...taxonomyRegistrations(deps).keys()].sort(), WIRED_TAXONOMY_TOOL_IDS);
  assert.equal(taxonomyAgentToolCatalog.length, 7, "sanity: 6 wired + 1 excluded (taxonomy_execute_merge_term)");
});

test("taxonomy_execute_merge_term is never registered — refused for lack of a DERIVED_RISK_BY_TOOL_ID classification", () => {
  const { deps } = fakeRouteDeps();
  assert.equal(taxonomyRegistrations(deps).has("taxonomy_execute_merge_term"), false);
  assert.throws(() => assertRiskMetadataIsWirable("taxonomy_execute_merge_term", catalogEntry("taxonomy_execute_merge_term")), /has no entry in DERIVED_RISK_BY_TOOL_ID/);
});

test("taxonomy_execute_merge_term's actorClassRule would ALSO be refused on its own even if classified — no confirmation transport exists", () => {
  const excluded = catalogEntry("taxonomy_execute_merge_term");
  assert.equal(excluded.actorClassRule, "confirmer-must-equal-own-delegatedBy");
});

test("no wired taxonomy tool is named or described as able to confirm or execute a merge", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of taxonomyRegistrations(deps)) {
    assert.equal(/confirm/i.test(id), false, `'${id}' must not be named for a confirm step`);
    assert.equal(/execute_merge/i.test(id), false, `'${id}' must not be named for an execute step`);
    // Carve out negated clauses ("requires a human to confirm", "no tool ... can do that step") —
    // mirrors `tool-registrations.widgets-contracts.test.ts`'s identical negation-aware discipline
    // for its own purge/force-delete disclaimer check. Only a POSITIVE claim of confirming/merging
    // is disqualifying.
    const claim = registration.descriptor.description.replace(/\b(never|no|not|cannot|can't|won't|requires? a human to)\b[^.;—]*/gi, "");
    assert.equal(/\bconfirms?\b.*merge|\bmerge\b.*\bconfirms?\b/i.test(claim), false, `'${id}' must not claim it can confirm a merge`);
  }
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired taxonomy registration publishes its catalog entry's inputSchema and description verbatim", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of taxonomyRegistrations(deps)) {
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired taxonomy tool", () => {
  const { deps } = fakeRouteDeps();
  for (const [, registration] of taxonomyRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined);
  }
});

// ---------------------------------------------------------------------------
// 3. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the independent risk classification agrees with the catalog for all 6 wired taxonomy tools", () => {
  const { deps } = fakeRouteDeps();
  for (const id of taxonomyRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a catalog entry cannot downgrade its own risk — declaring taxonomy_create_taxonomy sideEffects:'none' fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("taxonomy_create_taxonomy", { ...catalogEntry("taxonomy_create_taxonomy"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("the ToolPolicy layer is a pass-through 'allow' for every wired taxonomy registration", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of taxonomyRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

// ---------------------------------------------------------------------------
// 4. Authorization (ADR-021 §2) — self-enforcing writes + inline-gated read + gateway's own plan() check
// ---------------------------------------------------------------------------

test("taxonomy_list: calls authorize() with admin.taxonomy.manage, inline (listTaxonomiesWithTerms has no authorize of its own)", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps();
  authorizeCalls.length = 0;

  await wired("taxonomy_list", deps).handler(executionContext(undefined));

  assert.equal(authorizeCalls.length, 1);
  assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
  assert.equal(authorizeCalls[0].permission, "admin.taxonomy.manage");
});

test("taxonomy_list: a denied principal is rejected", async () => {
  const { deps } = fakeRouteDeps({ allow: false });
  await assert.rejects(() => wired("taxonomy_list", deps).handler(executionContext(undefined)), /is not authorized for 'admin\.taxonomy\.manage'/);
});

test("taxonomy_create_taxonomy: calls authorize() with admin.taxonomy.manage (createTaxonomy's own self-enforced check)", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps();
  authorizeCalls.length = 0;

  await wired("taxonomy_create_taxonomy", deps).handler(executionContext({ name: "Category", hierarchical: true }));

  assert.ok(authorizeCalls.length >= 1);
  assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
  assert.equal(authorizeCalls[0].permission, "admin.taxonomy.manage");
});

for (const fixture of [
  { toolId: "taxonomy_create_taxonomy", input: { name: "Category", hierarchical: true } },
  { toolId: "taxonomy_rename_term", input: { termId: "nonexistent", newName: "New Name" } },
  { toolId: "taxonomy_assign_terms", input: { contentType: "post", contentId: "nonexistent", termIds: [] } },
]) {
  test(`${fixture.toolId}: a denied principal is rejected`, async () => {
    const { deps } = fakeRouteDeps({ allow: false });
    await assert.rejects(() => wired(fixture.toolId, deps).handler(executionContext(fixture.input)), /is not authorized for 'admin\.taxonomy\.manage'/);
  });
}

test("taxonomy_create_term: a denied principal is rejected", async () => {
  const { deps } = fakeRouteDeps({ allow: false });
  await assert.rejects(
    () => wired("taxonomy_create_term", deps).handler(executionContext({ taxonomyId: "nonexistent", name: "Term" })),
    /is not authorized for 'admin\.taxonomy\.manage'/,
  );
});

test("taxonomy_plan_merge_term: gateway.plan() authorizes with admin.taxonomy.manage before computing anything", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps();
  authorizeCalls.length = 0;

  await wired("taxonomy_plan_merge_term", deps).handler(executionContext({ fromTermId: "term-a", intoTermId: "term-b" }));

  assert.ok(authorizeCalls.some((call) => call.permission === "admin.taxonomy.manage"));
});

test("taxonomy_plan_merge_term: a denied principal is rejected", async () => {
  const { deps } = fakeRouteDeps({ allow: false });
  await assert.rejects(
    () => wired("taxonomy_plan_merge_term", deps).handler(executionContext({ fromTermId: "term-a", intoTermId: "term-b" })),
    /is not authorized for 'admin\.taxonomy\.manage'/,
  );
});

// ---------------------------------------------------------------------------
// 5. taxonomy_plan_merge_term's self-merge guard (REQ-15a) — rejected before any computation
// ---------------------------------------------------------------------------

test("taxonomy_plan_merge_term rejects fromTermId === intoTermId before computing any overlap", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => wired("taxonomy_plan_merge_term", deps).handler(executionContext({ fromTermId: "same-term", intoTermId: "same-term" })),
    /cannot merge term 'same-term' into itself/,
  );
});

// ---------------------------------------------------------------------------
// 6. Multi-tool workflow — create taxonomy -> create 2 terms -> assign both to a post -> plan a
//    merge (proving the overlap disclosure reflects the REAL assignment) -> rename -> list
// ---------------------------------------------------------------------------

test("workflow: create a taxonomy, create two terms, assign both to a post, plan their merge, rename one, then list — state stays consistent throughout", async () => {
  const { deps } = fakeRouteDeps();

  // Step 1: create the taxonomy.
  const createdTaxonomy = (await wired("taxonomy_create_taxonomy", deps).handler(executionContext({ name: "Topic", hierarchical: false }))) as {
    taxonomy: { id: string; name: string; version: number };
  };
  const taxonomyId = createdTaxonomy.taxonomy.id;
  assert.equal(createdTaxonomy.taxonomy.name, "Topic");

  // Step 2: create two terms under it, using the id step 1 returned.
  const term1 = (await wired("taxonomy_create_term", deps).handler(executionContext({ taxonomyId, name: "Alpha" }))) as { term: { id: string; taxonomyId: string } };
  const term2 = (await wired("taxonomy_create_term", deps).handler(executionContext({ taxonomyId, name: "Beta" }))) as { term: { id: string; taxonomyId: string } };
  assert.equal(term1.term.taxonomyId, taxonomyId);
  assert.equal(term2.term.taxonomyId, taxonomyId);
  assert.notEqual(term1.term.id, term2.term.id);

  // Step 3: assign BOTH terms to the same real post — the exact overlap the merge-plan disclosure
  // must reflect.
  const postId = await seedPost(deps);
  const assigned = (await wired("taxonomy_assign_terms", deps).handler(
    executionContext({ contentType: "post", contentId: postId, termIds: [term1.term.id, term2.term.id] }),
  )) as { contentType: string; contentId: string; assignedTermIds: string[] };
  assert.equal(assigned.contentId, postId);
  assert.deepEqual(assigned.assignedTermIds.sort(), [term1.term.id, term2.term.id].sort());

  // Step 4: plan a merge of term1 into term2 — since the SAME post is assigned to both (step 3),
  // the plan must disclose exactly 1 overlapping content row, not 0 and not fabricated.
  const plan = (await wired("taxonomy_plan_merge_term", deps).handler(
    executionContext({ fromTermId: term1.term.id, intoTermId: term2.term.id }),
  )) as { planId: string; planHash: string; details: { overlapLossDisclosed: boolean; overlappingContentCount: number; fromTermId: string; intoTermId: string } };
  assert.equal(plan.details.fromTermId, term1.term.id);
  assert.equal(plan.details.intoTermId, term2.term.id);
  assert.equal(plan.details.overlappingContentCount, 1, "the post assigned to both terms in step 3 must be counted");
  assert.equal(plan.details.overlapLossDisclosed, true);
  assert.ok(plan.planId.length > 0);
  assert.ok(plan.planHash.length > 0);

  // Step 5: rename term2 (the merge survivor) — proves an ordinary write still works mid-workflow,
  // chained off the SAME term id the earlier steps minted, not a fresh lookup.
  const renamed = (await wired("taxonomy_rename_term", deps).handler(executionContext({ termId: term2.term.id, newName: "Beta Renamed" }))) as {
    term: { id: string; name: string; version: number };
  };
  assert.equal(renamed.term.id, term2.term.id);
  assert.equal(renamed.term.name, "Beta Renamed");
  assert.equal(renamed.term.version, 2, "rename must have advanced the term's version from its creation version 1");

  // Step 6: list — the final cross-check that every prior step's state is visible together and
  // consistent (same taxonomy, same 2 terms, term2's name reflects step 5's rename).
  const listed = (await wired("taxonomy_list", deps).handler(executionContext(undefined))) as {
    items: Array<{ taxonomy: { id: string; name: string }; terms: Array<{ id: string; name: string }> }>;
  };
  const row = listed.items.find((item) => item.taxonomy.id === taxonomyId);
  assert.ok(row, "the taxonomy created in step 1 must appear in the list");
  const names = row.terms.map((t) => t.name).sort();
  assert.deepEqual(names, ["Alpha", "Beta Renamed"], "the list must reflect BOTH the original term1 name and term2's step-5 rename");
});
