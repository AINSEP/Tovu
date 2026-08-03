/**
 * @file Change-set vocabulary and persistence contract (ADR-008) — re-exported from
 * `@jini-ai/cms/core`.
 *
 * Moved into the package on 2026-08-02. See `../ports.ts` for why the re-export shim exists rather
 * than the ~200 import rewrites. Add nothing here; the definitions live in the package.
 *
 * Note for reviewers: `appliers.ts`, `revert.ts`, and `repo.memory.ts` in this directory are still
 * host-local and were deliberately NOT ported. `appliers.ts` names `features/post` and
 * `features/settings` by import, which is the single edge that welds this repo's module graph
 * together — inverting it to a registration-based lookup is its own change, tracked as Phase 4 in
 * `ADS-memory/reports/refactors/RESUME-architecture-refactor.md`.
 */
export type {
  ChangeSetStatus,
  ChangeSetOperation,
  ChangeSetRecord,
  ChangeSetItemRecord,
  ChangeSetWithItems,
  ChangeSetRepoPort,
} from "@jini-ai/cms/core";
