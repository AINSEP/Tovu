import { type AuthorizeFn, ForbiddenError } from "@jini-ai/cms/core";
import {
  createContentLookup,
  isContentTypeOnAllowList,
  type ContentLookupPort,
  type ContentRecordLookupPort,
  type ContentTypeTaxonomyPolicyPort,
  type EntryRecordLookupPort,
} from "./index.js";

/**
 * @file Which content Jini's `assignTerms`/`unassignTerms` may tag, and who may tag it. They only
 * resolve a non-post/page `contentType` through a `contentTypeTaxonomyPolicy`. Shared by the admin
 * assignment routes (`routes/taxonomy/assign-terms.ts`), the assistant's tagging tools
 * (`tool-registrations.ts`) and the publish ports (`composition/content-publish-ports.ts`), so an
 * entry the editor can tag is an entry the assistant and publishing can tag, and the other way round.
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

/**
 * `assignTerms`'s content lookup and entry policy: posts/pages and entries of a live collection
 * both resolve.
 * @complexity O(1) — builds two adapters, no I/O.
 */
export function createContentTargetPorts(deps: {
  postRepo: ContentRecordLookupPort;
  entryRepo: EntryRecordLookupPort;
  contentTypeRepo: CollectionOwnerLookupPort;
  workspaceId: string;
}): { contentLookup: ContentLookupPort; contentTypeTaxonomyPolicy: ContentTypeTaxonomyPolicyPort } {
  return {
    contentLookup: createContentLookup({ postRepo: deps.postRepo, entryRepo: deps.entryRepo, workspaceId: deps.workspaceId }),
    contentTypeTaxonomyPolicy: createLiveCollectionTermPolicy(deps),
  };
}

/** The permission `contentType`'s own editor saves under: `content.write` for a post or page,
 *  `admin.collections.manage` for a collection entry. */
export function contentEditPermission(contentType: string): string {
  return isContentTypeOnAllowList(contentType) ? "content.write" : "admin.collections.manage";
}

/**
 * Throws `ForbiddenError` unless the caller may edit `contentType`'s content — tagging needs this on
 * top of `admin.taxonomy.manage`, which Jini checks for the write itself.
 * @complexity one `authorize()` call.
 */
export async function authorizeContentEdit(deps: { authorize: AuthorizeFn; workspaceId: string }, principalId: string, contentType: string): Promise<void> {
  const permission = contentEditPermission(contentType);
  const result = await deps.authorize({ principalId, permission, workspaceId: deps.workspaceId });
  if (!result.allowed) {
    throw new ForbiddenError(`principal '${principalId}' is not authorized for '${permission}' (${result.reason})`, permission, result.reason);
  }
}
