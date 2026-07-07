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
}
