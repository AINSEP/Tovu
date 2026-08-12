import type { ISODateTime, UUID } from "@jini-ai/cms/core";

/**
 * @file Domain records for the deployments feature.
 *
 * Purpose:
 * The five workspace-scoped records this feature's SQLite schema materializes 1:1
 * (`src/db/schema.ts`'s `deploymentEnvironments`/`deploymentTargets`/`releases`/`deploymentRuns`/
 * `deploymentRunEvents`). This is the FIRST vertical slice of a larger feature — see
 * `ADS-memory/reports/swarm-consensus/runs/2026-08-12-tovu-six-debates-FINAL.md` §6 for the full
 * design this slice implements a subset of. No repository or route wiring exists yet; this file and
 * `./ports.ts` define the shape those layers will persist and orchestrate.
 *
 * How it relates to the project:
 * `Release` is deliberately an IDENTITY, not a build artifact — Tovu's CLI (`src/cli/program.ts`)
 * exposes only `init`/`serve`/`introspect`; there is no build or export command. A `git-revision`
 * release names a commit that already exists in a repository the operator controls. Deploying it
 * means asking an external provider (GitHub, and later others) to promote that existing commit —
 * never asking Tovu to construct one.
 *
 * Architectural role:
 * Domain types only — no I/O, no persistence. Mirrors `features/plugins/lipay/ports.ts`'s
 * discipline of keeping domain shapes free of adapter concerns.
 */

/** Open string, not a closed union — see `features/plugins/lipay/ports.ts`'s `PaymentProviderId`
 * for why (a closed union makes every new provider a core edit). `"github"` is the only value with
 * a real adapter this pass (`./providers/github.ts`). */
export type DeploymentProviderId = string;

/** A named promotion slot within a workspace — "staging", "production". Holds no content of its
 * own; a `DeploymentTargetRecord` is what points one at a provider. */
export interface EnvironmentRecord {
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly name: string;
  /** `[a-z0-9-]`, stable — used in run-log URLs and as the uniqueness key within a workspace. */
  readonly slug: string;
  readonly isProduction: boolean;
  readonly createdAtIso: ISODateTime;
  /** Optimistic-concurrency counter, incremented on every write. */
  readonly version: number;
}

/** One provider connection, scoped to a single environment. `config` carries non-secret provider
 * config only (repo owner/name, GitHub environment name) — credentials live behind the sealed
 * secret store this slice does not yet wire up (see the handoff report's REMAINING section). */
export interface DeploymentTargetRecord {
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly environmentId: UUID;
  readonly providerId: DeploymentProviderId;
  readonly label: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly enabled: boolean;
  readonly createdAtIso: ISODateTime;
  readonly version: number;
}

/** What a release promotes. `git-revision` is the only kind a first-party adapter accepts this
 * pass — the honesty constraint: Tovu has no build/export command, so it can only promote a commit
 * that already exists. `external-artifact` is declared for a future non-GitHub provider (e.g. one
 * that accepts a pre-built tarball URL) and is deliberately rejected by `./providers/github.ts`. */
export type ReleaseSource =
  | { readonly kind: "git-revision"; readonly repoUrl: string; readonly commitSha: string }
  | { readonly kind: "external-artifact"; readonly uri: string; readonly checksum?: string };

/** An immutable, workspace-scoped artifact IDENTITY — "this is the thing that gets promoted". It
 * records a reference to an artifact that already exists; it does not construct one. */
export interface ReleaseRecord {
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly label: string;
  readonly source: ReleaseSource;
  readonly createdByPrincipalId: UUID;
  readonly createdAtIso: ISODateTime;
  readonly version: number;
}

/** Tovu's own normalized run status. Providers report a wider, provider-specific state (GitHub's
 * real deployment-status enum has seven values — see `./providers/github.ts`'s
 * `mapGitHubDeploymentStatus`) and every adapter narrows it down to this closed set. */
export type DeploymentRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

/** One attempt to promote a `ReleaseRecord` to an `EnvironmentRecord` through a
 * `DeploymentTargetRecord` — the durable execution record. `system/module-status.ts` is a
 * boot-readiness snapshot (one row, overwritten every boot), not a per-run table; this is not that. */
export interface DeploymentRunRecord {
  readonly workspaceId: UUID;
  readonly id: UUID;
  /**
   * Materialized here, not resolved by joining through `targetId`. An inbound provider callback or
   * a poll-worker pass must be able to find this row from `(providerId, providerRunRef)` alone,
   * even if the target that started the run has since been deleted — joining through a possibly-
   * deleted target would silently drop the update instead of applying it.
   */
  readonly providerId: DeploymentProviderId;
  /**
   * `targetId`/`environmentId`/`releaseId` are nullable, backed by an `ON DELETE SET NULL` FK
   * (`src/db/schema.ts`) rather than either a hard restrict or no FK at all: creation is still
   * validated (a run cannot be inserted pointing at a target/environment/release that never
   * existed), deletion of any of the three is still permitted, and the run row survives with its
   * `providerId` + `providerRunRef` intact — exactly what the callback/poll resolution path needs,
   * and nothing more.
   */
  readonly targetId: UUID | null;
  readonly environmentId: UUID | null;
  readonly releaseId: UUID | null;
  readonly status: DeploymentRunStatus;
  /** The provider's own identifier for this run. Opaque to Tovu; `null` until the provider accepts
   * the run (see `StartDeploymentRunResult`). The ONLY key an inbound callback or poll pass may use
   * to find this row — never a caller-supplied `workspaceId`. */
  readonly providerRunRef: string | null;
  /** How this run's terminal status is expected to arrive. GitHub's `deployment_status` webhook
   * never fires for the `inactive` state (verified against GitHub's webhook payload docs), so a run
   * that later observes `inactive` can only have done so via polling, regardless of this field. */
  readonly reconciliation: "poll" | "callback" | "manual";
  readonly requestedByPrincipalId: UUID;
  readonly requestedAtIso: ISODateTime;
  readonly startedAtIso: ISODateTime | null;
  readonly finishedAtIso: ISODateTime | null;
  /** Sanitized only — never raw provider response text (may contain reflected request fragments). */
  readonly errorSummary: string | null;
  readonly version: number;
}

/** One log line on a `DeploymentRunRecord`, for the run-detail view. */
export interface DeploymentRunEventRecord {
  readonly workspaceId: UUID;
  readonly id: UUID;
  readonly runId: UUID;
  readonly atIso: ISODateTime;
  readonly level: "info" | "warning" | "error";
  /** Sanitized before insert — same discipline as `DeploymentRunRecord.errorSummary`. */
  readonly message: string;
}
