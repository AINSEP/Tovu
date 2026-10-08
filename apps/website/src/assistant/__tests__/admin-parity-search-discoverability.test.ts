/**
 * n07 admin-parity acceptance checks against the real first-party FTS5 catalog.
 * These task-derived phrasings are in-sample discoverability checks, not a blind eval.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { realToolCatalog } from "./real-tool-catalog.fixture.js";

const CASES: Record<string, string[]> = {
  identity_policy_list_permissions: ["what permissions does this policy grant", "show policy permission rows", "what can this role do", "list policy permissions"],
  sites_list: ["list local sites", "which client sites are on this computer", "which site is serving and which is queued", "show sites registry"],
  publish_content_disconnect: ["disconnect from the live site", "stop this computer publishing to the destination", "disconnect publishing", "forget my connected publish destination"],
  theme_set_page_published: ["publish the theme about page", "unpublish a standalone theme page", "hide the theme pricing page", "set theme page published state"],
};
test("admin parity tools rank in the top 3 of the real catalog", async () => {
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
