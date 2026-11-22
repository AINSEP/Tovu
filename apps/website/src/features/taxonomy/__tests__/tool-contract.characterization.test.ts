/**
 * @file Characterization of the Taxonomy agent-tool contract, built THROUGH THE HOST CONTRIBUTOR
 * (`contributeTaxonomyTools().build(deps, surfaces)`), so it pins what the assistant's composition
 * root receives regardless of which package the handlers live in. It must stay green, unedited,
 * across the move of the handlers into `@jini-ai/cms/taxonomy`.
 *
 * Pinned: registration ids and their order (saved in permissions and audit rows), every descriptor
 * against a committed golden (including `metadata`: the host's search vocabulary and approval
 * policy), the derived-risk map, the per-tool permission refusal (class and message), one success
 * view per tool, and the merge ceremony: confirmed / declined / stale plan / off-list content type.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PlanStaleError } from "@jini-ai/core/gated-mutations";
import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import type { UIResource } from "@jini-ai/protocol/mcp-ui";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";

import { InMemoryTokenStore } from "../../../contracts/core/gated-mutations/token.js";
import { InMemoryContentTypeRepo } from "../../content-types/index.js";
import { InMemoryEntryRepo } from "@jini-ai/cms/entries";
import { createPost, InMemoryPostRepo } from "../../post/index.js";
import { InMemoryEntryTermRepo, InMemoryTaxonomyRepo, InMemoryTaxonomyRevisionRepo, InMemoryTermRepo, noopStampWatermark } from "@jini-ai/cms/taxonomy";
import { contributeTaxonomyTools, type TaxonomyToolDeps } from "../tool-registrations.js";

const WORKSPACE_ID = "ws-taxonomy-contract";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";
const MERGE_TOOL = "taxonomy_execute_merge_term";
const STALE_MESSAGE = "the plan backing this confirmation has changed since it was confirmed; re-plan and re-confirm";

const TOOL_IDS = [
  "taxonomy_get_term",
  "taxonomy_list",
  "taxonomy_get_assigned_terms",
  "taxonomy_create_taxonomy",
  "taxonomy_create_term",
  "taxonomy_rename_term",
  "taxonomy_assign_terms",
  "taxonomy_unassign_terms",
  "taxonomy_plan_merge_term",
  "taxonomy_execute_merge_term",
] as const;

const DERIVED_RISK: ReadonlyArray<readonly [string, string]> = [
  ["taxonomy_list", "none"],
  ["taxonomy_get_term", "none"],
  ["taxonomy_get_assigned_terms", "none"],
  ["taxonomy_create_taxonomy", "mutates-durable-state"],
  ["taxonomy_create_term", "mutates-durable-state"],
  ["taxonomy_rename_term", "mutates-durable-state"],
  ["taxonomy_assign_terms", "mutates-durable-state"],
  ["taxonomy_unassign_terms", "mutates-durable-state"],
  ["taxonomy_plan_merge_term", "none"],
  ["taxonomy_execute_merge_term", "mutates-durable-state"],
];

const GOLDEN = JSON.parse(readFileSync(new URL("./tool-contract.characterization.golden.json", import.meta.url), "utf8")) as Record<string, unknown>;

interface Fixture {
  deps: TaxonomyToolDeps;
  entryTermRepo: InMemoryEntryTermRepo;
  termRepo: InMemoryTermRepo;
  outboxEvents: string[];
  surfaceExchanges: ReturnType<typeof createSurfaceExchangeStore>;
  tools: ToolRegistration[];
  call(toolId: string, input: Record<string, unknown>): Promise<unknown>;
}

function makeFixture(options: { allow?: boolean } = {}): Fixture {
  const allow = options.allow ?? true;
  const entryTermRepo = new InMemoryEntryTermRepo();
  const termRepo = new InMemoryTermRepo();
  const outboxEvents: string[] = [];
  const clock = { nowMs: () => Date.parse(NOW), nowIso: () => NOW };
  let counter = 0;
  const idGen = { newId: () => { counter += 1; return `id-${counter}`; } };
  const authorize = async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" });
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock,
    idGen,
    outbox: { enqueue: async (event: { name: string }) => void outboxEvents.push(event.name) },
    taxonomyRepo: new InMemoryTaxonomyRepo(),
    termRepo,
    entryTermRepo: Object.assign(entryTermRepo, {
      listForContent: async ({ contentType, contentId }: { contentType: string; contentId: string }) =>
        (entryTermRepo as unknown as { rows: Array<{ contentType: string; contentId: string; termId: string }> }).rows.filter((row) => row.contentType === contentType && row.contentId === contentId),
    }),
    taxonomyRevisionRepo: new InMemoryTaxonomyRevisionRepo(),
    postRepo: new InMemoryPostRepo({}),
    entryRepo: new InMemoryEntryRepo(),
    contentTypeRepo: new InMemoryContentTypeRepo(),
    authorize,
    stampWatermark: noopStampWatermark,
    gatedMutations: { gatewayDeps: { clock, idGen, authorize, tokens: new InMemoryTokenStore() } },
  } as unknown as TaxonomyToolDeps;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const tools = contributeTaxonomyTools().build(deps, { surfaceExchanges });
  const call = (toolId: string, input: Record<string, unknown>) => {
    const tool = tools.find((candidate) => candidate.descriptor.id === toolId);
    assert.ok(tool, `expected '${toolId}' to be wired`);
    return tool.handler(context(input));
  };
  return { deps, entryTermRepo, termRepo, outboxEvents, surfaceExchanges, tools, call };
}

function context(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

async function seed(fixture: Fixture): Promise<{ taxonomyId: string; fromTermId: string; intoTermId: string; postId: string }> {
  await createPost({ deps: { repo: fixture.deps.postRepo, clock: fixture.deps.clock }, input: { workspaceId: WORKSPACE_ID, id: "post-1", title: "P", kind: "post" } });
  const { taxonomy } = (await fixture.call("taxonomy_create_taxonomy", { name: "Topic" })) as { taxonomy: { id: string } };
  const { term: from } = (await fixture.call("taxonomy_create_term", { taxonomyId: taxonomy.id, name: "Alpha" })) as { term: { id: string } };
  const { term: into } = (await fixture.call("taxonomy_create_term", { taxonomyId: taxonomy.id, name: "Beta" })) as { term: { id: string } };
  await fixture.call("taxonomy_assign_terms", { contentType: "post", contentId: "post-1", termIds: [from.id] });
  return { taxonomyId: taxonomy.id, fromTermId: from.id, intoTermId: into.id, postId: "post-1" };
}

/** Starts the merge, waits for its dialog and hands back the answer seam (the click). */
async function startMerge(fixture: Fixture, input: Record<string, unknown>) {
  const tool = fixture.tools.find((candidate) => candidate.descriptor.id === MERGE_TOOL);
  assert.ok(tool);
  const emitted: unknown[] = [];
  const pending = tool.handler(context(input), { emitSurface: async (surface) => void emitted.push(surface) });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(emitted.length, 1, "exactly one confirm dialog is shown");
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the dialog carries its exchange id");
  const answer = (decision: "confirm" | "cancel") => fixture.surfaceExchanges.deliver({ exchangeId: match[1]!, principalId: PRINCIPAL_ID, params: { decision } }, { toolId: MERGE_TOOL });
  return { pending, answer };
}

