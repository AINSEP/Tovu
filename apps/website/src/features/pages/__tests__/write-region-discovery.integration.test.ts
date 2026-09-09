import assert from "node:assert/strict";
import test from "node:test";

import { createByokToolSurface } from "#src/assistant/index";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";

import { MIN_EXPECTED_TOOL_COUNT, fakeEvalRouteDeps } from "../../../../../../development/evals/tool-search-eval-registry.js";

/**
 * @file Proves `pages_write_region` is REACHABLE, not merely registered.
 *
 * `byok-tool-surface.ts` publishes three meta-tools to the model — `search_tools`, `describe_tool`,
 * `execute_delegated_tool` — and nothing else. All 171 real tools are behind that search. A tool the
 * model cannot FIND is functionally a tool that does not exist (`tool-search-keywords.ts`'s own
 * header states this as the reason that file exists at all), so "the registration is wired" is not
 * the property that matters here; "an operator's phrasing ranks it first" is.
 *
 * ## Why this drives the real surface rather than a hand-seeded catalog
 *
 * `media-import-search-discoverability.test.ts` — the house precedent — seeds three real sibling
 * catalogs plus four distractors and ranks through `buildToolCatalogQuery`. That is right for
 * proving a tool beats its siblings. It is not sufficient here, because the competitor this tool has
 * to beat is not a sibling: it is `pages_write_html`, which for a year has been the ONLY answer to
 * every page question and therefore the tool the model has every reason to reach for. Beating it in
 * a seven-tool fixture would prove nothing. So this composes the real
 * `createByokToolSurface(...)` — the same function `server/modules/assistant-byok.ts` composes at
 * boot — over the full installed catalog, and calls `executeMetaTool` exactly as a BYOK turn does.
 * `MIN_EXPECTED_TOOL_COUNT` is asserted first because a catalog that silently built without its
 * contributed domains would score every query against nine tools and pass this file trivially (see
 * `tool-search-eval-registry.ts`'s header for the audit where nine suites had exactly that bug).
 *
 * `fakeEvalRouteDeps` is imported from `development/evals/` rather than re-rolled: it is the
 * permissive, database-free `RouteDeps` every tool-search suite in the repo already shares, and its
 * own doc offers it as a convenience export. A local copy is one more place the composition root's
 * required fields can drift out from under a test.
 *
 * ## What this file does NOT claim
 *
 * It does not prove a live model chooses the tool — that is end-to-end verification through the
 * admin chat, which is deliberately not attempted here. And it does not execute the tool through
 * `execute_delegated_tool`: this surface is built over `fakeEvalRouteDeps`, which has no page store,
 * so an execution here would test the fake. Behavior is certified against real stores in
 * `tool-registrations.write-region.test.ts`.
 */

const PRINCIPAL = { id: "admin-1", kind: "user" } as never;
const RUN = { id: "run-discovery" } as never;

interface SearchHit {
  id: string;
  score: number;
}

function surface() {
  installFirstPartyToolContributors();
  return createByokToolSurface(fakeEvalRouteDeps() as never);
}

async function rankedIds(query: string): Promise<SearchHit[]> {
  const result = await surface().executeMetaTool(PRINCIPAL, RUN, { name: "search_tools", input: { query, limit: 5 } });
  const payload = result as { content: string; isError?: boolean };
  assert.ok(!payload.isError, `search_tools returned an error for "${query}": ${payload.content}`);
  return (JSON.parse(payload.content) as { hits: SearchHit[] }).hits;
}

test("the surface under test is the real, fully-installed catalog — not a nine-tool skeleton that would pass every ranking assertion for free", () => {
  const size = surface().registry.list().length;
  assert.ok(
    size >= MIN_EXPECTED_TOOL_COUNT,
    `expected the full installed catalog (>= ${MIN_EXPECTED_TOOL_COUNT} tools); got ${size} — installFirstPartyToolContributors() did not take effect`
  );
});

/**
 * Each of these is an operator asking for a one-section edit, and each must outrank
 * `pages_write_html` — landing on the full rewriter IS the defect this tool exists to close, since
 * that is a ~42KB re-emission with every other section of the page at risk.
 */
const ONE_SECTION_PHRASINGS = [
  "edit one section of a page without rewriting it",
  "just change the headline on our landing page",
  "update the pricing section but leave the rest of the page alone",
  "reword the call to action on this page",
  "fix the wording in the hero of that page",
];

for (const phrasing of ONE_SECTION_PHRASINGS) {
  test(`search_tools ranks pages_write_region FIRST for '${phrasing}'`, async () => {
    const hits = await rankedIds(phrasing);
    assert.equal(
      hits[0]?.id,
      "pages_write_region",
      `landing on anything else here is the incident — got ${hits.map((hit) => hit.id).join(", ") || "(nothing)"}`
    );
  });
}

/**
 * The other half of the discrimination, and the reason both writers' vocabularies were written in
 * opposition rather than as the union of both: adding a region editor must not cannibalize the tool
 * that is genuinely correct for "make me a new page".
 */
const WHOLE_PAGE_PHRASINGS = ["build me a landing page", "rewrite the whole page from scratch"];

for (const phrasing of WHOLE_PAGE_PHRASINGS) {
  test(`search_tools still ranks pages_write_html FIRST for '${phrasing}' — the region tool did not cannibalize it`, async () => {
    const hits = await rankedIds(phrasing);
    assert.equal(hits[0]?.id, "pages_write_html", `got ${hits.map((hit) => hit.id).join(", ")}`);
  });
}

test("search_tools still ranks pages_read_html first for a read", async () => {
  const hits = await rankedIds("what html is on this page right now");
  assert.equal(hits[0]?.id, "pages_read_html", `got ${hits.map((hit) => hit.id).join(", ")}`);
});

test("describe_tool returns pages_write_region's real schema — the handle, the fragment, and the version basis", async () => {
  const result = await surface().executeMetaTool(PRINCIPAL, RUN, { name: "describe_tool", input: { id: "pages_write_region" } });
  const payload = result as { content: string; isError?: boolean };
  assert.ok(!payload.isError, `describe_tool errored: ${payload.content}`);

  const entry = JSON.parse(payload.content) as {
    id: string;
    description: string;
    inputSchema?: { required?: string[]; properties?: Record<string, unknown> };
  };
  assert.equal(entry.id, "pages_write_region");
  assert.deepEqual(entry.inputSchema?.required, ["id", "handle", "html"]);
  assert.ok(entry.inputSchema?.properties?.expectedVersion, "the optimistic-concurrency basis must be describable, or the model cannot send one");

  // The one instruction the model cannot recover from getting wrong — sending the region element
  // back would nest a second one inside the first rather than replace it — must survive any later
  // trim of this description.
  assert.match(entry.description, /INNER CONTENT ONLY/);
  assert.match(entry.description, /must NOT be re-emitted/);
});
