import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";

import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";

import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

/**
 * @file Regression guard for the 2026-10-01 tool-search eval
 * (`ADS-memory/.local-artifacts/tool-gaps/search-eval/REPORT.md`): 127 operator requests, raw text
 * as the query (the worst case — in production the model rewrites the query first), run against the
 * real catalog built the way both boot paths build it. The fixture is that eval's `requests.json`,
 * unchanged.
 *
 * The cutoff is the report's HIT line: an expected tool in the top 3, which is the shortlist
 * `byok-tool-surface.ts` tells the model to inspect. Before that batch's keyword additions this was
 * 81 of 105 scoreable requests; after, 100. Requests with an empty `expect` are the report's
 * NO-TOOL cases (no tool does it) and are not scored.
 *
 * This set shaped the keywords, so it is in-sample: it proves the additions stay in place, not
 * that they generalize. The blind number is `development/evals/tool-search-heldout-v2.eval.ts`.
 */

interface OperatorRequest {
  readonly id: string;
  readonly area: string;
  readonly query: string;
  readonly expect: readonly string[];
}

const REQUESTS: readonly OperatorRequest[] = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "fixtures", "tool-search-operator-requests.json"), "utf8"),
);

/** Requests still outside the top 3 after the 2026-10-01 additions, and why. Remove an id once it passes. */
const KNOWN_GAPS: ReadonlyMap<string, string> = new Map([
  ["pg-04", "typo 'delte': exact-token index, the model's query rewrite fixes it"],
  ["fm-07", "typo 'submisions': same"],
  ["nl-03", "typo 'newsleter': same"],
  ["md-02", "alt text for images ranks the media read card first; the update tool is 4th"],
  ["mn-05", "menus have no delete tool of their own; trash_item reaches them but ranks 10th"],
]);

const SEARCH_LIMIT = 20;
const TOP_N = 3;

async function buildCatalog() {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const routeDeps = createRouteDeps();
  await routeDeps.identityReady;
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const registry = createToolRegistry({});
  for (const registration of buildAssistantToolRegistrations({ ...routeDeps, magicLinkPerEmailLimiter }, undefined, { contributions })) {
    registry.register(registration);
  }
  return { catalog: buildToolCatalogQuery(registry), ids: new Set(registry.list({}).map((d) => d.id)) };
}

test("the fixture names only tools that exist, and every known gap is a scored request", async () => {
  const { ids } = await buildCatalog();
  const unknown = REQUESTS.flatMap((r) => r.expect.filter((id) => !ids.has(id)).map((id) => `${r.id}: ${id}`));
  assert.deepEqual(unknown, []);
  const scored = new Set(REQUESTS.filter((r) => r.expect.length > 0).map((r) => r.id));
  assert.deepEqual([...KNOWN_GAPS.keys()].filter((id) => !scored.has(id)), []);
});

test("every operator request with a tool finds it in the top 3 of search_tools", async () => {
  const { catalog } = await buildCatalog();
  const misses = REQUESTS.filter((r) => r.expect.length > 0 && !KNOWN_GAPS.has(r.id)).flatMap((r) => {
    const hits = catalog.search({ query: r.query }, { limit: SEARCH_LIMIT }).map((hit) => hit.id);
    const ranks = r.expect.map((id) => hits.indexOf(id)).filter((i) => i >= 0);
    const best = ranks.length > 0 ? Math.min(...ranks) + 1 : null;
    return best !== null && best <= TOP_N
      ? []
      : [`${r.id} "${r.query}" -> ${r.expect.join("|")} rank ${best ?? "MISS"} (top: ${hits.slice(0, 3).join(", ")})`];
  });
  assert.deepEqual(misses, []);
});
