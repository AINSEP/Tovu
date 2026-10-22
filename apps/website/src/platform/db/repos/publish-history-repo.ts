import type { Insertable, Selectable } from "kysely";

import type { UUID } from "@jini-ai/core/primitives";

import type {
  PublishHistoryEntry,
  PublishHistoryStore,
  PublishTrigger,
  StaticPublishTargetId,
} from "#src/features/deployments/static-publish/index";
import { resolvePublishHistoryListLimit } from "#src/contracts/core/publish-history-list-limit";
import type { ContentKernel } from "../content-kernel.js";
import type { PublishHistoryTable } from "../content-database.generated.js";
import { toBool } from "../kernel/index.js";

/**
 * @file THE `PublishHistoryStore` adapter over `publish_history`: one Kysely query body for every
 * dialect (storage plan §4, ADR-066). See `static-publish/publish-history.ts`'s own header for why
 * this replaced a flat JSON file under `infra/publish-history/`. ADR-006 rule-of-two "second
 * adapter" half; `InMemoryPublishHistoryStore` (same domain file) is the first. A plain `INSERT`
 * per write (no group invariant across rows, so no transaction), `ORDER BY id DESC` reads scoped
 * by `workspace_id` (+ optional `target`). `sqlite/publish-history-repo.sqlite.ts` is the thin
 * subclass built from the content db handle.
 */

/** @complexity O(1) — fixed-shape field mapping, no iteration. */
function toRecord(row: Selectable<PublishHistoryTable>): PublishHistoryEntry {
  return {
    target: row.target as StaticPublishTargetId,
    ...(row.kind && row.kind !== "static" ? { kind: row.kind as NonNullable<PublishHistoryEntry["kind"]> } : {}),
    url: row.url,
    // `toBool` is null only for a NULL column, which `reachable NOT NULL` never yields; read it as false.
    reachable: toBool(row.reachable) === true,
    status: row.status,
    projectName: row.project_name,
    ...(row.credential_id !== null ? { credentialId: row.credential_id } : {}),
    ...(row.config_fields_json !== null ? { configFields: JSON.parse(row.config_fields_json) as Record<string, string> } : {}),
    publishedAt: row.published_at,
    ...providerFields(row),
    triggeredBy: row.triggered_by as PublishTrigger,
  };
}

/** The per-target provider fields (a git-backed target's repo location, a provider's own deploy id), each
 * present only when its column is non-NULL — absent keys, never present-but-`undefined` ones.
 * @complexity O(1). */
function providerFields(
  row: Selectable<PublishHistoryTable>,
): Pick<PublishHistoryEntry, "owner" | "repo" | "basePath" | "deploymentId" | "commitSha" | "branch"> {
  return {
    ...(row.owner !== null ? { owner: row.owner } : {}),
    ...(row.repo !== null ? { repo: row.repo } : {}),
    ...(row.base_path !== null ? { basePath: row.base_path } : {}),
    ...(row.deployment_id !== null ? { deploymentId: row.deployment_id } : {}),
    ...(row.commit_sha !== null ? { commitSha: row.commit_sha } : {}),
    ...(row.branch !== null ? { branch: row.branch } : {}),
  };
}

/** @complexity O(1). */
function toValues(workspaceId: UUID, entry: PublishHistoryEntry): Insertable<PublishHistoryTable> {
  return {
    workspace_id: workspaceId,
    kind: entry.kind ?? "static",
    target: entry.target,
    url: entry.url,
    reachable: entry.reachable,
    status: entry.status,
    project_name: entry.projectName,
    credential_id: entry.credentialId ?? null,
    config_fields_json: entry.configFields === undefined ? null : JSON.stringify(entry.configFields),
    published_at: entry.publishedAt,
    owner: entry.owner ?? null,
    repo: entry.repo ?? null,
    base_path: entry.basePath ?? null,
    deployment_id: entry.deploymentId ?? null,
    commit_sha: entry.commitSha ?? null,
    branch: entry.branch ?? null,
    triggered_by: entry.triggeredBy,
  };
}

export class SqlPublishHistoryStore implements PublishHistoryStore {
  constructor(protected readonly kernel: ContentKernel) {}

  /** Group before limiting so frequent publishes cannot hide an older destination. One query over
   * workspace history with database grouping/sorting and at most 201 returned rows. */
  async listDestinationHistory(input: { workspaceId: UUID }): Promise<PublishHistoryEntry[]> {
    const rows = await this.kernel.run(db => db.selectFrom("publish_history").selectAll()
      .where("workspace_id", "=", input.workspaceId)
      .where("id", "in", db.selectFrom("publish_history")
        .select(eb => eb.fn.max<number>("id").as("id"))
        .where("workspace_id", "=", input.workspaceId)
        .where(eb => eb.or([eb("reachable", "=", true), eb.and([eb("kind", "=", "deploy"), eb("status", "=", "started")])]))
        .where(eb => eb.or([eb("config_fields_json", "is not", null), eb("kind", "in", ["tovu-peer", "deploy"])]))
        .groupBy(eb => [eb.fn.coalesce("kind", eb.val("static")), "target", "project_name"]))
      .orderBy("id", "desc").limit(201).execute());
    return rows.map(toRecord);
  }

  async getLast(input: { workspaceId: UUID; target: StaticPublishTargetId }): Promise<PublishHistoryEntry | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("publish_history")
        .selectAll()
        .where("workspace_id", "=", input.workspaceId)
        .where("target", "=", input.target)
        .where(eb => eb.or([eb("kind", "=", "static"), eb("kind", "is", null)]))
        .orderBy("id", "desc")
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async list(input: { workspaceId: UUID; target?: StaticPublishTargetId; limit?: number }): Promise<PublishHistoryEntry[]> {
    const limit = resolvePublishHistoryListLimit(input.limit);
    const rows = await this.kernel.run((db) => {
      let query = db.selectFrom("publish_history").selectAll().where("workspace_id", "=", input.workspaceId);
      if (input.target !== undefined) query = query.where("target", "=", input.target);
      return query.orderBy("id", "desc").limit(limit).execute();
    });
    return rows.map(toRecord);
  }

  /** Full-ledger projection; DISTINCT prevents repeated publishes hiding an older live URL.
   * SQL work is O(history rows), returned memory is bounded to 201 URL strings. No writes. */
  async listLiveUrls(input: { workspaceId: UUID }): Promise<string[]> {
    const rows = await this.kernel.run(db => db.selectFrom("publish_history").select("url")
      .where("workspace_id", "=", input.workspaceId).distinct().orderBy("url").limit(201).execute());
    return rows.map(row => row.url);
  }

  /** Append-only insert, no transaction control of its own: a single-row append has no group
   *  invariant to protect. */
  async recordSuccess(input: { workspaceId: UUID; entry: PublishHistoryEntry }): Promise<void> {
    await this.kernel.run((db) => db.insertInto("publish_history").values(toValues(input.workspaceId, input.entry)).execute());
  }
}

/** The publish history store on `kernel`'s database, whichever dialect. */
export function publishHistoryStoreFor(kernel: ContentKernel): PublishHistoryStore {
  return new SqlPublishHistoryStore(kernel);
}
