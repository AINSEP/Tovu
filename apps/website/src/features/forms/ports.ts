import type { UUID } from "@jini-ai/core/primitives";
import type {
  FormSubmissionRepoPort as PackageSubmissionRepo,
  FormSubmissionPage,
} from "@jini-ai/cms-forms";

// The repository consumers share this adapter entry; the canonical definition port lives in Jini.
export type { FormDefinitionRepoPort } from "@jini-ai/cms-forms";

// Persistence rationale: Jini packages/cms/forms/src/ports.ts (SPEC-010, ADR-PIPE-010, C-012).
// INV-08 now permits permanent removal only through Trash purge, including the 60-day sweeper;
// the owner's 2026-09-21 ruling superseded the older never-delete definition invariant.
/** Tovu repositories keep their existing cursor input until the DB lane owns that migration. */
export interface FormSubmissionRepoPort extends Omit<PackageSubmissionRepo, "listByDefinition"> {
  listByDefinition(required: {
    workspaceId: UUID;
    formDefinitionId: UUID;
    limit: number;
    cursor?: string | null;
  }): Promise<FormSubmissionPage>;
}

/**
 * Translates package pagination options to Tovu's existing repository input without changing DB code.
 * Method closures retain the receiver of class-backed repositories; errors propagate unchanged.
 * @returns A package-compatible persistence port. @complexity O(1) adapter work per call.
 * @example const repo = adaptFormSubmissionRepo({ repo: hostSubmissionRepo });
 */
export function adaptFormSubmissionRepo(
  { repo }: { repo: FormSubmissionRepoPort },
  _optional: Record<string, never> = {},
): PackageSubmissionRepo {
  return {
    findById: (required) => repo.findById(required),
    create: (record) => repo.create(record),
    listByDefinition: (required, optional = {}) => repo.listByDefinition({ ...required, cursor: optional.cursor }),
  };
}

/**
 * The function `deleteFormSubmission` receives to move a submission to the Trash, bound to the
 * `"form_submission"` type at the composition root. Structurally typed on purpose: this feature
 * imports nothing from `features/trash`.
 */
export type RemoveFormSubmissionFn = (required: {
  workspaceId: UUID;
  id: UUID;
  display: { title: string; subtitle?: string | null };
  at: string;
  expectedVersion: number | null;
  actor: { principalId: string; pluginId?: string | null };
}) => Promise<{ ok: true; version: number | null } | { ok: false; reason: "not-found" | "version-changed" }>;
