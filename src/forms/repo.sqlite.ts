import { and, desc, eq, lt, or } from "drizzle-orm";

import type { UUID } from "@jini-ai/cms/core";
import { formDefinitions, formSubmissions } from "../db/schema.js";
import type { ContentDb } from "../db/sqlite/content-db.js";
import { findOneBy } from "../db/sqlite/repo-helpers.js";
import { FormSlugConflictError } from "./errors.js";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "./ports.js";
import type {
  FieldDescriptor,
  FormDefinitionRecord,
  FormDefinitionStatus,
  FormSubmissionPage,
  FormSubmissionRecord,
  NotifyConfig,
} from "./types.js";

/**
 * @file Drizzle/SQLite adapters for `forms` (rule-of-two half #2, ADR-006, C-012).
 *
 * `create`'s slug-uniqueness relies on the real DB unique index
 * (`form_definitions_workspace_slug_unique`, `db/schema.ts`) — behavior.spec.md §6.1's
 * actual tie-break mechanism, not app-level check-then-insert. A `SQLITE_CONSTRAINT_UNIQUE`
 * violation is mapped here to `FormSlugConflictError`, matching `repo.memory.ts`'s emulated
 * behavior so `write-service.ts`'s error handling is identical against either adapter.
 */

type FormDefinitionRow = typeof formDefinitions.$inferSelect;
type FormSubmissionRow = typeof formSubmissions.$inferSelect;

function toDefinitionRecord(row: FormDefinitionRow): FormDefinitionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    slug: row.slug,
    fields: JSON.parse(row.fieldsJson) as FieldDescriptor[],
    notify: JSON.parse(row.notifyJson) as NotifyConfig,
    status: row.status as FormDefinitionStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDefinitionRow(record: FormDefinitionRecord) {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    slug: record.slug,
    fieldsJson: JSON.stringify(record.fields),
    notifyJson: JSON.stringify(record.notify),
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toSubmissionRecord(row: FormSubmissionRow): FormSubmissionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    formDefinitionId: row.formDefinitionId,
    data: JSON.parse(row.dataJson) as Record<string, string | boolean>,
    sourceIp: row.sourceIp,
    submittedAt: row.submittedAt,
  };
}

/** True for a better-sqlite3 unique-constraint violation (any dialect-specific message shape). */
function isUniqueConstraintViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return code === "SQLITE_CONSTRAINT_UNIQUE" || err.message.includes("UNIQUE constraint failed");
}

export class SqliteFormDefinitionRepo implements FormDefinitionRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: UUID; id: UUID }): Promise<FormDefinitionRecord | null> {
    return findOneBy(
      this.db,
      formDefinitions,
      [eq(formDefinitions.workspaceId, required.workspaceId), eq(formDefinitions.id, required.id)],
      toDefinitionRecord
    );
  }

  async findBySlug(required: { workspaceId: UUID; slug: string }): Promise<FormDefinitionRecord | null> {
    return findOneBy(
      this.db,
      formDefinitions,
      [eq(formDefinitions.workspaceId, required.workspaceId), eq(formDefinitions.slug, required.slug)],
      toDefinitionRecord
    );
  }

  async list(required: { workspaceId: UUID }): Promise<FormDefinitionRecord[]> {
    const rows = this.db
      .select()
      .from(formDefinitions)
      .where(eq(formDefinitions.workspaceId, required.workspaceId))
      .all();
    return rows.map(toDefinitionRecord);
  }

  async create(record: FormDefinitionRecord): Promise<void> {
    try {
      this.db.insert(formDefinitions).values(toDefinitionRow(record)).run();
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw new FormSlugConflictError(`a form with slug '${record.slug}' already exists`, record.slug);
      }
      throw err;
    }
  }

  async update(record: FormDefinitionRecord): Promise<void> {
    const row = toDefinitionRow(record);
    this.db
      .update(formDefinitions)
      .set(row)
      .where(and(eq(formDefinitions.workspaceId, record.workspaceId), eq(formDefinitions.id, record.id)))
      .run();
  }
}

export class SqliteFormSubmissionRepo implements FormSubmissionRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: UUID; id: UUID }): Promise<FormSubmissionRecord | null> {
    return findOneBy(
      this.db,
      formSubmissions,
      [eq(formSubmissions.workspaceId, required.workspaceId), eq(formSubmissions.id, required.id)],
      toSubmissionRecord
    );
  }

  async create(record: FormSubmissionRecord): Promise<void> {
    this.db
      .insert(formSubmissions)
      .values({
        id: record.id,
        workspaceId: record.workspaceId,
        formDefinitionId: record.formDefinitionId,
        dataJson: JSON.stringify(record.data),
        sourceIp: record.sourceIp,
        submittedAt: record.submittedAt,
      })
      .run();
  }

  async listByDefinition(required: {
    workspaceId: UUID;
    formDefinitionId: UUID;
    limit: number;
    cursor?: string | null;
  }): Promise<FormSubmissionPage> {
    let cursorSubmittedAt: string | null = null;
    let cursorId: string | null = null;
    if (required.cursor) {
      const cursorRow = this.db
        .select()
        .from(formSubmissions)
        .where(and(eq(formSubmissions.workspaceId, required.workspaceId), eq(formSubmissions.id, required.cursor)))
        .all()[0];
      if (cursorRow) {
        cursorSubmittedAt = cursorRow.submittedAt;
        cursorId = cursorRow.id;
      }
    }

    const baseCondition = and(
      eq(formSubmissions.workspaceId, required.workspaceId),
      eq(formSubmissions.formDefinitionId, required.formDefinitionId)
    );

    // Newest-first (submittedAt desc, id desc tie-break, behavior.spec.md §2.1). Cursor resumes
    // strictly after the previously returned page's last row on that same ordering.
    const condition =
      cursorSubmittedAt && cursorId
        ? and(
            baseCondition,
            or(
              lt(formSubmissions.submittedAt, cursorSubmittedAt),
              and(eq(formSubmissions.submittedAt, cursorSubmittedAt), lt(formSubmissions.id, cursorId))
            )
          )
        : baseCondition;

    const rows = this.db
      .select()
      .from(formSubmissions)
      .where(condition)
      .orderBy(desc(formSubmissions.submittedAt), desc(formSubmissions.id))
      .limit(required.limit + 1)
      .all();

    const hasMore = rows.length > required.limit;
    const page = hasMore ? rows.slice(0, required.limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

    return { items: page.map(toSubmissionRecord), nextCursor };
  }

  async delete(required: { workspaceId: UUID; id: UUID }): Promise<void> {
    this.db
      .delete(formSubmissions)
      .where(and(eq(formSubmissions.workspaceId, required.workspaceId), eq(formSubmissions.id, required.id)))
      .run();
  }
}
