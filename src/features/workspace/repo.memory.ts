import type { WorkspaceRecord, WorkspaceRepoPort } from "./create";

/**
 * @file In-memory workspace repository adapter.
 *
 * Purpose:
 * Provides a local `WorkspaceRepoPort` implementation for development/tests.
 *
 * How it relates to the project:
 * - Satisfies repository contract defined in `src/features/workspace/create.ts`.
 * - Injected by `src/server/app.ts` during runtime composition.
 * - Used by slice tests for database-free verification.
 *
 * Architectural role:
 * Temporary/local adapter. A database-backed adapter should implement the same
 * interface so slice logic remains unchanged.
 */
export class InMemoryWorkspaceRepo implements WorkspaceRepoPort {
  /** Internal record storage. */
  private rows: WorkspaceRecord[];

  constructor(initialRows: WorkspaceRecord[] = []) {
    this.rows = [...initialRows];
  }

  /** Insert one workspace record. */
  async insert(record: WorkspaceRecord): Promise<void> {
    this.rows.push(record);
  }

  /** Find workspace by unique slug. */
  async findBySlug(slug: string): Promise<WorkspaceRecord | null> {
    return this.rows.find((row) => row.slug === slug) ?? null;
  }

  /** SPEC-044 REQ-08. Find workspace by id. */
  async findById(id: string): Promise<WorkspaceRecord | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  /** SPEC-044 REQ-08. All workspace rows (v1 always has exactly one — see `delete.ts`'s header). */
  async list(): Promise<WorkspaceRecord[]> {
    return [...this.rows];
  }

  /** SPEC-044 REQ-08. Replace the row matching `record.id` in place. */
  async update(record: WorkspaceRecord): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === record.id);
    if (index === -1) return;
    this.rows[index] = record;
  }

  /** SPEC-044 REQ-08. Remove the row matching `id`, if present (idempotent). */
  async delete(id: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.id !== id);
  }
}
