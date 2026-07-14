import type { UUID } from "../core/ports";
import type { FormDefinitionRecord, FormSubmissionPage, FormSubmissionRecord } from "./types";

/**
 * @file Port contracts for the `forms` library (SPEC-010, ADR-PIPE-010, C-012).
 *
 * Purpose:
 * Dependency-inversion seam (ADR-006 rule-of-two) for the two Forms-owned tables. Two ports, not
 * one — definitions and submissions have distinct lifecycles (INV-08): `FormDefinitionRepoPort`
 * structurally exposes no delete method (a form definition is never permanently deleted, only
 * `active` ⇄ `disabled`); `FormSubmissionRepoPort` does expose `delete` (REQ-14 — a submission
 * supports permanent delete, unlike its definition).
 *
 * Interfaces and types only — no feature logic.
 */
export interface FormDefinitionRepoPort {
  findById(required: { workspaceId: UUID; id: UUID }): Promise<FormDefinitionRecord | null>;
  findBySlug(required: { workspaceId: UUID; slug: string }): Promise<FormDefinitionRecord | null>;
  list(required: { workspaceId: UUID }): Promise<FormDefinitionRecord[]>;
  /**
   * Insert-only path. Callers (write-service.ts) must translate a unique-constraint violation on
   * `(workspaceId, slug)` into `FormSlugConflictError` (behavior.spec.md §6.1 — the DB unique
   * index is the actual tie-break mechanism, not app-level logic).
   */
  create(record: FormDefinitionRecord): Promise<void>;
  /** Update-only path for an existing row (create/update are deliberately distinct methods — no upsert — since `create` must surface a genuine slug-uniqueness race distinctly from an update). */
  update(record: FormDefinitionRecord): Promise<void>;
  // Deliberately NO delete method — INV-08 is enforced structurally by this port's shape, not by
  // convention (a real Tier-1-shaped seam an implementor cannot accidentally violate).
}

export interface FormSubmissionRepoPort {
  findById(required: { workspaceId: UUID; id: UUID }): Promise<FormSubmissionRecord | null>;
  create(record: FormSubmissionRecord): Promise<void>;
  /**
   * Newest-first (behavior.spec.md §2.1), `submittedAt` descending with `id` descending as the
   * tie-break. `cursor` (opaque, when provided) resumes after the previously returned page's last
   * row; `limit` is 1..100 (behavior.spec.md §4), enforced by the caller before this is invoked.
   */
  listByDefinition(required: {
    workspaceId: UUID;
    formDefinitionId: UUID;
    limit: number;
    cursor?: string | null;
  }): Promise<FormSubmissionPage>;
  /** Permanent delete (REQ-14) — the one asymmetry vs. `FormDefinitionRepoPort`. */
  delete(required: { workspaceId: UUID; id: UUID }): Promise<void>;
}
