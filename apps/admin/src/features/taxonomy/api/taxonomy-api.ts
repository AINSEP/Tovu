import { request } from "../../../lib/admin-http/request";
import type { AdminTaxonomy, AdminTaxonomyWithTerms, AdminTerm, MergeTermPlanDetails } from "@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types";
import type { GatedConfirmResult, GatedPlanResult } from "@jini-ai/core/contracts/site/gated-results";

/** The admin API calls of the taxonomy feature. */
export const taxonomyApi = {
  // Categories & Tags (ADR-044) — taxonomies + terms.
  listTaxonomies: () => request<{ items: AdminTaxonomyWithTerms[] }>({ path: "/taxonomy" }),
  createTaxonomy: (input: { name: string; hierarchical: boolean }) =>
    request<{ taxonomy: AdminTaxonomy }>({ path: "/taxonomy" }, { init: { method: "POST", body: JSON.stringify(input) } }),
  createTerm: (
    { taxonomyId, name }: { taxonomyId: string; name: string },
    options: { parentId?: string | null } = {}
  ) =>
    request<{ term: AdminTerm }>({ path: `/taxonomy/${encodeURIComponent(taxonomyId)}/terms` }, { init: {
      method: "POST",
      body: JSON.stringify({ name, parentId: options.parentId }),
    } }),
  renameTerm: (
    { termId, newName }: { termId: string; newName: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ term: AdminTerm }>({ path: `/taxonomy/terms/${encodeURIComponent(termId)}` }, { init: {
      method: "PUT",
      body: JSON.stringify({ newName }),
    } }),
  /** Additive: upserts one `entry_terms` row per `termIds` entry (never clears an existing,
   * unselected assignment — {@link unassignTerms} removes). Posts, pages and collection entries. */
  assignTerms: (input: { contentType: string; contentId: string; termIds: string[] }) =>
    request<void>({ path: "/taxonomy/assign-terms" }, { init: { method: "POST", body: JSON.stringify(input) } }),
  /** Removes each `termIds` assignment; one that is not there is a no-op. */
  unassignTerms: (input: { contentType: string; contentId: string; termIds: string[] }) =>
    request<void>({ path: "/taxonomy/unassign-terms" }, { init: { method: "POST", body: JSON.stringify(input) } }),
  /** The term ids one post, page or entry holds now, sorted. */
  assignedTerms: ({ contentType, contentId }: { contentType: string; contentId: string }) =>
    request<{ termIds: string[] }>(
      { path: `/taxonomy/assigned-terms?contentType=${encodeURIComponent(contentType)}&contentId=${encodeURIComponent(contentId)}` }
    ),
  // Categories & Tags — merge-term ceremony (ADR-044, SPEC-018 C-207). 3-step plan/confirm/execute.
  planMergeTerm: (
    { fromTermId, intoTermId }: { fromTermId: string; intoTermId: string },
    _options: Record<string, never> = {}
  ) =>
    request<GatedPlanResult<MergeTermPlanDetails>>({ path: `/taxonomy/terms/${encodeURIComponent(fromTermId)}/merge/plan` }, { init: {
      method: "POST",
      body: JSON.stringify({ intoTermId }),
    } }),
  confirmMergeTerm: (
    { fromTermId, planId, planHash }: { fromTermId: string; planId: string; planHash: string },
    _options: Record<string, never> = {}
  ) =>
    request<GatedConfirmResult>({ path: `/taxonomy/terms/${encodeURIComponent(fromTermId)}/merge/confirm` }, { init: {
      method: "POST",
      body: JSON.stringify({ planId, planHash }),
    } }),
  executeMergeTerm: (
    {
      fromTermId,
      intoTermId,
      confirmationToken,
    }: { fromTermId: string; intoTermId: string; confirmationToken: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ mergedCount: number }>({ path: `/taxonomy/terms/${encodeURIComponent(fromTermId)}/merge/execute` }, { init: {
      method: "POST",
      body: JSON.stringify({ intoTermId, confirmationToken }),
    } }),
};
