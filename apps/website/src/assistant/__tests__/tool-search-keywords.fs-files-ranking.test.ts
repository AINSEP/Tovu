import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

/**
 * @file Search-ranking evidence for `fs_list_files`/`fs_read_file` (SPEC-053). The owner dropped
 * `/Users/la/Desktop/fake` onto the admin chat and asked "whats in this folder?"; the custom root was
 * set correctly, but the model — which only sees the `search_tools` meta-tool surface — answered
 * that it had "no general-purpose local filesystem browsing tool" and never called either tool.
 * Both had no entry in `TOOL_SEARCH_KEYWORDS` or the doc2query map, so the operator's words
 * ("folder", "directory", "my computer") were never indexed.
 *
 * Same harness as `tool-search-keywords.backfill-ranking.test.ts`: the real catalog, built the way
 * both boot paths build it.
 */

interface RankingCase {
  /** How an operator actually phrases the request. */
  readonly query: string;
  readonly expect: string;
}

const CASES: readonly RankingCase[] = [
  { query: "/Users/la/Desktop/fake - whats in this folder?", expect: "fs_list_files" },
  { query: "list the files in a folder on my computer", expect: "fs_list_files" },
  { query: "look inside this directory I dropped", expect: "fs_list_files" },
  { query: "read a file from a local folder on my machine", expect: "fs_read_file" },
];

const SEARCH_LIMIT = 10;
const TOP_N = 3;

async function buildCatalog() {
  resetToolContributorsForTests();
  installFirstPartyToolContributors();
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;
  // Both boot paths build the limiter themselves and add it to `routeDeps`; `AssistantToolRegistryDeps`
  // requires it, so passing bare `routeDeps` does not type-check.
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const registry = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations({ ...routeDeps, magicLinkPerEmailLimiter })) {
    registry.register(registration);
  }
  return buildToolCatalogQuery(registry);
}

test("an operator asking about a dropped or local folder finds the fs-files tools in the top 3", async () => {
  const catalog = await buildCatalog();
  const misses = CASES.flatMap((c) => {
    const hits = catalog.search(c.query, SEARCH_LIMIT);
    const index = hits.findIndex((hit) => hit.id === c.expect);
    const rank = index === -1 ? null : index + 1;
    return rank !== null && rank <= TOP_N
      ? []
      : [`"${c.query}" -> ${c.expect} rank ${rank ?? "MISS"} (top hit: ${hits[0]?.id ?? "(none)"})`];
  });
  assert.deepEqual(misses, []);
});
