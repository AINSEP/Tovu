import type { FormDefinitionRecord } from "#src/features/forms/index";
import type { FormsRouteDeps } from "./deps.js";

/**
 * Resolves a `:formId` route param to its form definition, trying the slug first and the raw id
 * second.
 *
 * Every admin `forms` route under `/forms/:formId` (and its `/submissions` children) is reachable
 * from a URL built with the form's slug — `FormEditor.tsx` reads `:formId` straight off the router
 * and passes it through unchanged to every submissions call (list/get/delete), exactly as
 * `get-by-id.ts` already documented for its own GET. Slug first, id second: same order and
 * rationale as posts' `getAdminPostByIdOrSlug` (`src/features/post/post.ts`) — the slug is the
 * handle a human chose and reads in the URL bar, the id is an implementation detail they never did.
 *
 * Extracted rather than left inlined (as `get-by-id.ts` originally reasoned when it was the only
 * caller): `list-submissions.ts`, `get-submission.ts`, and `delete-submission.ts` all need the same
 * resolution to look up submissions by the definition's real id, not the slug in the URL.
 *
 * @complexity O(1) — at most two point reads.
 */
export async function resolveFormDefinitionByIdOrSlug(
  deps: Pick<FormsRouteDeps, "workspaceId" | "formDefinitionRepo">,
  formId: string
): Promise<FormDefinitionRecord | null> {
  const bySlug = await deps.formDefinitionRepo.findBySlug({
    workspaceId: deps.workspaceId,
    slug: formId.trim().toLowerCase(),
  });
  return bySlug ?? (await deps.formDefinitionRepo.findById({ workspaceId: deps.workspaceId, id: formId }));
}
