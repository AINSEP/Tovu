import type { Insertable, Selectable } from "kysely";

import type { ContentDatabase } from "../../platform/db/content-database.generated.js";
import type {
  FieldDescriptor,
  FormDefinitionRecord,
  FormDefinitionStatus,
  FormSubmissionRecord,
  NotifyConfig,
} from "@jini-ai/cms-forms";

/**
 * @file Row mapping for `form_definitions` / `form_submissions`, shared by every dialect: the columns
 * are the generated `ContentDatabase` types (snake_case, JSON as compact text). Neutral on purpose —
 * no repo, no driver.
 */

export type FormDefinitionRow = Selectable<ContentDatabase["form_definitions"]>;
export type FormSubmissionRow = Selectable<ContentDatabase["form_submissions"]>;

/** One `form_definitions` row as a {@link FormDefinitionRecord}. */
export function toDefinitionRecord(row: FormDefinitionRow): FormDefinitionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    slug: row.slug,
    fields: JSON.parse(row.fields_json) as FieldDescriptor[],
    notify: JSON.parse(row.notify_json) as NotifyConfig,
    status: row.status as FormDefinitionStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

/**
 * The `form_definitions` row an INSERT writes. `version` is included for `create`; `update()` strips
 * it (see {@link updatableDefinitionColumns}) because only the Trash's compare-and-set may move it.
 */
export function toDefinitionRow(record: FormDefinitionRecord): Insertable<ContentDatabase["form_definitions"]> {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    name: record.name,
    slug: record.slug,
    fields_json: JSON.stringify(record.fields),
    notify_json: JSON.stringify(record.notify),
    status: record.status,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    version: record.version,
  };
}

/** The columns `update()` writes: everything but the key and `version`. */
export function updatableDefinitionColumns(row: ReturnType<typeof toDefinitionRow>) {
  const { id: _id, workspace_id: _workspaceId, version: _version, ...rest } = row;
  return rest;
}

/** One `form_submissions` row as a {@link FormSubmissionRecord}. */
export function toSubmissionRecord(row: FormSubmissionRow): FormSubmissionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    formDefinitionId: row.form_definition_id,
    data: JSON.parse(row.data_json) as Record<string, string | boolean>,
    sourceIp: row.source_ip,
    submittedAt: row.submitted_at,
  };
}

/** The `form_submissions` row a submit writes (compact JSON data). */
export function toSubmissionRow(record: FormSubmissionRecord): Insertable<ContentDatabase["form_submissions"]> {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    form_definition_id: record.formDefinitionId,
    data_json: JSON.stringify(record.data),
    source_ip: record.sourceIp,
    submitted_at: record.submittedAt,
  };
}
