import type { UUID } from "@jini-ai/cms/core";
import { FormSlugConflictError } from "./errors";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "./ports";
import type { FormDefinitionRecord, FormSubmissionPage, FormSubmissionRecord } from "./types";

/**
 * @file In-memory adapters for `forms` (rule-of-two half #1, ADR-006).
 *
 * Purpose:
 * Test/dev-default implementations of `FormDefinitionRepoPort`/`FormSubmissionRepoPort`. Emulates
 * the real DB unique index on `(workspaceId, slug)` (behavior.spec.md §6.1) so `create` throws the
 * same `FormSlugConflictError` shape a `repo.sqlite.ts` unique-constraint violation would map to —
 * write-service.ts's error handling is identical against either adapter.
 */

function cloneDefinition(record: FormDefinitionRecord): FormDefinitionRecord {
  return {
    ...record,
    fields: record.fields.map((f) => ({ ...f })),
    notify: { ...record.notify, recipients: [...record.notify.recipients] },
  };
}

export class InMemoryFormDefinitionRepo implements FormDefinitionRepoPort {
  private readonly rows = new Map<UUID, FormDefinitionRecord>();

  async findById(required: { workspaceId: UUID; id: UUID }): Promise<FormDefinitionRecord | null> {
    const row = this.rows.get(required.id);
    if (!row || row.workspaceId !== required.workspaceId) return null;
    return cloneDefinition(row);
  }

  async findBySlug(required: { workspaceId: UUID; slug: string }): Promise<FormDefinitionRecord | null> {
    for (const row of this.rows.values()) {
      if (row.workspaceId === required.workspaceId && row.slug === required.slug) {
        return cloneDefinition(row);
      }
    }
    return null;
  }

  async list(required: { workspaceId: UUID }): Promise<FormDefinitionRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.workspaceId === required.workspaceId)
      .map(cloneDefinition);
  }

  async create(record: FormDefinitionRecord): Promise<void> {
    const existing = await this.findBySlug({ workspaceId: record.workspaceId, slug: record.slug });
    if (existing) {
      throw new FormSlugConflictError(`a form with slug '${record.slug}' already exists`, record.slug);
    }
    this.rows.set(record.id, cloneDefinition(record));
  }

  async update(record: FormDefinitionRecord): Promise<void> {
    this.rows.set(record.id, cloneDefinition(record));
  }
}

export class InMemoryFormSubmissionRepo implements FormSubmissionRepoPort {
  private readonly rows = new Map<UUID, FormSubmissionRecord>();

  async findById(required: { workspaceId: UUID; id: UUID }): Promise<FormSubmissionRecord | null> {
    const row = this.rows.get(required.id);
    if (!row || row.workspaceId !== required.workspaceId) return null;
    return { ...row, data: { ...row.data } };
  }

  async create(record: FormSubmissionRecord): Promise<void> {
    this.rows.set(record.id, { ...record, data: { ...record.data } });
  }

  async listByDefinition(required: {
    workspaceId: UUID;
    formDefinitionId: UUID;
    limit: number;
    cursor?: string | null;
  }): Promise<FormSubmissionPage> {
    const all = [...this.rows.values()]
      .filter(
        (row) => row.workspaceId === required.workspaceId && row.formDefinitionId === required.formDefinitionId
      )
      // Newest-first (behavior.spec.md §2.1): submittedAt desc, id desc tie-break.
      .sort((a, b) => {
        if (a.submittedAt !== b.submittedAt) return b.submittedAt.localeCompare(a.submittedAt);
        return b.id.localeCompare(a.id);
      });

    const startIndex = required.cursor
      ? all.findIndex((row) => row.id === required.cursor) + 1
      : 0;
    const page = all.slice(startIndex, startIndex + required.limit);
    const nextCursor =
      startIndex + required.limit < all.length ? page[page.length - 1]?.id ?? null : null;

    return { items: page.map((row) => ({ ...row, data: { ...row.data } })), nextCursor };
  }

  async delete(required: { workspaceId: UUID; id: UUID }): Promise<void> {
    const row = this.rows.get(required.id);
    if (row && row.workspaceId === required.workspaceId) {
      this.rows.delete(required.id);
    }
  }
}
