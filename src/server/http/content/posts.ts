import type { PostRecord } from "../../../features/post";
import type { ContentPostPayload } from "../../../headless";
import { toHeadlessContentPost } from "../shared/post";

/**
 * Serializes a published post into the public content payload contract.
 */
export function toContentPostResponse(
  post: PostRecord,
  activeThemeId: string
): ContentPostPayload {
  return {
    post: toHeadlessContentPost(post),
    presentation: {
      activeThemeId,
    },
  };
}
