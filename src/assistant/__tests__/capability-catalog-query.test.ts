import assert from "node:assert/strict";
import test from "node:test";

import type { CapabilityCard } from "../capability-source-registry.js";
import { buildCapabilityCatalogQuery } from "../capability-catalog-query.js";

/**
 * @file Tests this module's OWN contract: a local FTS5 + `bm25()` index built from an already-
 * gathered `readonly CapabilityCard[]` (the async multi-source gather itself is
 * `capability-tool-registrations.ts`'s job, not this module's — see that file's header). Covers the
 * cases the dispatch scoped into this file rather than a fourth tool-handler test file: the
 * missing/empty-argument rejections and the handle/absolute-path leak check, both asserted here
 * because `capability_search`/`capability_get`'s handlers are thin wrappers over exactly these two
 * functions and add no validation of their own.
 *
 * Ranking internals beyond what this module's own SQL adds (BM25 scoring, FTS5 tokenization) are
 * SQLite's own tested behavior, not re-derived here — this file only checks the wiring this module
 * is responsible for: schema, kind filtering, and the handle boundary.
 */

function card(overrides: Partial<CapabilityCard> & Pick<CapabilityCard, "id">): CapabilityCard {
  return {
    kind: "agent-plugin-skill",
    pluginId: "test-plugin",
    skillName: "test-skill",
    revision: "digestabc123",
    name: "Test Card",
    description: "A fake card for exercising the catalog query.",
    keywords: ["test"],
    source: "agent-plugin-skills",
    handle: { packageRoot: "/does/not/matter", skillPath: "skills/test/SKILL.md" },
    ...overrides,
  };
}

test("search finds a card by a name/description term match", () => {
  const catalog = buildCapabilityCatalogQuery([
    card({ id: "a", name: "UI UX Design", description: "Design guidance for interfaces." }),
    card({ id: "b", name: "Coffee Roasting", description: "How to roast beans." }),
  ]);
  const hits = catalog.search("design").map((hit) => hit.id);
  assert.deepEqual(hits, ["a"]);
});

test("search returns an empty array, not an error, for no matches", () => {
  const catalog = buildCapabilityCatalogQuery([card({ id: "a" })]);
  assert.deepEqual(catalog.search("nonexistent-keyword-xyz"), []);
});

test("search respects the limit option", () => {
  const catalog = buildCapabilityCatalogQuery([
    card({ id: "a", description: "widget widget widget" }),
    card({ id: "b", description: "widget widget" }),
    card({ id: "c", description: "widget" }),
  ]);
  assert.equal(catalog.search("widget", { limit: 1 }).length, 1);
});

test("search throws exact text for a missing query", () => {
  const catalog = buildCapabilityCatalogQuery([card({ id: "a" })]);
  assert.throws(() => catalog.search(undefined as unknown as string), {
    message: "capability_search: 'query' (non-empty string) is required",
  });
});

test("search throws exact text for an empty-string query", () => {
  const catalog = buildCapabilityCatalogQuery([card({ id: "a" })]);
  assert.throws(() => catalog.search(""), {
    message: "capability_search: 'query' (non-empty string) is required",
  });
  assert.throws(() => catalog.search("   "), {
    message: "capability_search: 'query' (non-empty string) is required",
  });
});

test("get throws exact text for a missing/empty id", () => {
  const catalog = buildCapabilityCatalogQuery([card({ id: "a" })]);
  assert.throws(() => catalog.get(undefined as unknown as string), {
    message: "capability_get: 'id' (non-empty string) is required",
  });
  assert.throws(() => catalog.get(""), {
    message: "capability_get: 'id' (non-empty string) is required",
  });
});

test("get throws exact text for an unknown id", () => {
  const catalog = buildCapabilityCatalogQuery([card({ id: "a" })]);
  assert.throws(() => catalog.get("nonexistent-id"), {
    message: "capability_get: no capability found for id 'nonexistent-id'",
  });
});

test("get returns the full card, including handle, for a known id", () => {
  const theCard = card({ id: "a", handle: { packageRoot: "/pkg/root", skillPath: "skills/a/SKILL.md" } });
  const catalog = buildCapabilityCatalogQuery([theCard]);
  assert.deepEqual(catalog.get("a"), theCard);
});

