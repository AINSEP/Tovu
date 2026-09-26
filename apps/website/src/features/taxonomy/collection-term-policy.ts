import type { ContentTypeTaxonomyPolicyPort } from "./index.js";

/**
 * @file Which taxonomies a collection entry may be tagged with — Jini's `assignTerms`/`unassignTerms`
 * only resolve a non-post/page `contentType` through a `contentTypeTaxonomyPolicy`. Shared by the
 * admin assignment routes (`routes/taxonomy/assign-terms.ts`) and the publish ports
 * (`composition/content-publish-ports.ts`), so an entry the editor can tag is an entry publishing
 * can tag, and the other way round.
 */

/** Widget types are entries too, but never carry terms. */
const NO_TERMS_TYPES: ReadonlySet<string> = new Set(["widget", "widget_area"]);

/** The one content-type read the policy needs. */
export interface CollectionOwnerLookupPort {
  findByKey(params: { workspaceId: string; key: string }): Promise<{ readonly status: string } | null>;
}

/**
 * Any taxonomy on an entry whose collection exists here and is not tombstoned: nothing narrower is
 * recorded per collection to check against.
 * @complexity one indexed read per call.
 */
export function createLiveCollectionTermPolicy(deps: { contentTypeRepo: CollectionOwnerLookupPort; workspaceId: string }): ContentTypeTaxonomyPolicyPort {
  return {
    async taxonomiesFor({ contentType }) {
      if (NO_TERMS_TYPES.has(contentType)) return null;
      const owner = await deps.contentTypeRepo.findByKey({ workspaceId: deps.workspaceId, key: contentType });
      return owner && owner.status !== "tombstone" ? "all" : null;
    },
  };
}