test("(a) registration ids and their order", () => {
  assert.deepStrictEqual(makeFixture().tools.map((tool) => tool.descriptor.id), [...TOOL_IDS]);
});

test("(b) every descriptor equals the committed golden, metadata included", () => {
  const { tools } = makeFixture();
  assert.deepStrictEqual(Object.keys(GOLDEN), [...TOOL_IDS]);
  for (const tool of tools) {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(tool.descriptor)), GOLDEN[tool.descriptor.id], tool.descriptor.id);
  }
});

test("(c) the derived-risk map and the contributor identity", () => {
  const contributor = contributeTaxonomyTools();
  assert.deepStrictEqual([...contributor.risk.entries()], DERIVED_RISK.map(([id, risk]) => [id, risk]));
  assert.equal(contributor.domain, "taxonomy");
});

const DENIED: ReadonlyArray<{ id: string; input: Record<string, unknown>; permission: string; cls: string; coded: boolean }> = [
  { id: "taxonomy_get_term", input: { termId: "t1" }, permission: "admin.taxonomy.manage", cls: "ToolInputError", coded: true },
  { id: "taxonomy_list", input: {}, permission: "admin.taxonomy.manage", cls: "ForbiddenError", coded: false },
  { id: "taxonomy_get_assigned_terms", input: { contentType: "post", contentId: "c" }, permission: "admin.taxonomy.manage", cls: "ToolInputError", coded: true },
  { id: "taxonomy_create_taxonomy", input: { name: "Tags" }, permission: "admin.taxonomy.manage", cls: "ForbiddenError", coded: false },
  { id: "taxonomy_create_term", input: { taxonomyId: "x", name: "A" }, permission: "admin.taxonomy.manage", cls: "ForbiddenError", coded: false },
  { id: "taxonomy_rename_term", input: { termId: "t", newName: "B" }, permission: "admin.taxonomy.manage", cls: "ForbiddenError", coded: false },
  { id: "taxonomy_assign_terms", input: { contentType: "post", contentId: "c", termIds: ["t"] }, permission: "content.write", cls: "ForbiddenError", coded: false },
  { id: "taxonomy_unassign_terms", input: { contentType: "post", contentId: "c", termIds: ["t"] }, permission: "content.write", cls: "ForbiddenError", coded: false },
  { id: "taxonomy_plan_merge_term", input: { fromTermId: "a", intoTermId: "b" }, permission: "admin.taxonomy.manage", cls: "ForbiddenError", coded: false },
];

