import type { PostRecord } from "@jini-ai/cms/posts/post";
import type { ContentPostPayload } from "#src/contracts/headless/index";
import { toHeadlessContentPost } from "../shared/post.js";

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
