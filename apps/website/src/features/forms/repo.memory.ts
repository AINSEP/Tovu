import type { UUID } from "@jini-ai/cms/core";
import { FormSlugConflictError } from "./errors.js";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "./ports.js";
import type { FormDefinitionRecord, FormSubmissionPage, FormSubmissionRecord } from "./types.js";

/**
 * @file In-memory adapters for `forms` (rule-of-two half #1, ADR-006).
 *
 * Purpose:
 * Test/dev-default implementations of `FormDefinitionRepoPort`/`FormSubmissionRepoPort`. Emulates
 * the real DB unique index on `(workspaceId, slug)` (behavior.spec.md §6.1) so `create` throws the
 * same `FormSlugConflictError` shape a `repo.sqlite.ts` unique-constraint violation would map to —
 * write-service.ts's error handling is identical against either adapter.
 *
 * `InMemoryFormDefinitionRepo` stores `deletedAt` internally (mirroring `form_definitions.deleted_at`,
 * owner ruling 2026-09-21) but never returns it through `FormDefinitionRepoPort` — those methods are
 * trash-aware and fail-closed, same as `repo.sqlite.ts`'s `isNull(deletedAt)` reads. `findAnyById`/
 * `save`/`hardDelete` are the deliberate, memory-ONLY exception: a trash-blind seam for the hermetic
 * composition's `createRecordStoreTrashAdapter` (`features/trash/adapters/record-store.ts`), which
 * needs to see and flip a hidden row directly. They are not part of `FormDefinitionRepoPort`.
 */

/** Internal storage shape — the one place in this file allowed to know about `deletedAt`. */
interface StoredFormDefinition extends FormDefinitionRecord {
  deletedAt: string | null;
}

function cloneStored(row: StoredFormDefinition): StoredFormDefinition {
  return {
    ...row,
    fields: row.fields.map((f) => ({ ...f })),
    notify: { ...row.notify, recipients: [...row.notify.recipients] },
  };
}

/** Strips the internal-only `deletedAt` before a row crosses `FormDefinitionRepoPort`'s boundary. */
function toPublicRecord(row: StoredFormDefinition): FormDefinitionRecord {
  const { deletedAt: _deletedAt, ...record } = cloneStored(row);
  return record;
}

export class InMemoryFormDefinitionRepo implements FormDefinitionRepoPort {
  private readonly rows = new Map<UUID, StoredFormDefinition>();

  /** Trash-aware: never returns a row with `deletedAt` set. */
  async findById(required: { workspaceId: UUID; id: UUID }): Promise<FormDefinitionRecord | null> {
    const row = this.rows.get(required.id);
    if (!row || row.workspaceId !== required.workspaceId || row.deletedAt !== null) return null;
    return toPublicRecord(row);
  }

  /** Trash-aware: never returns a row with `deletedAt` set. */
  async findBySlug(required: { workspaceId: UUID; slug: string }): Promise<FormDefinitionRecord | null> {
    for (const row of this.rows.values()) {
      if (row.workspaceId === required.workspaceId && row.slug === required.slug && row.deletedAt === null) {
        return toPublicRecord(row);
      }
    }
    return null;
  }

  /** Trash-aware: never lists a row with `deletedAt` set. */
  async list(required: { workspaceId: UUID }): Promise<FormDefinitionRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.workspaceId === required.workspaceId && row.deletedAt === null)
      .map(toPublicRecord);
  }

  async create(record: FormDefinitionRecord): Promise<void> {
    const conflicting = [...this.rows.values()].find(
      (row) => row.workspaceId === record.workspaceId && row.slug === record.slug
    );
    if (conflicting) {
      // Trash-blind, deliberately — see `ports.ts`'s doc on `create` for why a trashed row still
      // conflicts, and `repo.sqlite.ts`'s identical message for why the two adapters must agree.
      const message =
        conflicting.deletedAt !== null
          ? `a form with slug '${record.slug}' is in the Trash — restore it, or delete it permanently from the Trash, to reuse the slug`
          : `a form with slug '${record.slug}' already exists`;
      throw new FormSlugConflictError(message, record.slug);
    }
    this.rows.set(record.id, { ...cloneStored({ ...record, deletedAt: null }) });
  }

  /**
   * Update-only path for a LIVE row. A stale in-hand copy of a row that has since been trashed is
   * silently a no-op (mirrors `repo.sqlite.ts`'s `isNull(deletedAt)` WHERE guard) — it can never
   * clear a marker it never knew was set. A record with no existing row at all is still accepted
   * (pre-existing behavior of this in-memory double, unrelated to trashing).
   */
  async update(record: FormDefinitionRecord): Promise<void> {
    const existing = this.rows.get(record.id);
    if (existing && existing.deletedAt !== null) return;
    this.rows.set(record.id, cloneStored({ ...record, deletedAt: existing?.deletedAt ?? null }));
  }

  /** Trash-BLIND — see `ports.ts`'s doc for why this is the one deliberate exception. */
  async isSlugTaken(required: { workspaceId: UUID; slug: string }): Promise<boolean> {
    for (const row of this.rows.values()) {
      if (row.workspaceId === required.workspaceId && row.slug === required.slug) return true;
    }
    return false;
  }

  /** Trash-BLIND write — see `ports.ts`'s doc for why this exists only for the delete rollback. */
  async clearTrashMarker(required: { workspaceId: UUID; id: UUID; at: string }): Promise<void> {
    const existing = this.rows.get(required.id);
    if (!existing || existing.workspaceId !== required.workspaceId) return;
    this.rows.set(required.id, { ...existing, deletedAt: null, updatedAt: required.at, version: existing.version + 1 });
  }

  /**
   * Trash-BLIND — memory-only, NOT part of `FormDefinitionRepoPort`. The hermetic composition's
   * `createRecordStoreTrashAdapter` reads through this to flip `deletedAt` directly, the same way
   * the real adapter reads columns without going through the trash-aware port reads.
   */
  async findAnyById(required: { workspaceId: UUID; id: UUID }): Promise<StoredFormDefinition | null> {
    const row = this.rows.get(required.id);
    if (!row || row.workspaceId !== required.workspaceId) return null;
    return cloneStored(row);
  }

  /** Trash-BLIND write — memory-only, NOT part of `FormDefinitionRepoPort`. See `findAnyById`'s doc. */
  async save(record: StoredFormDefinition): Promise<void> {
    this.rows.set(record.id, cloneStored(record));
  }

  /** Memory-only, NOT part of `FormDefinitionRepoPort`. Removes only the definition row — the
   *  composition root pairs this with `InMemoryFormSubmissionRepo.deleteAllForDefinition` the same
   *  way `features/trash/adapters/form.ts` deletes submissions before the definition. */
  async hardDelete(required: { workspaceId: UUID; id: UUID }): Promise<void> {
    const row = this.rows.get(required.id);
    if (row && row.workspaceId === required.workspaceId) {
      this.rows.delete(required.id);
    }
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

  /** Memory-only, NOT part of `FormSubmissionRepoPort`. Bulk cascade for a form purge — see
   *  `InMemoryFormDefinitionRepo.hardDelete`'s doc for why the composition root pairs the two. */
  async deleteAllForDefinition(required: { workspaceId: UUID; formDefinitionId: UUID }): Promise<void> {
    for (const [id, row] of this.rows) {
      if (row.workspaceId === required.workspaceId && row.formDefinitionId === required.formDefinitionId) {
        this.rows.delete(id);
      }
    }
  }
}
