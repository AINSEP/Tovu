import type { Insertable, Selectable } from "kysely";

import type { ContentDatabase } from "../../platform/db/content-database.generated.js";
import { toBool } from "../../platform/db/kernel/index.js";
import type { Taxonomy, TaxonomyRevisionRow, Term } from "./index.js";

/**
 * @file Row mapping for `taxonomies` / `terms` / `entry_terms` / `taxonomy_revisions`, shared by every
 * dialect: the columns are the generated `ContentDatabase` types (snake_case, JSON as text, booleans
 * as 0/1 integers). Neutral on purpose — no repo, no driver.
 */

export type TaxonomyRowSelect = Selectable<ContentDatabase["taxonomies"]>;
export type TermRowSelect = Selectable<ContentDatabase["terms"]>;

/** One `taxonomies` row as a {@link Taxonomy}. */
export function toTaxonomy(row: TaxonomyRowSelect): Taxonomy {
  return {
    id: row.id,
    name: row.name,
    hierarchical: toBool(row.hierarchical) === true,
    status: row.status,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

/** The `taxonomies` row one insert writes for `workspaceId`. */
export function toTaxonomyRow(workspaceId: string, row: Taxonomy): Insertable<ContentDatabase["taxonomies"]> {
  return {
    id: row.id,
    workspace_id: workspaceId,
    name: row.name,
    hierarchical: row.hierarchical ? 1 : 0,
    status: row.status,
    updated_at: row.updatedAt,
    version: row.version,
  };
}

/** One `terms` row as a {@link Term}. */
export function toTerm(row: TermRowSelect): Term {
  return {
    id: row.id,
    taxonomyId: row.taxonomy_id,
    parentId: row.parent_id,
    name: row.name,
    status: row.status,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

/** The `terms` row one insert writes for `workspaceId`. */
export function toTermRow(workspaceId: string, row: Term): Insertable<ContentDatabase["terms"]> {
  return {
    id: row.id,
    workspace_id: workspaceId,
    taxonomy_id: row.taxonomyId,
    parent_id: row.parentId,
    name: row.name,
    status: row.status,
    updated_at: row.updatedAt,
    version: row.version,
  };
}

/** The `taxonomy_revisions` row an append writes (compact JSON state; `seq` is database-assigned). */
export function toTaxonomyRevisionRow(
  workspaceId: string,
  row: TaxonomyRevisionRow
): Insertable<ContentDatabase["taxonomy_revisions"]> {
  return {
    workspace_id: workspaceId,
    taxonomy_id: row.taxonomyId,
    op: row.op,
    previous_state_json: row.previousState == null ? null : JSON.stringify(row.previousState),
    actor_id: row.actorId,
    recorded_at: row.recordedAt,
  };
}
