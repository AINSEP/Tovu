import type { PostRecord } from "#src/features/post/index";
import type { AdminPostEnvelope } from "#src/headless/index";
import { toHeadlessPost } from "../shared/post";

export function toAdminPostResponse(post: PostRecord): AdminPostEnvelope {
  return {
    post: toHeadlessPost(post),
  };
}
