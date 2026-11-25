/**
 * @file The host rules `@jini-ai/search/site/{cms-document-source,access}` apply to the CMS's posts
 * and pages: the public site's publish rule (`isLiveAt`), its post URL (`postPublicPath`), the post FTS
 * projection's text extraction (`toPostSearchDocument`) and the member-gate decoder
 * (`resolvePostMemberAccess`). One object, so the composition and the tests bind the same rules.
 */
import type { CmsSearchDocumentRules } from "@jini-ai/search/site/cms-document-source";

import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import { isLiveAt } from "@jini-ai/core/scheduled-publish";
import { postPublicPath } from "#src/platform/routing/index";
import { toPostSearchDocument } from "@jini-ai/cms/posts/search";
import { resolvePostMemberAccess } from "@jini-ai/user-management/members/access-resolver";

export function createCmsSearchRules(
  { toPostRecord }: {
    toPostRecord: (
      row: Parameters<CmsSearchDocumentRules<ContentDatabase>["toSearchText"]>[0]["row"],
    ) => Parameters<typeof toPostSearchDocument>[0];
  },
  _optional: Record<string, never> = {},
): CmsSearchDocumentRules<ContentDatabase> {
  return {
    isLiveAt: (required) => isLiveAt(required),
    postPublicPath: (required) => postPublicPath(required),
    toSearchText: ({ row }) => toPostSearchDocument(toPostRecord(row)),
    resolveMemberAccess: (required) => resolvePostMemberAccess(required),
  };
}
