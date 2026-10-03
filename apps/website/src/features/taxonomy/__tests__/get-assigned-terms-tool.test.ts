import assert from "node:assert/strict";
import test from "node:test";
import { isReadOnlyTool, ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { buildTaxonomyRegistrations, taxonomyDerivedRisk } from "../tool-registrations.js";

const ctx = (input: unknown): ToolExecutionContext => ({ executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input, signal: new AbortController().signal });
async function harness() {
  const deps = createRouteDeps();
  await deps.identityReady;
  await deps.settingsReady;
  deps.authorize = async () => ({ allowed: true, reason: "fixture grant" });
  const call = (id: string, input: unknown) => {
    const tool = buildTaxonomyRegistrations(deps).find((r) => r.descriptor.id === id);
    assert.ok(tool, `expected '${id}' to be wired`);
    return tool.handler(ctx(input));
  };
  return { deps, call };
}

test("resolves term and taxonomy names and sorts by taxonomy then term name", async () => {
  const { deps, call } = await harness();
  const { taxonomy: tags } = await call("taxonomy_create_taxonomy", { name: "Tags" }) as any;
  const { taxonomy: categories } = await call("taxonomy_create_taxonomy", { name: "Categories" }) as any;
  const { term: zebra } = await call("taxonomy_create_term", { taxonomyId: tags.id, name: "Zebra" }) as any;
  const { term: apple } = await call("taxonomy_create_term", { taxonomyId: tags.id, name: "Apple" }) as any;
  const { term: news } = await call("taxonomy_create_term", { taxonomyId: categories.id, name: "News" }) as any;
  const target = { contentType: "post", contentId: "post-home" };
  await call("taxonomy_assign_terms", { ...target, termIds: [zebra.id, apple.id, news.id] });
  const before = await deps.entryTermRepo.listForContent(target);
  assert.deepEqual(await call("taxonomy_get_assigned_terms", target), { ...target, terms: [
    { termId: news.id, name: "News", slug: "news", taxonomyId: categories.id, taxonomyName: "Categories" },
    { termId: apple.id, name: "Apple", slug: "apple", taxonomyId: tags.id, taxonomyName: "Tags" },
    { termId: zebra.id, name: "Zebra", slug: "zebra", taxonomyId: tags.id, taxonomyName: "Tags" },
  ] });
  assert.deepEqual(await deps.entryTermRepo.listForContent(target), before);
  assert.deepEqual(await call("taxonomy_get_assigned_terms", { ...target, contentId: "untagged" }), { ...target, contentId: "untagged", terms: [] });
});

test("both route permissions are required before assignment reads", async () => {
  const { deps, call } = await harness();
  deps.entryTermRepo.listForContent = async () => assert.fail("denied assignment read");
  for (const permission of ["admin.taxonomy.manage", "content.write", "admin.collections.manage"]) {
    deps.authorize = async (request) => ({ allowed: request.permission !== permission, reason: "fixture grant" });
    await assert.rejects(() => call("taxonomy_get_assigned_terms", { contentType: permission === "admin.collections.manage" ? "recipe" : "post", contentId: "id" }), { name: "ToolInputError", message: `TAXONOMY_FORBIDDEN: principal 'owner' is not authorized for '${permission}' (fixture grant)` });
  }
});

test("unknown content type refuses with the assign tool's exact validation text", async () => {
  const { call } = await harness();
  const { taxonomy } = await call("taxonomy_create_taxonomy", { name: "Tags" }) as any;
  const { term } = await call("taxonomy_create_term", { taxonomyId: taxonomy.id, name: "One" }) as any;
  const expected = "content type 'unknown' does not support taxonomy assignments. Use post, page, or a live collection key.";
  await assert.rejects(() => call("taxonomy_assign_terms", { contentType: "unknown", contentId: "id", termIds: [term.id] }), { name: "ToolInputError", message: expected });
  await assert.rejects(() => call("taxonomy_get_assigned_terms", { contentType: "unknown", contentId: "id" }), { name: "ToolInputError", message: expected });
});

test("input strings match assign validation and the descriptor remains readOnly", async () => {
  const { deps, call } = await harness();
  await assert.rejects(() => call("taxonomy_get_assigned_terms", { contentType: "post" }), { name: "ToolInputError", message: "'contentId' (non-empty string) is required" });
  await assert.rejects(() => call("taxonomy_assign_terms", { contentType: "post", termIds: [] }), { name: "ToolInputError", message: "'contentId' (non-empty string) is required" });
  const tool = buildTaxonomyRegistrations(deps).find((r) => r.descriptor.id === "taxonomy_get_assigned_terms");
  assert.ok(tool, "expected 'taxonomy_get_assigned_terms' to be wired");
  assert.equal(isReadOnlyTool({ descriptor: tool.descriptor }), true);
  assert.equal(taxonomyDerivedRisk.get("taxonomy_get_assigned_terms"), "none");
});

test("a live collection key uses the same open contentType schema as assignment", async () => {
  const { deps, call } = await harness();
  await deps.contentTypeRepo.save({ workspaceId: deps.workspaceId, key: "recipe", label: "Recipes", fields: [], status: "active", version: 1 });
  assert.deepEqual(await call("taxonomy_get_assigned_terms", { contentType: "recipe", contentId: "untagged" }), { contentType: "recipe", contentId: "untagged", terms: [] });
  const tools = buildTaxonomyRegistrations(deps);
  const read = tools.find((r) => r.descriptor.id === "taxonomy_get_assigned_terms")!.descriptor.inputSchema as any;
  const assign = tools.find((r) => r.descriptor.id === "taxonomy_assign_terms")!.descriptor.inputSchema as any;
  assert.deepEqual(read.properties.contentType, assign.properties.contentType);
});