test("(d) a principal without the permission gets the same error class, code and message", async () => {
  const fixture = makeFixture({ allow: false });
  for (const { id, input, permission, cls, coded } of DENIED) {
    const tail = `principal '${PRINCIPAL_ID}' is not authorized for '${permission}' (insufficient_permission)`;
    await assert.rejects(() => fixture.call(id, input), (error: Error) => {
      assert.equal(error.constructor.name, cls, id);
      assert.equal(error.message, coded ? `TAXONOMY_FORBIDDEN: ${tail}` : tail, id);
      return true;
    });
  }
});

test("(e) one success call per tool returns the same view, and the writes enqueue the same events in order", async () => {
  const fixture = makeFixture();
  const { taxonomyId, fromTermId, intoTermId } = await seed(fixture);
  assert.deepStrictEqual(fixture.outboxEvents, ["taxonomy.created", "taxonomy.term_created", "taxonomy.term_created", "taxonomy.terms_assigned"]);
  const term = (id: string, name: string, version = 1) => ({ id, taxonomyId, parentId: null, name, status: "active", updatedAt: NOW, version });
  assert.deepStrictEqual(await fixture.call("taxonomy_rename_term", { termId: intoTermId, newName: "Beta2" }), { term: term(intoTermId, "Beta2", 2) });
  assert.deepStrictEqual(await fixture.call("taxonomy_get_term", { termId: fromTermId }), { term: term(fromTermId, "Alpha") });
  assert.deepStrictEqual(await fixture.call("taxonomy_list", {}), {
    items: [{ taxonomy: { id: taxonomyId, name: "Topic", hierarchical: false, status: "active", updatedAt: NOW, version: 1 }, terms: [term(fromTermId, "Alpha"), term(intoTermId, "Beta2", 2)] }],
  });
  assert.deepStrictEqual(await fixture.call("taxonomy_get_assigned_terms", { contentType: "post", contentId: "post-1" }), {
    contentType: "post", contentId: "post-1", terms: [{ termId: fromTermId, name: "Alpha", slug: "alpha", taxonomyId, taxonomyName: "Topic" }],
  });
  const plan = (await fixture.call("taxonomy_plan_merge_term", { fromTermId, intoTermId })) as { planId: string; planHash: string; details: unknown };
  assert.deepStrictEqual(plan.details, { fromTermId, intoTermId, overlapLossDisclosed: false, overlappingContentCount: 0 });
  assert.deepStrictEqual(await fixture.call("taxonomy_unassign_terms", { contentType: "post", contentId: "post-1", termIds: [fromTermId, intoTermId] }), {
    contentType: "post", contentId: "post-1", unassignedTermIds: [fromTermId], notAssignedTermIds: [intoTermId],
  });
  assert.deepStrictEqual(fixture.outboxEvents, ["taxonomy.created", "taxonomy.term_created", "taxonomy.term_created", "taxonomy.terms_assigned", "taxonomy.term_renamed", "taxonomy.terms_unassigned"]);
});

