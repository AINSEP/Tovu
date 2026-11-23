import type { PostRecord } from "#src/features/post/index";
import type { AdminPostEnvelope } from "@jini-ai/core/contracts/headless/contracts";
import { toHeadlessPost } from "#src/server/inbound/public-http/http/shared/post";

export function toAdminPostResponse(post: PostRecord): AdminPostEnvelope {
  return {
    post: toHeadlessPost(post),
  };
}
