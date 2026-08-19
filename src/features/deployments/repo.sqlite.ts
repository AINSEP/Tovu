import { desc, eq } from "drizzle-orm";

import { deploymentEnvironments, deploymentRuns, deploymentTargets, releases } from "../../db/schema.js";
import type { ContentDb } from "../../db/sqlite/content-db.js";
import { DEPLOYMENTS_READ_LIST_LIMIT, type DeploymentsReadRepoPort } from "./read-repo.js";
import type { DeploymentRunRecord, DeploymentTargetRecord, EnvironmentRecord, ReleaseRecord, ReleaseSource } from "./types.js";

/**
 * @file Drizzle/SQLite adapter for `DeploymentsReadRepoPort` — the real implementation
 * `server/deps.ts` composes, reading the five `deployment_*`/`releases` tables migration `0037`
 * already created and applied. Mirrors `features/post/repo.sqlite.ts`'s shape (a `ContentDb`
 * constructor param, one `toXRecord` mapper per table, `.all()` on a synchronous better-sqlite3
 * query wrapped in an `async` method for port-interface parity).
 */

type EnvironmentRow = typeof deploymentEnvironments.$inferSelect;
type TargetRow = typeof deploymentTargets.$inferSelect;
type ReleaseRow = typeof releases.$inferSelect;
type RunRow = typeof deploymentRuns.$inferSelect;

function toEnvironmentRecord(row: EnvironmentRow): EnvironmentRecord {
  return {
    workspaceId: row.workspaceId,
    id: row.id,
    name: row.name,
    slug: row.slug,
    isProduction: row.isProduction === 1,
    createdAtIso: row.createdAt,
    version: row.version,
  };
}

function toTargetRecord(row: TargetRow): DeploymentTargetRecord {
  return {
    workspaceId: row.workspaceId,
    id: row.id,
    environmentId: row.environmentId,
    providerId: row.providerId,
    label: row.label,
    config: JSON.parse(row.configJson) as Record<string, unknown>,
    enabled: row.enabled === 1,
    createdAtIso: row.createdAt,
    version: row.version,
  };
}

/** `sourceKind` is the CHECK-constrained discriminant (`releases_source_kind_check`); the two
 *  branches below read exactly the columns that kind's `ReleaseSource` variant declares — the
 *  other kind's columns are always `NULL` on that row by construction (`repo.sqlite.ts`'s own
 *  writer, not built this pass, would be the only writer of either shape). */
function toReleaseSource(row: ReleaseRow): ReleaseSource {
  if (row.sourceKind === "external-artifact") {
    return { kind: "external-artifact", uri: row.sourceUri ?? "", ...(row.sourceChecksum ? { checksum: row.sourceChecksum } : {}) };
  }
  return { kind: "git-revision", repoUrl: row.sourceRepoUrl ?? "", commitSha: row.sourceCommitSha ?? "" };
}

function toReleaseRecord(row: ReleaseRow): ReleaseRecord {
  return {
    workspaceId: row.workspaceId,
    id: row.id,
    label: row.label,
    source: toReleaseSource(row),
    createdByPrincipalId: row.createdByPrincipalId,
    createdAtIso: row.createdAt,
    version: row.version,
  };
}

function toRunRecord(row: RunRow): DeploymentRunRecord {
  return {
    workspaceId: row.workspaceId,
    id: row.id,
    providerId: row.providerId,
    targetId: row.targetId,
    environmentId: row.environmentId,
    releaseId: row.releaseId,
    status: row.status as DeploymentRunRecord["status"],
    providerRunRef: row.providerRunRef,
    reconciliation: row.reconciliation as DeploymentRunRecord["reconciliation"],
    requestedByPrincipalId: row.requestedByPrincipalId,
    requestedAtIso: row.requestedAt,
    startedAtIso: row.startedAt,
    finishedAtIso: row.finishedAt,
    errorSummary: row.errorSummary,
    version: row.version,
  };
}

export class SqliteDeploymentsReadRepo implements DeploymentsReadRepoPort {
  constructor(private readonly db: ContentDb) {}

  async listEnvironments(required: { workspaceId: string }): Promise<EnvironmentRecord[]> {
    const rows = this.db
      .select()
      .from(deploymentEnvironments)
      .where(eq(deploymentEnvironments.workspaceId, required.workspaceId))
      .orderBy(desc(deploymentEnvironments.createdAt))
      .limit(DEPLOYMENTS_READ_LIST_LIMIT)
      .all();
    return rows.map(toEnvironmentRecord);
  }

  async listTargets(required: { workspaceId: string }): Promise<DeploymentTargetRecord[]> {
    const rows = this.db
      .select()
      .from(deploymentTargets)
      .where(eq(deploymentTargets.workspaceId, required.workspaceId))
      .orderBy(desc(deploymentTargets.createdAt))
      .limit(DEPLOYMENTS_READ_LIST_LIMIT)
      .all();
    return rows.map(toTargetRecord);
  }

  async listReleases(required: { workspaceId: string }): Promise<ReleaseRecord[]> {
    const rows = this.db
      .select()
      .from(releases)
      .where(eq(releases.workspaceId, required.workspaceId))
      .orderBy(desc(releases.createdAt))
      .limit(DEPLOYMENTS_READ_LIST_LIMIT)
      .all();
    return rows.map(toReleaseRecord);
  }

  async listRuns(required: { workspaceId: string }): Promise<DeploymentRunRecord[]> {
    const rows = this.db
      .select()
      .from(deploymentRuns)
      .where(eq(deploymentRuns.workspaceId, required.workspaceId))
      .orderBy(desc(deploymentRuns.requestedAt))
      .limit(DEPLOYMENTS_READ_LIST_LIMIT)
      .all();
    return rows.map(toRunRecord);
  }
}
