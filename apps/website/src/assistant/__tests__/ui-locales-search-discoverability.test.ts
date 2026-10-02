/** n05: language support/code discovery competes against the entire real catalog. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createToolRegistry } from "@jini-ai/core";
import { MAGIC_LINK_PER_EMAIL, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

test("supported language and code questions rank settings_list_ui_locales in the top three", async () => {
  resetToolContributorsForTests();
  installFirstPartyToolContributors();
  const deps = createRouteDeps();
  await deps.identityReady;
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock });
  const registry = createToolRegistry();
  const withoutLocales = createToolRegistry();
  for (const registration of buildAssistantToolRegistrations({ ...deps, magicLinkPerEmailLimiter })) {
    registry.register(registration);
    if (registration.descriptor.id !== "settings_list_ui_locales") withoutLocales.register(registration);
  }
  const catalog = buildToolCatalogQuery(registry);
  const queries = [
    "which languages can the admin interface use",
    "what locale code do I use for Portuguese",
    "does the admin support Italian",
    "list supported UI languages",
    "can you switch to Polish",
    "change the language to Spanish",
    // Raw asks from the three conversations, beyond the doc2query examples.
    "change the language to portuguese",
    "change to italian",
    "change back to english please",
    "can you switch to spanish please",
    "translate to german",
  ];
  const misses = queries.flatMap((query) => {
    const hits = catalog.search(query, 3).map((hit) => hit.id);
    return hits.includes("settings_list_ui_locales") ? [] : [`${query} -> ${hits.join(", ")}`];
  });
  assert.deepEqual(misses, [], "language discovery must not require shell access");

  // Other jobs share this tree. Compare the same snapshot with and without this tool;
  // the existing operator-request suite still independently reports all absolute misses.
  const before = buildToolCatalogQuery(withoutLocales);
  const requests: { id: string; query: string; expect: string[] }[] = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "fixtures", "tool-search-operator-requests.json"), "utf8"),
  );
  const regressions = requests.flatMap((request) => {
    const earlierHits = before.search(request.query, 3).map((hit) => hit.id);
    const currentHits = catalog.search(request.query, 3).map((hit) => hit.id);
    const foundBefore = request.expect.some((id) => earlierHits.includes(id));
    const foundNow = request.expect.some((id) => currentHits.includes(id));
    return foundBefore && !foundNow ? [`${request.id}: ${earlierHits.join(", ")} -> ${currentHits.join(", ")}`] : [];
  });
  assert.deepEqual(regressions, [], "adding locale discovery must not regress existing operator requests");
});