test("(e) merge: confirmed -> merges once; declined -> no repo write; (f) a stale plan is refused", async () => {
  const confirmed = makeFixture();
  const seeded = await seed(confirmed);
  const first = await startMerge(confirmed, { fromTermId: seeded.fromTermId, intoTermId: seeded.intoTermId });
  assert.deepStrictEqual(first.answer("confirm"), { ok: true });
  assert.deepStrictEqual(await first.pending, { merged: true, mergedCount: 1 });
  assert.equal(await confirmed.entryTermRepo.countByTerm({ termId: seeded.fromTermId }), 0);
  assert.equal(await confirmed.entryTermRepo.countByTerm({ termId: seeded.intoTermId }), 1);
  assert.equal((await confirmed.termRepo.findByIdFull({ id: seeded.fromTermId }))?.status, "deprecated");

  const declined = makeFixture();
  const other = await seed(declined);
  const eventsBefore = [...declined.outboxEvents];
  const snapshot = JSON.stringify([declined.entryTermRepo, declined.termRepo]);
  const second = await startMerge(declined, { fromTermId: other.fromTermId, intoTermId: other.intoTermId });
  second.answer("cancel");
  assert.deepStrictEqual(await second.pending, { merged: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
  assert.equal(JSON.stringify([declined.entryTermRepo, declined.termRepo]), snapshot, "no repo write");
  assert.deepStrictEqual(declined.outboxEvents, eventsBefore, "no outbox call");

  const stale = makeFixture();
  const third = await seed(stale);
  const dialog = await startMerge(stale, { fromTermId: third.fromTermId, intoTermId: third.intoTermId });
  await stale.call("taxonomy_assign_terms", { contentType: "post", contentId: "post-1", termIds: [third.intoTermId] });
  dialog.answer("confirm");
  await assert.rejects(() => dialog.pending, (error: Error) => {
    assert.ok(error instanceof PlanStaleError);
    assert.equal(error.message, STALE_MESSAGE);
    return true;
  });
  assert.equal(await stale.entryTermRepo.countByTerm({ termId: third.fromTermId }), 1, "the stale merge changed nothing");
});

test("(g) assigning to a content type off the allow-list is refused", async () => {
  const fixture = makeFixture();
  const { fromTermId } = await seed(fixture);
  await assert.rejects(() => fixture.call("taxonomy_assign_terms", { contentType: "widget", contentId: "w", termIds: [fromTermId] }), (error: Error) => {
    assert.equal(error.constructor.name, "ToolInputError");
    assert.equal(error.message, "content type 'widget' does not support taxonomy assignments. Use post, page, or a live collection key.");
    return true;
  });
});

