import assert from "node:assert/strict";
import test from "node:test";

import { createByokToolSurface } from "#src/assistant/index";
import { registerInstalledExtensionTools } from "#src/server/runtime/composition/installed-extension-tools";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";

import { MIN_EXPECTED_TOOL_COUNT, fakeEvalRouteDeps } from "../../../../../../development/evals/tool-search-eval-registry.js";

/**
 * @file Proves `pages_move_region` is REACHABLE through `search_tools` over the real installed
 * catalog — same harness and reasoning as `write-region-discovery.integration.test.ts`.
 *
 * The first two queries are VERBATIM from chat "Can You See Higgsfield Plugin" (2026-10-01), where
 * the assistant searched for exactly this capability twice, found nothing, and refused the owner's
 * "just swap them".
 */

const PRINCIPAL = { id: "admin-1", kind: "user" } as never;
const RUN = { id: "run-move-discovery" } as never;

function surface() {
  installFirstPartyToolContributors();
  return createByokToolSurface(fakeEvalRouteDeps() as never, { registerInstalledExtensions: registerInstalledExtensionTools });
}

async function rankedIds(query: string): Promise<string[]> {
  const result = await surface().executeMetaTool(PRINCIPAL, RUN, { name: "search_tools", input: { query, limit: 5 } });
  const payload = result as { content: string; isError?: boolean };
  assert.ok(!payload.isError, `search_tools returned an error for "${query}": ${payload.content}`);
  return (JSON.parse(payload.content) as { hits: { id: string }[] }).hits.map((hit) => hit.id);
}

test("the surface under test is the real, fully-installed catalog", () => {
  assert.ok(surface().registry.list().length >= MIN_EXPECTED_TOOL_COUNT);
});

const MOVE_PHRASINGS = [
  "reorder or move a section block within a page, swap section order on a page body",
  "move a page region before or after another region by handle, reorder regions of an HTML page",
  "swap two sections on the landing page",
  "move the pricing section above the faq",
];

for (const phrasing of MOVE_PHRASINGS) {
  test(`search_tools ranks pages_move_region FIRST for '${phrasing}'`, async () => {
    const ids = await rankedIds(phrasing);
    assert.equal(ids[0], "pages_move_region", `got ${ids.join(", ") || "(nothing)"}`);
  });
}