test("a multi-word keyword round-trips through get() with full fidelity", () => {
  const theCard = card({ id: "a", keywords: ["ui ux", "content injection"] });
  const catalog = buildCapabilityCatalogQuery([theCard]);
  assert.deepEqual(catalog.get("a").keywords, ["ui ux", "content injection"]);
});

test("a multi-word keyword round-trips through search() with full fidelity", () => {
  const catalog = buildCapabilityCatalogQuery([card({ id: "a", name: "Findable", keywords: ["ui ux", "content injection"] })]);
  const hit = catalog.search("findable")[0];
  assert.deepEqual(hit?.keywords, ["ui ux", "content injection"]);
});

// ---------------------------------------------------------------------------
// The handle boundary — search() must never expose it, structurally or serialized
// ---------------------------------------------------------------------------

test("search output carries no handle field and no absolute path — asserted on the SERIALIZED payload", () => {
  const absolutePath = "/Users/la/Programming/Tovu/infra/agent-plugins/ws/workspace-local/packages/sha256/abc123";
  const catalog = buildCapabilityCatalogQuery([
    card({ id: "a", name: "Findable Skill", handle: { packageRoot: absolutePath, skillPath: "skills/a/SKILL.md" } }),
  ]);
  const hits = catalog.search("findable");
  assert.equal(hits.length, 1);

  const serialized = JSON.stringify(hits);
  assert.ok(!serialized.includes(absolutePath), "serialized search output must not contain the handle's absolute path");
  assert.ok(!serialized.includes("handle"), "serialized search output must not contain a 'handle' key at all");
  assert.equal("handle" in (hits[0] as object), false, "search hit must not carry a handle field structurally either");
});

// ---------------------------------------------------------------------------
// kind filter applied in SQL before ranking, not as a post-filter
// ---------------------------------------------------------------------------
//
// Fixture: five kind-"A" cards whose description repeats the query term heavily (high term
// frequency, short document -> high bm25 rank) and exactly one kind-"B" card that mentions the term
// only once (weaker rank). Verified below WITHOUT a kind filter that the A cards really do outrank
// the B card for this query -- that is the premise the differential test depends on, not an
// assumption. A post-filter implementation (search unfiltered, slice to `limit`, THEN drop
// non-matching kinds) would then return an EMPTY result for `{kind: "B", limit: 1}`, because the
// unfiltered top-1 is an A card the post-filter would discard. Filtering inside the SQL WHERE clause
// (this module's actual implementation) never lets an A row compete for the limited slot at all, so
// the true kind-"B" card is returned regardless of how the A cards rank.
test("without a kind filter, the heavily-repeated-term A cards outrank the weaker B card (fixture sanity check)", () => {
  const catalog = buildCapabilityCatalogQuery([
    ...Array.from({ length: 5 }, (_, i) => card({ id: `a-${i}`, kind: "A", description: "widget widget widget widget widget" })),
    card({ id: "b-0", kind: "B", description: "A helper related to widget assembly sometimes." }),
  ]);
  const topHit = catalog.search("widget", { limit: 1 })[0];
  assert.equal(topHit?.kind, "A", "fixture premise failed: the B card must NOT rank first when unfiltered");
});

test("a kind filter is applied in SQL before the limit, not as a post-filter over the ranked results", () => {
  const catalog = buildCapabilityCatalogQuery([
    ...Array.from({ length: 5 }, (_, i) => card({ id: `a-${i}`, kind: "A", description: "widget widget widget widget widget" })),
    card({ id: "b-0", kind: "B", description: "A helper related to widget assembly sometimes." }),
  ]);
  const hits = catalog.search("widget", { kind: "B", limit: 1 });
  assert.deepEqual(hits.map((hit) => hit.id), ["b-0"]);
});

test("kind filter with no matches returns an empty array, not every kind", () => {
  const catalog = buildCapabilityCatalogQuery([card({ id: "a", kind: "A", description: "widget" })]);
  assert.deepEqual(catalog.search("widget", { kind: "nonexistent-kind" }), []);
});

test("an empty card list builds and queries without throwing", () => {
  const catalog = buildCapabilityCatalogQuery([]);
  assert.deepEqual(catalog.search("anything"), []);
  assert.throws(() => catalog.get("anything"), { message: "capability_get: no capability found for id 'anything'" });
});
