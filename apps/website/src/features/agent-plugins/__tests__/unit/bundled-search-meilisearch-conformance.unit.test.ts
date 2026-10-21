import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import type { HttpClientPort } from "@jini-ai/core/primitives";
import type { SearchProvider, SearchProviderContext } from "@jini-ai/search";
import { createFakeHttpClient, createUnavailableHttpClient, runSearchProviderConformance } from "@jini-ai/search/testkit";

import { createMeilisearchEmulator } from "../fixtures/meilisearch-emulator.js";
import { loadSearchProviderContributionsFromSource } from "../../search-provider-registry.js";

/**
 * @file The bundled `meilisearch` provider clears the generic search-provider conformance kit
 * (`@jini-ai/search/testkit`) unchanged, against the Meilisearch emulator in
 * `../fixtures/meilisearch-emulator.ts`. The provider is loaded the way production loads it: from the
 * plugin's own `tovu-search-providers.json` through the search-provider registry, so the manifest,
 * the contained `.mjs` import and Jini's contribution validation are all on the path.
 *
 * A real Meilisearch server is not available here; conformance against a real v1.x container is a
 * separate local run.
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/meilisearch");
const HOST = "https://meili.conformance.test";
const API_KEY = "conformance-master-key";
/** The workspace the conformance kit writes its documents under (its `WORKSPACE`, not exported). */
const KIT_WORKSPACE = "ws_conformance";

const loaded = await loadSearchProviderContributionsFromSource({ pluginId: "meilisearch", packageRoot: PACKAGE_ROOT });
assert.deepEqual(loaded.refusals, [], "the bundled manifest and module must load with no refusal");
const provider: SearchProvider = (loaded.items[0] as (typeof loaded.items)[number]).definition.provider;

const emulator = createMeilisearchEmulator({ host: HOST, apiKey: API_KEY });
const httpClient = createFakeHttpClient({ handle: emulator.handle });

function context(input: { readonly siteId: string; readonly indexName: string }, client: HttpClientPort = httpClient): SearchProviderContext {
  return {
    workspaceId: KIT_WORKSPACE, siteId: input.siteId, mode: "test", indexName: input.indexName,
    credentials: { host: HOST, apiKey: API_KEY }, httpClient: client, timeoutMs: 5_000, now: () => Date.now(),
  };
}

const titles = runSearchProviderConformance(
  { name: "meilisearch", makeProvider: () => provider, makeContext: (input) => context(input), test },
  { makeUnavailableContext: (input) => context(input, createUnavailableHttpClient()) },
);

test("every capability-dependent conformance case is registered (typo, locale, public-only, unavailable)", () => {
  for (const fragment of ["tolerates a one-edit typo", "locale filter", "a public-only provider never returns restricted documents", "an unavailable backend answers unknown and never throws"]) {
    assert.ok(titles.some((title) => title.includes(fragment)), `missing conformance case: ${fragment}`);
  }
});

test("no conformance request ever carried a restricted document's text to the vendor", () => {
  // The public-only case upserts a 'Members only' document; it must never appear in any request body.
  const bodies = httpClient.requests.map((request) => String(request.body ?? ""));
  assert.ok(bodies.some((body) => body.includes("Open to all")), "the public document of the same case was sent (the probe is live)");
  assert.ok(!bodies.some((body) => body.includes("Members only") || body.includes("members_only")));
});
