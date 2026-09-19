/**
 * @file Task 11 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 11.
 *
 * The wire shapes the Publish Content dialog exchanges with the server, declared once here so the
 * admin package and this package cannot hold two drifting copies of them.
 *
 * ## Why these are re-declared rather than `import type`d from `planner.ts`
 *
 * `planner.ts` is server code: it imports `content-hash.ts` (which imports `node:crypto`) and
 * `type-registry.ts` (which imports repo ports through `#src/...` subpath specifiers). `apps/admin`
 * has neither `@types/node` nor a `#src` path mapping, so even a *type-only* edge from this folder
 * into `planner.ts` would drag both into the admin TypeScript program and break the admin build —
 * the exact failure mode the boundary test in `__tests__/ui-stays-client-safe.boundary.test.ts`
 * exists to prevent.
 *
 * The drift that re-declaration would otherwise invite is closed at compile time instead, by
 * `planner-contract-check.ts` in this folder: a non-test, root-tsc-checked file that asserts these
 * declarations are mutually assignable with `planner.ts`'s own. Adding an outcome kind or a report
 * field there without mirroring it here is a typecheck error, not a silent divergence.
 */

/** Mirrors `planner.ts`'s `PublishContentOutcomeKind`. `refused` is deliberately absent — it is a
 *  whole-run state on the report, never a per-entity outcome (see that file's header). */
export type PublishContentOutcomeKind = "created" | "unchanged" | "applied" | "conflict" | "blocked" | "forced";

/** Mirrors `planner.ts`'s `PublishContentOutcomeRow`. `writes` is the planner's OWN statement of
 *  what a later apply pass would do to this entity — this folder never re-derives it from
 *  `outcome`, so the two can never disagree. */
export interface PublishContentOutcomeRow {
  readonly entityType: string;
  readonly entityId: string;
  readonly outcome: PublishContentOutcomeKind;
  readonly writes: boolean;
  readonly reason: string | null;
}

/** Mirrors `planner.ts`'s `PublishContentReport`. When `refused` is true, `rows` and `applyOrder`
 *  are always empty — a refusal never coexists with a partial per-entity report. */
export interface PublishContentReport {
  readonly refused: boolean;
  readonly refusalReason: string | null;
  readonly applyOrder: readonly string[];
  readonly rows: readonly PublishContentOutcomeRow[];
}

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
  readonly changeSetIds: readonly string[];
}
