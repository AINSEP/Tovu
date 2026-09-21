import type { UUID } from "@jini-ai/cms/core";
import type { FormDefinitionRecord, FormSubmissionPage, FormSubmissionRecord } from "./types.js";

/**
 * @file Port contracts for the `forms` library (SPEC-010, ADR-PIPE-010, C-012).
 *
 * Purpose:
 * Dependency-inversion seam (ADR-006 rule-of-two) for the two Forms-owned tables. Two ports, not
 * one — definitions and submissions have distinct lifecycles: `FormSubmissionRepoPort` exposes
 * `delete` (REQ-14 — a single submission supports permanent delete on its own, outside the Trash).
 *
 * Owner ruling 2026-09-21 ("forms should be deleted like all the other stuff") superseded the
 * original INV-08 "a form definition is never permanently deleted" — see the `form` entry in `features/trash/
 * registry.ts`. `FormDefinitionRepoPort` still exposes structurally NO `delete` method: the new
 * invariant is that a definition is removed permanently only through a Trash purge (a human on the
 * Trash screen, or the 60-day sweeper), never through this port. Reads here are **trash-aware and
 * fail-closed**: `findById`/`findBySlug`/`list` exclude a trashed row, deliberately unlike posts
 * (whose repo stays trash-blind and filters in domain functions) — forms has roughly ten direct
 * consumers (public submit, the widget resolver, admin routes, agent tools, notify, content
 * duplication) and a consumer that forgot to filter would keep accepting submissions for a trashed
 * form. Filtering at the repo means a forgetful caller gets the safe answer, "not found", instead.
 *
 * Interfaces and types only — no feature logic.
 */
export interface FormDefinitionRepoPort {
  /** Trash-aware: never returns a row with `deleted_at` set. */
  findById(required: { workspaceId: UUID; id: UUID }): Promise<FormDefinitionRecord | null>;
  /** Trash-aware: never returns a row with `deleted_at` set. */
  findBySlug(required: { workspaceId: UUID; slug: string }): Promise<FormDefinitionRecord | null>;
  /** Trash-aware: never lists a row with `deleted_at` set. */
  list(required: { workspaceId: UUID }): Promise<FormDefinitionRecord[]>;
  /**
   * Insert-only path. Callers (write-service.ts) must translate a unique-constraint violation on
   * `(workspaceId, slug)` into `FormSlugConflictError` (behavior.spec.md §6.1 — the DB unique
   * index is the actual tie-break mechanism, not app-level logic). The conflicting row may itself
   * be trashed (the unique index has no `WHERE deleted_at IS NULL` clause — a trashed form keeps
   * its slug so restore is lossless), in which case the message names the Trash as the way out.
   */
  create(record: FormDefinitionRecord): Promise<void>;
  /**
   * Update-only path for an existing LIVE row (create/update are deliberately distinct methods —
   * no upsert — since `create` must surface a genuine slug-uniqueness race distinctly from an
   * update). Trash-aware and fail-closed the other direction too: an update can never revive a
   * trashed row — it silently affects zero rows if the record has since been trashed, the same way
   * a stale in-hand copy silently loses a concurrent edit elsewhere. The Trash's own `unhide` is the
   * only path back to live.
   */
  update(record: FormDefinitionRecord): Promise<void>;
  /**
   * Trash-BLIND — the one deliberate exception to this port's fail-closed reads. `true` for a slug
   * that is taken by a live OR a trashed row in the workspace, matching what the DB unique index
   * itself would reject. Its only production caller is `content_duplicate`'s slug derivation
   * (`tool-registrations.ts`), which must not offer a trashed form's slug as available only to have
   * the subsequent `create()` collide.
   */
  isSlugTaken(required: { workspaceId: UUID; slug: string }): Promise<boolean>;
  // Deliberately NO delete method — the new INV-08 is enforced structurally by this port's shape:
  // a form definition can be removed only by a Trash purge, never through this port.
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
