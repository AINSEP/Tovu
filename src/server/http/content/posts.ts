import type { PostRecord } from "#src/features/post/index";
import type { ContentPostPayload } from "#src/headless/index";
import { toHeadlessContentPost } from "../shared/post";

/**
 * Serializes a published post into the public content payload contract.
 */
export function toContentPostResponse(required: {
  post: PostRecord;
  activeThemeId: string;
}): ContentPostPayload {
  return {
    post: toHeadlessContentPost(required.post),
    presentation: {
      activeThemeId: required.activeThemeId,
    },
  };
}
