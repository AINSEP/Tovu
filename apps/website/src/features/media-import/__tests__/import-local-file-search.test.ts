import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createToolRegistry } from "@jini-ai/core";
import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "../../../contracts/core/rate-limit/rate-limit.js";
import { createRouteDeps } from "../../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../../server/runtime/composition/tool-catalog-manifest.js";

import { buildAssistantToolRegistrations } from "../../../assistant/tool-registrations.js";
import { buildToolCatalogQuery } from "../../../assistant/tool-catalog-query.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

/** t06: full production catalog and real SQLite FTS ranking, including all competing tools. */
async function realCatalog() {
  contributions.contributors.clear({});
  installFirstPartyToolContributors({ contributions });
  const deps = createRouteDeps();
  await deps.identityReady;
  const registry = createToolRegistry({});
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock });
  for (const registration of buildAssistantToolRegistrations({ ...deps, magicLinkPerEmailLimiter }, undefined, { contributions })) registry.register(registration);
  return { registry, catalog: buildToolCatalogQuery(registry) };
}

test("local file owner requests rank media_import_local_file in the top 3 of the real catalog", async () => {
  const { catalog } = await realCatalog();
  for (const query of [
    "Add the video in my Downloads folder to the media library.",
    "Upload this photo from my desktop to the site.",
    "Import the logo file from the theme folder into media.",
    "Put hero.mp4 from my computer on the site.",
    "my Downloads folder",
  ]) {
    const hits = catalog.search({ query }, { limit: 20 }).map((hit) => hit.id);
    const rank = hits.indexOf("media_import_local_file");
    assert.ok(rank >= 0 && rank < 3, `${JSON.stringify(query)} must rank media_import_local_file top 3; got ${hits.slice(0, 3).join(", ")}`);
    if (query.includes("Downloads")) {
      const urlRank = hits.indexOf("media_import_from_url");
      assert.ok(urlRank === -1 || rank < urlRank, `${query}: URL importer must not outrank local importer`);
    }
  }
});


test("adding the local importer introduces no misses in the 126 operator requests", async (t) => {
  const { registry, catalog } = await realCatalog();
  const before = buildToolCatalogQuery({ list: () => registry.list({}).filter((descriptor) => descriptor.id !== "media_import_local_file") });
  const requests = JSON.parse(readFileSync(new URL("../../../assistant/__tests__/fixtures/tool-search-operator-requests.json", import.meta.url), "utf8")) as { id: string; query: string; expect: string[] }[];
  // 126, not the original 127: th-06 ("install a new theme from the marketplace") went with the
  // deleted theme marketplace and its tool (723700948, owner decision 2026-10-04).
  assert.equal(requests.length, 126);
  const regressions: string[] = [];
  const existingMisses: string[] = [];
  let compared = 0;
  for (const request of requests.filter((entry) => entry.expect.length > 0)) {
    const priorHits = before.search({ query: request.query }, { limit: 3 }).map((hit) => hit.id);
    const afterHits = catalog.search({ query: request.query }, { limit: 3 }).map((hit) => hit.id);
    if (!request.expect.some((id) => priorHits.includes(id))) {
      existingMisses.push(request.id);
      continue;
    }
    compared++;
    if (!request.expect.some((id) => afterHits.includes(id))) {
      regressions.push(`${request.id}: ${request.query} -> ${afterHits.join(", ")}`);
    }
  }
  assert.ok(compared > 0, "the baseline must have hits, so the comparison cannot pass vacuously");
  assert.deepEqual(regressions, []);
  t.diagnostic(`Compared ${compared} baseline hits; misses already present without media_import_local_file: ${existingMisses.join(", ")}`);
});
