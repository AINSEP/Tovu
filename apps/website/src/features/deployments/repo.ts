import type { Selectable } from "kysely";

import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type {
  DeploymentEnvironmentsTable,
  DeploymentRunsTable,
  DeploymentTargetsTable,
  ReleasesTable,
} from "../../platform/db/content-database.generated.js";
import { DEPLOYMENTS_READ_LIST_LIMIT, type DeploymentsReadRepoPort } from "./read-repo.js";
import type { DeploymentRunRecord, DeploymentTargetRecord, EnvironmentRecord, ReleaseRecord, ReleaseSource } from "./types.js";

/**
 * @file THE `DeploymentsReadRepoPort` adapter: one Kysely query body for every dialect (storage
 * plan §4, ADR-066), reading the `deployment_*`/`releases` tables migration `0037` created. One
 * `toXRecord` mapper per table; every list workspace-scoped, newest-first and capped.
 * `repo.sqlite.ts` is the thin subclass `server/deps.ts` builds from the content db handle.
 */

type EnvironmentRow = Selectable<DeploymentEnvironmentsTable>;
type TargetRow = Selectable<DeploymentTargetsTable>;
type ReleaseRow = Selectable<ReleasesTable>;
type RunRow = Selectable<DeploymentRunsTable>;

function toEnvironmentRecord(row: EnvironmentRow): EnvironmentRecord {
  return {
    workspaceId: row.workspace_id,
    id: row.id,
    name: row.name,
    slug: row.slug,
    isProduction: row.is_production === 1,
    createdAtIso: row.created_at,
    version: row.version,
  };
}

function toTargetRecord(row: TargetRow): DeploymentTargetRecord {
  return {
    workspaceId: row.workspace_id,
    id: row.id,
    environmentId: row.environment_id,
    providerId: row.provider_id,
    label: row.label,
    config: JSON.parse(row.config_json) as Record<string, unknown>,
    enabled: row.enabled === 1,
    createdAtIso: row.created_at,
    version: row.version,
  };
}

/** `sourceKind` is the CHECK-constrained discriminant (`releases_source_kind_check`); the two
 *  branches below read exactly the columns that kind's `ReleaseSource` variant declares — the
 *  other kind's columns are always `NULL` on that row by construction (this repo's own
 *  writer, not built this pass, would be the only writer of either shape). */
function toReleaseSource(row: ReleaseRow): ReleaseSource {
  if (row.source_kind === "external-artifact") {
    return { kind: "external-artifact", uri: row.source_uri ?? "", ...(row.source_checksum ? { checksum: row.source_checksum } : {}) };
  }
  return { kind: "git-revision", repoUrl: row.source_repo_url ?? "", commitSha: row.source_commit_sha ?? "" };
}

function toReleaseRecord(row: ReleaseRow): ReleaseRecord {
  return {
    workspaceId: row.workspace_id,
    id: row.id,
    label: row.label,
    source: toReleaseSource(row),
    createdByPrincipalId: row.created_by_principal_id,
    createdAtIso: row.created_at,
    version: row.version,
  };
}

function toRunRecord(row: RunRow): DeploymentRunRecord {
  return {
    workspaceId: row.workspace_id,
    id: row.id,
    providerId: row.provider_id,
    targetId: row.target_id,
    environmentId: row.environment_id,
    releaseId: row.release_id,
    status: row.status as DeploymentRunRecord["status"],
    providerRunRef: row.provider_run_ref,
    reconciliation: row.reconciliation as DeploymentRunRecord["reconciliation"],
    requestedByPrincipalId: row.requested_by_principal_id,
    requestedAtIso: row.requested_at,
    startedAtIso: row.started_at,
    finishedAtIso: row.finished_at,
    errorSummary: row.error_summary,
    version: row.version,
  };
}

export class SqlDeploymentsReadRepo implements DeploymentsReadRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async listEnvironments(required: { workspaceId: string }): Promise<EnvironmentRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("deployment_environments")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .orderBy("created_at", "desc")
        .limit(DEPLOYMENTS_READ_LIST_LIMIT)
        .execute()
    );
    return rows.map(toEnvironmentRecord);
  }

  async listTargets(required: { workspaceId: string }): Promise<DeploymentTargetRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("deployment_targets")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .orderBy("created_at", "desc")
        .limit(DEPLOYMENTS_READ_LIST_LIMIT)
        .execute()
    );
    return rows.map(toTargetRecord);
  }

  async listReleases(required: { workspaceId: string }): Promise<ReleaseRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("releases")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .orderBy("created_at", "desc")
        .limit(DEPLOYMENTS_READ_LIST_LIMIT)
        .execute()
    );
    return rows.map(toReleaseRecord);
  }

  async listRuns(required: { workspaceId: string }): Promise<DeploymentRunRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("deployment_runs")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .orderBy("requested_at", "desc")
        .limit(DEPLOYMENTS_READ_LIST_LIMIT)
        .execute()
    );
    return rows.map(toRunRecord);
  }
}

/** The deployments read repo on `kernel`'s database, whichever dialect. */
export function deploymentsReadRepoFor(kernel: ContentKernel): DeploymentsReadRepoPort {
  return new SqlDeploymentsReadRepo(kernel);
}
