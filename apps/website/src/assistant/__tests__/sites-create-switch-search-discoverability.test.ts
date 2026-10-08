/**
 * `sites_create_site` / `sites_switch_site` (2026-10-05) rank in the top 3 of the real FTS5 catalog
 * for plain owner phrasings. In-sample discoverability checks (same shape as
 * `admin-parity-search-discoverability.test.ts`), not a blind eval.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { realToolCatalog } from "./real-tool-catalog.fixture.js";

const CASES: Record<string, string[]> = {
  sites_create_site: ["create a new site", "make a new website for another client", "start a blank site", "add another site"],
  sites_switch_site: ["switch to my other site", "switch site", "activate a different site", "change which site is being served"],
};
test("sites create/switch tools rank in the top 3 of the real catalog", async () => {
  const { catalog } = await realToolCatalog();
  const misses: string[] = [];
  for (const [id, queries] of Object.entries(CASES)) {
    for (const query of queries) {
      const hits = catalog.search({ query }, { limit: 3 }).map(hit => hit.id);
      if (!hits.includes(id)) misses.push(`${id}: "${query}" -> ${hits.join(", ")}`);
    }
  }
  assert.deepEqual(misses, [], `queries that missed the top 3:\n${misses.join("\n")}`);
});
