/**
 * @file Retrieval probe for `site_describe_capabilities` against the REAL wired tool catalog.
 *
 * Built for the caps-retrieval-probe dispatch (2026-09-16): the owner ran a five-part chat task
 * ("create a page, generate an image with Higgsfield, add a contact form, publish, preview it")
 * that cost $4.5135 / 3m24s and made ~45 tool-search/describe turns against only 16 real tool
 * calls. `site_describe_capabilities` — which answers "what can this site do" in one call — never
 * appeared in that transcript. This probe answers a narrower, checkable question: is that because
 * `search_tools` (FTS5 + `bm25()`, see `@jini-ai/sqlite`'s `tool-catalog.ts`) cannot find it?
 *
 * Uses `buildEvalToolRegistry` -> `buildToolCatalogQuery`, the same seam
 * `tool-search-quality.eval.ts` uses, so the index queried here is byte-for-byte the same ranking
 * production's `search_tools` runs (same FTS5 schema, same `bm25(tool_catalog_fts, 6.0, 1.0)`
 * column weights, same folded `TOOL_SEARCH_KEYWORDS`/doc2query vocabulary).
 *
 * Run: `npx tsx development/evals/probe-caps-retrieval.ts`
 * Flags: `--deep` prints every candidate's raw bm25 score for the top 10, not just the top 3.
 *
 * Result (2026-09-16): retrieval for `site_describe_capabilities` was already fine for every
 * "what can this site do" - shaped query tested (rank #1-#2 in 7 of 8), confirming the 2026-09-15
 * keyword fix (commit 9c5778a6) landed correctly and predates this run. The one confirmed gap —
 * "what is this site capable of" ranked #6, beaten by four unrelated `custom_credential_*` tools
 * whose descriptions each happen to contain the literal phrase "no field capable of
 * accepting/carrying a secret" — was fixed by adding "capable" to its keyword entry (the adjective
 * form was missing; FTS5's `unicode61` tokenizer does not stem, so it is a different token from
 * "capability"/"capabilities" already listed). For the DIRECT task-step queries ("create a page",
 * "generate an image", "add a contact form", ...), `site_describe_capabilities` correctly does NOT
 * rank — those already resolve straight to the right primitive tool at #1 (`content_post_create`,
 * `media_generate_asset`, `forms_create_definition`, ...), which is the desired behavior: a
 * capability-overview tool is not supposed to outrank the tool that actually does the thing. See
 * this dispatch's report to the coordinator for the full before/after table and cost analysis.
 */
import { buildToolCatalogQuery } from "../../apps/website/src/assistant/tool-catalog-query.js";
import { buildEvalToolRegistry, fakeEvalRouteDeps } from "./tool-search-eval-registry.js";

const TARGET = "site_describe_capabilities";
const SEARCH_LIMIT_DEFAULT = 10; // matches byok-tool-surface.ts's SEARCH_LIMIT_DEFAULT
const DEEP_SCAN_LIMIT = 20; // wider window so a MISS at the default limit still reports how far off target is

const QUERIES = [
  // coordinator's explicit minimum
  "what can this site do",
  "what are this site's capabilities",
  "what features are available",
  "create a page",
  "add an image to a page",
  "generate an image",
  "add a contact form",
  "build a contact form",
  "what tools do I have",
  "how do I add a form to a page",
  // extra: closer to how the owner's actual sentence was structured, and to plausible rephrasings
  // of "what can this site do" a model might land on instead of the exact phrase.
  "create a page, generate an image with Higgsfield, add a contact form, publish, preview it",
  "what can I do on this site",
  "what is this site capable of",
  "list this site's features",
  "show me what's possible here",
  "what admin screens does this site have",
  "what content types does this site support",
];

function main() {
  const registry = buildEvalToolRegistry(fakeEvalRouteDeps());
  console.log(`Registry size: ${registry.list().length} tools\n`);

  const catalog = buildToolCatalogQuery(registry);
  const deep = process.argv.includes("--deep");

  for (const query of QUERIES) {
    const hits = catalog.search(query, DEEP_SCAN_LIMIT);
    const rank = hits.findIndex((h) => h.id === TARGET);
    const rankStr = rank === -1 ? "MISS" : `#${rank + 1}`;
    const atDefault = rank !== -1 && rank < SEARCH_LIMIT_DEFAULT ? `#${rank + 1}@10` : `MISS@10`;
    const top3 = hits.slice(0, 3).map((h, i) => `${i + 1}.${h.id}`).join(" ");
    console.log(`[${rankStr.padEnd(5)} / ${atDefault.padEnd(7)}] "${query}"`);
    console.log(`        top3: ${top3}`);
    if (deep) {
      for (const h of hits.slice(0, 10)) {
        console.log(`          ${h.score.toFixed(2).padStart(8)}  ${h.id}`);
      }
    }
  }
}

main();
