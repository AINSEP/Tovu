import type { PostRecord } from "#src/features/post/index";
import type { AdminPostEnvelope } from "#src/contracts/headless/index";
import { toHeadlessPost } from "#src/server/inbound/public-http/http/shared/post";

export function toAdminPostResponse(post: PostRecord): AdminPostEnvelope {
  return {
    post: toHeadlessPost(post),
  };
}
