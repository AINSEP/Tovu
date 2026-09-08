import { buildToolCatalogQuery } from "../../apps/website/src/assistant/tool-catalog-query";
import type { RouteDeps } from "../../apps/website/src/server/routes/types";
import { buildEvalToolRegistry } from "./tool-search-eval-registry";
import { CALLER2_COMPLIANCE_CAPTURES_20260805 } from "./tool-search-caller2-compliance-captures-2026-08-05.js";
import { HELD_OUT_V2 } from "./tool-search-heldout-v2.js";

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

const registry = buildEvalToolRegistry(fakeRouteDeps());
const catalog = buildToolCatalogQuery(registry);

const CUTOFFS = [1, 3, 5, 10] as const;
const n = CALLER2_COMPLIANCE_CAPTURES_20260805.length;
const hits: Record<number, number> = { 1: 0, 3: 0, 5: 0, 10: 0 };

console.log(`Scoring ${n} real captured queries (first search_tools call per case, or miss if none)\n`);
for (const capture of CALLER2_COMPLIANCE_CAPTURES_20260805) {
  const heldOutCase = HELD_OUT_V2.find((c) => c.query === capture.operatorQuery);
  // NOT re-keyed through `currentToolIdFor` — reverted 2026-09-08. This suite scores a FROZEN
  // 2026-08-05 capture's `expectedToolId` against the LIVE (now-collapsed) catalog. Resolving those
  // ids is a live design decision (how should a historical capture be interpreted against a changed
  // catalog?), not a mechanical ground-truth re-key, so it is left to the coordinator rather than
  // decided here. See `ADS-memory/reports/2026-09-08-eval-ground-truth-migration.md`.
  const acceptable = new Set<string>([capture.expectedToolId, ...(heldOutCase?.alsoAcceptable ?? [])]);
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
