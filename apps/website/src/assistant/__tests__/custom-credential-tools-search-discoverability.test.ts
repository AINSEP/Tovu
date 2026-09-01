import assert from "node:assert/strict";
import test from "node:test";

import { customCredentialsAgentToolCatalog } from "../../features/custom-credentials/agent-tools.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

/**
 * @file Pins the actual INCIDENT this dispatch closes, not just `TOOL_SEARCH_KEYWORDS`'/`DOC2QUERY`'s
 * contents. As of 2026-09-01, `custom_credential_verify`/`custom_credential_make_request` had shipped
 * with ZERO entries in either map: the owner watched the assistant run an entire Fly.io + name.com
 * DNS session through raw `curl` in Bash while `custom_credential_make_request` sat unused and
 * unfound, and a separate session had already told the owner `custom_credential_verify` "did not
 * exist" after searching for it, finding it only two hours later once pushed back on. Per team
 * direction (2026-09-01): "a map entry that does not change ranking is worthless" — so this file
 * exercises the REAL FTS5/BM25 ranking through `buildToolCatalogQuery` (the same seam
 * `tool-catalog-query.test.ts` certifies for its own wiring), seeded with these three tools' REAL,
 * currently-shipping catalog descriptions plus a handful of unrelated-domain distractors, so a pass
 * here proves an operator's actual phrasing reaches the right tool id — not merely that a string
 * exists in a map `indexedDescriptionFor` happens to fold in.
 *
 * RED-before-GREEN evidence (recorded in the dispatch report, not re-derivable from this file alone):
 * stashing this session's `agent-tools.ts` description rewrite together with the
 * `tool-search-keywords.ts`/`tool-search-doc2query.ts` additions reproduces the pre-fix state — the
 * original catalog descriptions never say the word "token" at all (deliberately, for the security
 * framing), so "call an external API with my saved token" cannot match `custom_credential_make_request`
 * without either the keyword fold or the description rewrite, and every test below fails.
 */

/** Unrelated-domain tools with real, distinct vocabulary — proves the assertions below are measuring
 *  genuine discrimination, not "everything ranks because the index is nearly empty" (the same
 *  reasoning `tool-catalog-query.test.ts`'s own minimal fixture documents, just with distractors that
 *  share zero terms with any query below). */
const DISTRACTORS = [
  { id: "database_get_health", description: "Reports whether the database is connected and healthy, and whether a migration is stuck or pending." },
  { id: "webhooks_list_subscriptions", description: "Lists every outgoing webhook subscription configured for this workspace, with its last delivery." },
  { id: "identity_user_list", description: "Lists every admin user account and their assigned role in this workspace." },
];

function fakeRegistry() {
  // `customCredentialsAgentToolCatalog` entries key their id under `name` (this domain's own
  // `AgentToolDefinition` shape — see `agent-tools.ts`), not `id` — `sourceForToolId`/`reseedToolCatalog`
  // both expect `id`, so the fixture maps the field rather than assuming the two catalogs agree on a
  // property name they were never required to share.
  const realTools = customCredentialsAgentToolCatalog.map((tool) => ({ id: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
  return { list: () => [...realTools, ...DISTRACTORS] };
}

function top3Ids(catalog: ReturnType<typeof buildToolCatalogQuery>, query: string): string[] {
  return catalog.search(query, 3).map((hit) => hit.id);
}

test("'what credentials do I have saved' finds custom_credential_list in the top 3", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const hits = top3Ids(catalog, "what credentials do I have saved");
  assert.ok(hits.includes("custom_credential_list"), `expected custom_credential_list in top-3; got ${hits.join(", ") || "(none)"}`);
});

test("'list my API keys' and 'what tokens do I have' both find custom_credential_list", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  for (const query of ["list my API keys", "what tokens do I have"]) {
    const hits = top3Ids(catalog, query);
    assert.ok(hits.includes("custom_credential_list"), `query "${query}": expected custom_credential_list in top-3; got ${hits.join(", ") || "(none)"}`);
  }
});

test("'do I have a name.com token' and 'what did I save for fly.io' both find custom_credential_list", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  for (const query of ["do I have a name.com token", "what did I save for fly.io"]) {
    const hits = top3Ids(catalog, query);
    assert.ok(hits.includes("custom_credential_list"), `query "${query}": expected custom_credential_list in top-3; got ${hits.join(", ") || "(none)"}`);
  }
});

test("'call an external API with my saved token' finds custom_credential_make_request in the top 3", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const hits = top3Ids(catalog, "call an external API with my saved token");
  assert.ok(hits.includes("custom_credential_make_request"), `expected custom_credential_make_request in top-3; got ${hits.join(", ") || "(none)"}`);
});

test("'make a request to an external service' and 'hit a third-party API with my saved credential' both find custom_credential_make_request", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  for (const query of ["make a request to an external service", "hit a third-party API with my saved credential"]) {
    const hits = top3Ids(catalog, query);
    assert.ok(hits.includes("custom_credential_make_request"), `query "${query}": expected custom_credential_make_request in top-3; got ${hits.join(", ") || "(none)"}`);
  }
});

test("'check if my token works' and 'is this API key still valid' both find custom_credential_verify", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  for (const query of ["check if my token works", "is this API key still valid"]) {
    const hits = top3Ids(catalog, query);
    assert.ok(hits.includes("custom_credential_verify"), `query "${query}": expected custom_credential_verify in top-3; got ${hits.join(", ") || "(none)"}`);
  }
});

test("vendor-shaped vocabulary (DNS, registrar, hosting, deployment provider, third-party API) finds all three custom-credential tools somewhere in the results", () => {
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const hits = catalog.search("DNS registrar hosting deployment provider third-party API", 10).map((hit) => hit.id);
  for (const id of ["custom_credential_list", "custom_credential_verify", "custom_credential_make_request"]) {
    assert.ok(hits.includes(id), `expected ${id} to be findable by vendor-shaped vocabulary; got ${hits.join(", ") || "(none)"}`);
  }
});

test("the unrelated distractors never outrank custom_credential_list for a credential-shaped query", () => {
  // A distractor MAY still appear somewhere in the results (BM25 with a full natural-language query
  // can pick up an incidental single-token match — e.g. "have" also appearing in an unrelated tool's
  // own doc2query phrasing), so this asserts the property that actually matters — real relevance
  // ordering — rather than the stricter "never appears at all", which a probe run
  // (`buildToolCatalogQuery` against this exact fixture) showed does not hold: distractors DO surface
  // with noise-level scores roughly 5 orders of magnitude below the real match. Ordering is the
  // property that would break if the new keyword/doc2query entries were wrong or too weak.
  const catalog = buildToolCatalogQuery(fakeRegistry());
  const hits = catalog.search("what credentials do I have saved", 10);
  assert.equal(hits[0]?.id, "custom_credential_list", `expected custom_credential_list to rank #1; got ${hits.map((h) => h.id).join(", ")}`);
  const ownScore = hits[0]!.score;
  for (const distractorId of ["database_get_health", "webhooks_list_subscriptions", "identity_user_list"]) {
    const distractor = hits.find((hit) => hit.id === distractorId);
    if (distractor) assert.ok(distractor.score < ownScore, `${distractorId} must not outscore custom_credential_list`);
  }
});
