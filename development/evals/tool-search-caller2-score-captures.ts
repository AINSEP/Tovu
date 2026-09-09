/**
 * @file Scores `tool-search-caller2-compliance-captures-2026-09-08.ts` — a fresh capture of a real
 * local-CLI agent's `search_tools` calls, recaptured 2026-09-08 against the LIVE (post-`content_read`-
 * collapse) tool catalog — against that same live catalog's retrieval.
 *
 * **Un-quarantined 2026-09-08.** This suite previously scored the FROZEN 2026-08-05 capture
 * (`tool-search-caller2-compliance-captures-2026-08-05.ts`), 18 of whose 25 cases (72%) had
 * `expectedToolId` set to a tool id the `content_read` collapse (`a2fa0bfc`, 2026-09-08) retired —
 * making its headline percentage measure data staleness, not retrieval quality. That file was
 * quarantined (no percentage printed) rather than silently left at a stale 20%; see
 * `ADS-memory/reports/2026-09-08-eval-ground-truth-migration.md` ("Quarantine" section) for the full
 * history. The 2026-08-05 capture is UNCHANGED and remains a frozen historical record — it is simply no
 * longer what this scorer scores. This file now scores the 2026-09-08 recapture instead (owner-
 * authorized live-CLI run; see `ADS-memory/reports/2026-09-08-eval-recapture.md`), whose raw
 * `expectedToolId` values were verified to resolve 25/25 against the live catalog once passed through
 * `currentToolIdFor` below.
 *
 * `expectedToolId` is resolved through `currentToolIdFor` before being scored, same as every other
 * "live ground-truth fixture" in this directory (category A in the ground-truth-migration report
 * above) — this is NOT the same move that was reverted for the 2026-08-05 capture. That capture is a
 * historical record whose catalog-at-capture-time predates the collapse, so resolving its ids against
 * today's catalog would be reinterpreting history. This capture was recorded TODAY, against TODAY's
 * (already-collapsed) catalog — resolving its raw ids (many of which are pre-collapse ids because the
 * harness's own `CASES` list predates the collapse and was never rewritten for it) is exactly the live-
 * fixture maintenance pattern the other 11 suites already use, not a retroactive reinterpretation.
 */
import { buildToolCatalogQuery } from "../../apps/website/src/assistant/tool-catalog-query";
import { currentToolIdFor } from "../../apps/website/src/assistant/content-read-tool";
import type { RouteDeps } from "../../apps/website/src/server/routes/types";
import { buildEvalToolRegistry } from "./tool-search-eval-registry";
import { CALLER2_COMPLIANCE_CAPTURES_20260908 } from "./tool-search-caller2-compliance-captures-2026-09-08.js";
import { HELD_OUT_V2 } from "./tool-search-heldout-v2.js";

function fakeRouteDeps(): RouteDeps {
  const deps = {
    workspaceId: "ws-eval",
    clock: { nowIso: () => "2026-09-08T00:00:00.000Z" },
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

const registry = buildEvalToolRegistry(fakeRouteDeps());
const catalog = buildToolCatalogQuery(registry);

const CUTOFFS = [1, 3, 5, 10] as const;
const n = CALLER2_COMPLIANCE_CAPTURES_20260908.length;
const hits: Record<number, number> = { 1: 0, 3: 0, 5: 0, 10: 0 };

console.log(`Scoring ${n} real captured queries (first search_tools call per case, or miss if none)\n`);
for (const capture of CALLER2_COMPLIANCE_CAPTURES_20260908) {
  const heldOutCase = HELD_OUT_V2.find((c) => c.query === capture.operatorQuery);
  const acceptable = new Set<string>(
    [capture.expectedToolId, ...(heldOutCase?.alsoAcceptable ?? [])].map(currentToolIdFor),
  );
  const queryToScore = capture.capturedQueries[0];
  const ranks = queryToScore ? catalog.search(queryToScore, 10).map((h) => h.id) : [];
  const rank1 = acceptable.has(ranks[0] ?? "__none__");
  for (const k of CUTOFFS) {
    const hit = ranks.slice(0, k).some((id) => acceptable.has(id));
    if (hit) hits[k]++;
  }
  console.log(`${capture.caseId.padEnd(22)} called=${capture.searchToolsCalled ? "Y" : "N"}  top1=${rank1 ? "HIT" : "miss"}  expect=${capture.expectedToolId}  got1=${ranks[0] ?? "(none)"}`);
}

console.log(`\nResults on n=${n} real captured queries:`);
for (const k of CUTOFFS) {
  const pct = ((hits[k] / n) * 100).toFixed(0);
  console.log(`  ${(k === 10 ? "found@10" : `top-${k}`).padEnd(8)}  ${hits[k]}/${n}  (${pct}%)`);
}
