import assert from "node:assert/strict";
import test from "node:test";

import { mediaGenerationAgentToolCatalog } from "../../features/media-generation/agent-tools.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

/**
 * @file Pins the actual PRODUCTION INCIDENT this dispatch closes — not just `TOOL_SEARCH_KEYWORDS`'/
 * `DOC2QUERY`'s contents. Before this dispatch, `search_tools` had NO image-generation tool to find
 * at all: a transcript showed the assistant searching five times, finding `media_upload_asset`/
 * `content_post_create`, and answering "I cannot generate images, as Tovu does not have an AI image
 * generation tool configured" — the engine existed (`@jini-ai/integrations/media-providers`) but was
 * wired nowhere. Mirrors `custom-credential-tools-search-discoverability.test.ts`'s exact discipline
 * (per that file's own header, "a map entry that does not change ranking is worthless"): this
 * exercises the REAL FTS5/BM25 ranking through `buildToolCatalogQuery`, seeded with
 * `media_generate_asset`'s real, currently-shipping catalog description plus unrelated-domain
 * distractors, so a pass here proves an operator's actual phrasing reaches this tool id — not merely
 * that a string exists in a map `indexedDescriptionFor` happens to fold in.
 *
 * Disclosed, honest difference from the `custom-credentials` precedent's RED-before-GREEN claim:
 * verified live (removing `TOOL_SEARCH_KEYWORDS`/`DOC2QUERY`'s `media_generate_asset` entries and
 * re-running this file) that these four assertions stay GREEN either way. Unlike custom-credentials'
 * original terse descriptions (deliberately never saying "token"), `agent-tools.ts`'s
 * `media_generate_asset` description was written vocabulary-rich from the start ("create, generate,
 * draw, design, or make an image ... a logo, a hero banner, an illustration") specifically because
 * this incident was already known before the tool was written — so the description alone already
 * carries the phrasings below. The `TOOL_SEARCH_KEYWORDS`/`DOC2QUERY` entries are still added (this
 * codebase's standing per-tool convention, and a safety net if the description is ever trimmed
 * later), but this file's real RED-before-GREEN claim is narrower and more honest than "the keyword
 * fold makes this pass": it is "this tool did not exist and was therefore unfindable at all" (trivial
 * before this domain existed) plus "the shipped description, independent of the keyword fold, is
 * actually good enough" (verified, not assumed).
 */

const DISTRACTORS = [
  { id: "media_upload_asset", description: "Uploads a new media asset from base64-encoded bytes. Rejects a content type outside the allowed set or a file over the size cap." },
  { id: "database_get_health", description: "Reports whether the database is connected and healthy, and whether a migration is stuck or pending." },
  { id: "identity_user_list", description: "Lists every admin user account and their assigned role in this workspace." },
];

function fakeRegistry() {
  const realTools = mediaGenerationAgentToolCatalog.map((tool) => ({ id: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
  return { list: () => [...realTools, ...DISTRACTORS] };
}

function top3Ids(catalog: ReturnType<typeof buildToolCatalogQuery>, query: string): string[] {
  return catalog.search(query, 3).map((hit) => hit.id);
}

test("'can you generate an image of a sunset for me' finds media_generate_asset in the top 3", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const hits = top3Ids(catalog, "can you generate an image of a sunset for me");
  assert.ok(hits.includes("media_generate_asset"), `expected media_generate_asset in top-3; got ${hits.join(", ") || "(none)"}`);
});

test("'make me a logo with AI' and 'draw an illustration for the blog post' both find media_generate_asset", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  for (const query of ["make me a logo with AI", "draw an illustration for the blog post"]) {
    const hits = top3Ids(catalog, query);
    assert.ok(hits.includes("media_generate_asset"), `query "${query}": expected media_generate_asset in top-3; got ${hits.join(", ") || "(none)"}`);
  }
});

test("'I need a hero banner for the homepage, can you create one' finds media_generate_asset", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const hits = top3Ids(catalog, "I need a hero banner for the homepage, can you create one");
  assert.ok(hits.includes("media_generate_asset"), `expected media_generate_asset in top-3; got ${hits.join(", ") || "(none)"}`);
});

test("media_generate_asset never gets confused for media_upload_asset when the operator says 'generate' rather than 'upload'", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const hits = catalog.search("generate a new image for me", 10);
  assert.equal(hits[0]?.id, "media_generate_asset", `expected media_generate_asset to rank #1; got ${hits.map((h) => h.id).join(", ")}`);
});
