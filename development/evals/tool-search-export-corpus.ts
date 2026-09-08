/**
 * @file Dumps the live tool catalog + the n=130 blind eval set to a JSON file, so retrieval
 * experiments that need heavy third-party dependencies (embedding runtimes, native vector
 * extensions) can run in a throwaway sandbox WITHOUT adding those dependencies to this repo.
 *
 * The isolation is the point. An embedding stack is ~300 MB of `node_modules` and pulls a native
 * ONNX runtime; installing that into Tovu to answer a "would this help" question means a dirty
 * lockfile, a native build step in CI, and a nontrivial revert. Exporting the corpus instead keeps
 * the experiment a `rm -rf` away from gone, and keeps the committed eval suite free/deterministic.
 *
 * Emits the indexed text EXACTLY as `buildToolCatalogQuery` composes it, so a vector run is scored
 * over the same document text BM25 sees rather than a prettier reconstruction of it.
 *
 * Run: `npx tsx development/evals/tool-search-export-corpus.ts <out.json>`
 */
import { buildEvalToolRegistry } from "./tool-search-eval-registry.js";
import { currentToolIdFor } from "../../apps/website/src/assistant/content-read-tool.js";
import type { RouteDeps } from "../../apps/website/src/server/routes/types.js";
import { HELD_OUT_V2 } from "./tool-search-heldout-v2.js";
import { HYDE_PROMPT_EXPANSIONS_V2 } from "./tool-search-hyde-prompt-expansions-v2.js";
import { DOC2QUERY } from "../../apps/website/src/assistant/tool-search-doc2query.js";
import { indexedDescriptionFor } from "../../apps/website/src/assistant/tool-search-keywords.js";
import { writeFileSync } from "node:fs";

function fakeRouteDeps(): RouteDeps {
  const deps = {
    workspaceId: "ws-eval",
    clock: { nowIso: () => "2026-08-05T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    authorize: async () => ({ allowed: true, reason: "matched" }),
    contentTypeRepo: {
      save: async () => {},
      appendRevision: async () => {},
      findByKey: async () => null,
      listByWorkspace: async () => [],
      transaction: async <T>(fn: () => Promise<T>) => fn(),
    },
    contentTypeIndexProvisioner: {
      provisionIndexesForNewContentType: async () => {},
      applyFieldIndexTransitions: async () => {},
      tearDownAllIndexesForContentType: async () => {},
    },
    outbox: { enqueue: async () => {} },
  };
  return deps as unknown as RouteDeps;
}

const out = process.argv[2];
if (!out) throw new Error("usage: tsx tool-search-export-corpus.ts <out.json>");

const registry = buildEvalToolRegistry(fakeRouteDeps());

const tools = registry.list().map((d) => {
  const base = d.description ?? "";
  const d2q = DOC2QUERY[d.id];
  return {
    id: d.id,
    // Three document variants, matching the three index configurations the BM25 evals score.
    // `indexedDescriptionFor` is the real composer used by `buildToolCatalogQuery` — reconstructing
    // it by hand here would silently score a different corpus than production indexes.
    plain: base,
    withKeywords: indexedDescriptionFor(d.id, base),
    withDoc2query: d2q ? `${base} — ${d2q.join(" ")}` : base,
  };
});

// `expect`/`alsoAcceptable` are resolved through `currentToolIdFor` before export so a downstream
// (external, sandboxed) consumer scoring against `tools` above — which already reflects the shipped
// `content_read` collapse — does not have to know about the retired-id mapping itself. See
// `ADS-memory/reports/2026-09-08-parent-tool-read-eval.md` §8.
const cases = HELD_OUT_V2.map((c) => ({
  query: c.query,
  hyde: HYDE_PROMPT_EXPANSIONS_V2[c.query] ?? null,
  expect: currentToolIdFor(c.expect),
  alsoAcceptable: (c.alsoAcceptable ?? []).map(currentToolIdFor),
}));

const missing = cases.filter((c) => c.hyde === null);
if (missing.length > 0) throw new Error(`HYDE_PROMPT_EXPANSIONS_V2 missing ${missing.length} cases`);

writeFileSync(out, JSON.stringify({ tools, cases }, null, 2));
console.log(`wrote ${out}: ${tools.length} tools, ${cases.length} cases`);
