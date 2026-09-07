import assert from "node:assert/strict";
import test from "node:test";

import { mediaAgentToolCatalog } from "../../features/media/index.js";
import { mediaGenerationAgentToolCatalog } from "../../features/media-generation/agent-tools.js";
import { mediaImportAgentToolCatalog } from "../../features/media-import/agent-tools.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

/**
 * @file Pins the actual INCIDENT `media_import_from_url` exists to close — which was a DISCOVERY
 * failure as much as a capability one, and would not be closed by shipping the tool alone.
 *
 * 2026-09-06, live: the site assistant generated a real 2048x1152 PNG through an external MCP server,
 * was handed a CloudFront URL for it, and reported — in its own words — "`media_upload_asset` needs
 * base64 bytes I'm holding, `media_promote_chat_attachment` needs a chat attachment, and there is no
 * import-by-URL tool." A human bridged it by hand. Because `byok-tool-surface.ts` reduces the
 * published surface to 3 meta-tools, a tool the model cannot FIND is functionally a tool that does
 * not exist (see `tool-search-keywords.ts`'s own header) — so "the registration is wired" is not the
 * property that matters here; "an operator's phrasing ranks it" is.
 *
 * The discrimination this file cares about most is against its two SIBLINGS, not against unrelated
 * domains: `media_upload_asset` and `media_promote_chat_attachment` are the two tools the assistant
 * actually reached for and could not use. A ranking that returns those instead of this one reproduces
 * the incident exactly, so they are seeded here as REAL catalog entries (their live descriptions),
 * never as weakened stand-ins.
 *
 * Same discipline as `media-generation-search-discoverability.test.ts` and
 * `custom-credential-tools-search-discoverability.test.ts`: this exercises the REAL FTS5/BM25 ranking
 * through `buildToolCatalogQuery`, with `TOOL_SEARCH_KEYWORDS`/`DOC2QUERY` folded in exactly as
 * production folds them — "a map entry that does not change ranking is worthless".
 *
 * Disclosed, honest limit on what this file proves — measured, not assumed. Re-running these same
 * queries through `buildToolCatalogQuery(registry, { includeSearchKeywords: false, includeDoc2query:
 * false })` ranks `media_import_from_url` #1 on all six anyway, exactly as the `media-generation`
 * precedent found for its own tool. The reason is the same: the catalog description was written
 * vocabulary-rich from the start BECAUSE the incident was already known ("THIS IS HOW TO SAVE AN
 * IMAGE YOU ONLY HAVE A URL FOR", naming both sibling tools and why neither fits), so the description
 * alone already carries every phrasing below. The `TOOL_SEARCH_KEYWORDS`/`DOC2QUERY` entries are
 * still added — the standing per-tool convention, and a safety net if that description is ever
 * trimmed — but the claim this file actually earns is narrower and worth stating plainly: "before
 * this domain existed there was nothing for these queries to find, and the shipped description,
 * independent of the keyword fold, is good enough to beat the two siblings that caused the incident."
 * It is NOT "the keyword entry is what makes this pass".
 */

const DISTRACTORS = [
  { id: "database_get_health", description: "Reports whether the database is connected and healthy, and whether a migration is stuck or pending." },
  { id: "identity_user_list", description: "Lists every admin user account and their assigned role in this workspace." },
  { id: "redirects_create", description: "Creates a URL redirect from an old path to a new one, so an existing link keeps working after a page moves." },
  { id: "webhooks_create_subscription", description: "Registers an outgoing webhook endpoint URL that Tovu POSTs events to." },
];

/** The real, currently-shipping catalogs for all three media domains — so the sibling tools this
 *  ranking must beat are the actual ones an operator's query competes against in production. */
function fakeRegistry() {
  const real = [...mediaAgentToolCatalog, ...mediaGenerationAgentToolCatalog, ...mediaImportAgentToolCatalog].map((tool) => ({
    id: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
  return { list: () => [...real, ...DISTRACTORS] };
}

function top3Ids(query: string): string[] {
  return buildToolCatalogQuery(fakeRegistry()).search(query, 3).map((hit) => hit.id);
}

const OPERATOR_PHRASINGS = [
  "save the image at this link into the media library",
  "can you download this picture from the web and add it to our files",
  "I have a URL for an image, put it in the media library",
  "grab that photo from the CDN and store it with our other images",
  "import an image from a remote address",
];

for (const phrasing of OPERATOR_PHRASINGS) {
  test(`'${phrasing}' finds media_import_from_url in the top 3`, () => {
    const hits = top3Ids(phrasing);
    assert.ok(hits.includes("media_import_from_url"), `expected media_import_from_url in top-3; got ${hits.join(", ") || "(none)"}`);
  });
}

test("the incident's own phrasing outranks the two tools the assistant actually reached for and could not use", () => {
  const hits = buildToolCatalogQuery(fakeRegistry()).search("save the image at this url into the media library", 10);
  assert.equal(
    hits[0]?.id,
    "media_import_from_url",
    `a query about a URL must not land on media_upload_asset/media_promote_chat_attachment — that IS the incident; got ${hits.map((hit) => hit.id).join(", ")}`
  );
});

test("'import from url' is not confused with redirects_create or webhooks_create_subscription, the other two URL-shaped tools", () => {
  const hits = top3Ids("import an image from a url");
  assert.ok(hits.includes("media_import_from_url"), `got ${hits.join(", ")}`);
  assert.ok(!hits.includes("redirects_create") || hits.indexOf("media_import_from_url") < hits.indexOf("redirects_create"));
});

test("asking to GENERATE an image still finds media_generate_asset, not the importer — adding this tool did not cannibalize its sibling", () => {
  const hits = buildToolCatalogQuery(fakeRegistry()).search("generate a new image for me with ai", 10);
  assert.equal(hits[0]?.id, "media_generate_asset", `got ${hits.map((hit) => hit.id).join(", ")}`);
});

test("asking to upload bytes still finds media_upload_asset — the importer does not displace it either", () => {
  const hits = buildToolCatalogQuery(fakeRegistry()).search("upload these base64 bytes as a new asset", 10);
  assert.equal(hits[0]?.id, "media_upload_asset", `got ${hits.map((hit) => hit.id).join(", ")}`);
});
