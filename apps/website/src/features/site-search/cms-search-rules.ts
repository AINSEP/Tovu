/**
 * @file The host rules `@jini-ai/search/site/{cms-document-source,access}` apply to the CMS's posts
 * and pages: the public site's publish rule (`isLiveAt`), its post URL (`postPublicPath`), the post FTS
 * projection's text extraction (`toPostSearchDocument`) and the member-gate decoder
 * (`resolvePostMemberAccess`). One object, so the composition and the tests bind the same rules.
 */
import type { CmsSearchDocumentRules } from "@jini-ai/search/site/cms-document-source";

import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { isLiveAt } from "#src/contracts/core/scheduled-publish";
import { postPublicPath } from "#src/platform/routing/index";
import { toRecord, toPostSearchDocument } from "../post/read-model.js";
import { resolvePostMemberAccess } from "@jini-ai/user-management/members/access-resolver";

export const CMS_SEARCH_RULES: CmsSearchDocumentRules<ContentDatabase> = {
  isLiveAt: (required) => isLiveAt(required),
  postPublicPath: (required) => postPublicPath(required),
  toSearchText: ({ row }) => toPostSearchDocument(toRecord(row)),
  resolveMemberAccess: (required) => resolvePostMemberAccess(required),
};
