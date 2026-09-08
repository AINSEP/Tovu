/**
 * @file QUARANTINED 2026-09-08 — this suite's headline percentage is NOT a retrieval measurement.
 *
 * Scores `tool-search-caller2-compliance-captures-2026-08-05.ts`, a FROZEN capture of a real local-CLI
 * agent's `search_tools` calls from 2026-08-05, against the LIVE tool catalog. The `content_read`
 * collapse (`a2fa0bfc`, 2026-09-08) retired 36 Tier-1 read tool ids in favor of 29
 * `content_read.<resource>` cards. **18 of this capture's 25 cases (72%) have `expectedToolId` set to
 * one of those retired ids**, so 18 of this suite's cases are guaranteed misses by data staleness
 * alone, regardless of what the live catalog's retrieval quality actually is. Verified directly at
 * every run below, not hardcoded — see `retiredCount` and `RETIRED_READ_TOOL_TO_CARD`.
 *
 * A capture measures a model's behaviour AGAINST THE CATALOG AS IT STOOD. Once the catalog changes
 * structurally underneath it, the capture is stale DATA, not a scorer bug — re-keying the scorer's
 * `acceptable` set through `currentToolIdFor` (tried, then reverted the same day — see
 * `ADS-memory/reports/2026-09-08-eval-ground-truth-migration.md`, "Revision" section) would paper over
 * a data problem with a scoring rule, silently asserting a measurement that was never taken.
 *
 * So this file deliberately does NOT print a headline top-1/top-3/top-5/found@10 percentage table
 * anymore — see the quarantine notice this script prints instead. A number that cannot be quoted
 * cannot be misquoted; leaving a clean 20% sitting in this repo's output was the coordinator-identified
 * risk (it is exactly how a fabricated tool-search accuracy figure survived unnoticed for a month
 * elsewhere in this codebase — `2026-09-08-parent-tool-read-eval.md` §0.1).
 *
 * FROZEN pending a re-capture: this suite stays quarantined until someone re-runs
 * `tool-search-caller2-compliance-harness.ts` (untouched, still works, ~16 minutes of real local-CLI
 * API calls) against the current catalog and replaces the 2026-08-05 capture with a fresh one. That
 * spend needs the site owner's authorization — not run as part of this dispatch.
 */
import { buildToolCatalogQuery } from "../../apps/website/src/assistant/tool-catalog-query";
import { RETIRED_READ_TOOL_TO_CARD } from "../../apps/website/src/assistant/content-read-tool";
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

const n = CALLER2_COMPLIANCE_CAPTURES_20260805.length;

console.log("=".repeat(78));
console.log("QUARANTINED — this run's per-case detail is diagnostic only, NOT a retrieval score.");
console.log("See the notice printed at the end before drawing any conclusion from the output above it.");
console.log("=".repeat(78));
console.log(`\nScoring ${n} real captured queries (first search_tools call per case, or miss if none)\n`);
for (const capture of CALLER2_COMPLIANCE_CAPTURES_20260805) {
  const heldOutCase = HELD_OUT_V2.find((c) => c.query === capture.operatorQuery);
  // NOT re-keyed through `currentToolIdFor` — reverted 2026-09-08, see this file's header. This suite
  // scores a FROZEN 2026-08-05 capture's `expectedToolId` against the LIVE (now-collapsed) catalog.
  // Resolving those ids is a live design decision (how should a historical capture be interpreted
  // against a changed catalog?), not a mechanical ground-truth re-key, so it is left to the
  // coordinator rather than decided here.
  const acceptable = new Set<string>([capture.expectedToolId, ...(heldOutCase?.alsoAcceptable ?? [])]);
  const queryToScore = capture.capturedQueries[0];
  const ranks = queryToScore ? catalog.search(queryToScore, 10).map((h) => h.id) : [];
  const rank1 = acceptable.has(ranks[0] ?? "__none__");
  const staleTag = RETIRED_READ_TOOL_TO_CARD.has(capture.expectedToolId) ? "  [STALE: collapse-retired id]" : "";
  console.log(
    `${capture.caseId.padEnd(22)} called=${capture.searchToolsCalled ? "Y" : "N"}  top1=${rank1 ? "HIT" : "miss"}  expect=${capture.expectedToolId}  got1=${ranks[0] ?? "(none)"}${staleTag}`,
  );
}

const retiredCount = CALLER2_COMPLIANCE_CAPTURES_20260805.filter((c) => RETIRED_READ_TOOL_TO_CARD.has(c.expectedToolId)).length;
const retiredPct = ((retiredCount / n) * 100).toFixed(0);

console.log(`\n${"=".repeat(78)}`);
console.log(`QUARANTINE NOTICE — dated 2026-09-08, frozen pending a re-capture`);
console.log("=".repeat(78));
console.log(
  `This suite's headline top-1/top-3/top-5/found@10 percentage is DELIBERATELY NOT PRINTED.\n` +
    `${retiredCount} of its ${n} cases (${retiredPct}%) have \`expectedToolId\` set to a tool id the\n` +
    `content_read collapse retired — this capture is FROZEN from 2026-08-05, before that collapse\n` +
    `shipped, so those ${retiredCount} cases are guaranteed misses by data staleness alone, not by\n` +
    `anything the live catalog's retrieval actually does. A percentage computed over this data would\n` +
    `measure how many of the capture's cases still exist, not retrieval quality.\n\n` +
    `Do NOT quote a number from this run as a retrieval measurement.\n` +
    `Re-run only after a fresh capture replaces the 2026-08-05 one (tool-search-caller2-compliance-\n` +
    `harness.ts, ~16 min of real local-CLI API calls — needs owner-authorized spend, not run here).\n` +
    `See ADS-memory/reports/2026-09-08-eval-ground-truth-migration.md for the full history.`,
);
console.log("=".repeat(78));
