/** Public taxonomy read contracts; no persistence or registration dependencies. */
import type { Taxonomy, Term } from "@jini-ai/cms/taxonomy";

/** Publish-content's taxonomy read: the full row, trashed ones included, so a precheck refuses a
 *  trashed destination instead of colliding. */
export interface TaxonomyPublishReadPort {
  findAnyById(id: string): Promise<Taxonomy | null>;
}

/** Publish-content's term read — see {@link TaxonomyPublishReadPort}. */
export interface TermPublishReadPort {
  findAnyById(id: string): Promise<Term | null>;
}

/**
 * One term assigned to a piece of content, joined with its own name and its owning taxonomy's name
 * — the shape {@link EntryTermReadPort.listForContent} returns, and the ONLY shape the public-render
 * surface needs (`pages.ts`'s `resolveAssignedTermsForRender`/`renderAssignedTermsBlock`).
 */
export interface AssignedTermView {
  termId: string;
  termName: string;
  taxonomyName: string;
}

/**
 * Additive capability beyond the certified `EntryTermRepoPort` (which has no by-content READ method).
 * Kept a SEPARATE, OPTIONAL field on `RouteDeps` (`entryTermReadRepo`) because `@jini-ai/cms/taxonomy`'s
 * `InMemoryEntryTermRepo` does not implement it; a caller missing this field degrades to "no terms
 * rendered", never a throw.
 */
export interface EntryTermReadPort {
  listForContent(params: { contentType: string; contentId: string }): Promise<readonly AssignedTermView[]>;
}

