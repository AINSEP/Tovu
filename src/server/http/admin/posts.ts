import type { PostRecord } from "../../../features/post";
import type { AdminPostEnvelope } from "../../../headless";
import { toHeadlessPost } from "../shared/post";

export function toAdminPostResponse(post: PostRecord): AdminPostEnvelope {
  return {
    post: toHeadlessPost(post),
  };
}
