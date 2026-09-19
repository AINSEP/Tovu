/**
 * @file Task 11 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 11.
 *
 * The dialog-specific wire shapes live here. The report itself is imported from the neutral,
 * client-safe `report-contract.ts` module so there is only one report DTO declaration.
 */
import type {
  PublishContentOutcomeKindDto,
  PublishContentOutcomeRowDto,
  PublishContentReportDto,
} from "../report-contract.js";

export type PublishContentOutcomeKind = PublishContentOutcomeKindDto;
export type PublishContentOutcomeRow = PublishContentOutcomeRowDto;
export type PublishContentReport = PublishContentReportDto;

/**
 * One configured publish target, as `GET .../publish-content/peers` returns it.
 *
 * `masked` and `hasCredential` are the ONLY credential-shaped fields that exist on the client at
 * all. The sealed material behind them never leaves the server — nothing in this folder, in the
 * admin dialog, or in any error path may request, render, log or store it.
 */
export interface PublishContentPeerSummary {
  readonly id: string;
  readonly label: string;
  readonly baseUrl: string;
  readonly remoteWorkspaceId: string;
  /** A display hint derived from the key, never the key. `null` when the peer holds no credential. */
  readonly masked: string | null;
  readonly hasCredential: boolean;
}

/**
 * `POST .../publish-content/peers/:peerId/push/plan` — the shared gated-mutation envelope
 * (`GatedPlanResult` in `apps/admin/src/lib/api.ts`) with this ceremony's own `details`, spread at
 * the top level so one client render path serves both this route and the local `/import/plan`.
 *
 * `bundleId` is load-bearing, not informational: the peer's `/import/execute` requires the same
 * bundle it planned against, so the client MUST carry this value from the plan into the execute
 * call. Losing it turns a confirmed plan into an unexecutable one.
 */
export interface PublishContentPlanResult {
  readonly planId: string;
  readonly planHash: string;
  readonly bundleId: string;
  readonly details: PublishContentReport;
}

/** `POST .../publish-content/peers/:peerId/push/confirm`. The token is the ONLY thing that authorizes an
 *  execute — see `phase.ts`. */
export interface PublishContentConfirmResult {
  readonly confirmationToken: string;
}

/** `POST .../publish-content/peers/:peerId/push/execute` — mirrors `gated-hooks.ts`'s `executeMutation()` return.
 *  `restorePointId` is what an operator needs to undo a whole bad run; `changeSetIds` is what they
 *  need to undo one entity. */
export interface PublishContentExecuteResult {
  readonly restorePointId: string;
  readonly runId: string;
  readonly changeSetIds: readonly string[];
}
