import type { PostRecord } from "../../../features/post";
import type { AdminPost, ContentPost } from "../../../headless";

/**
 * Maps a post record into the richer admin-facing DTO shape.
 */
export function toHeadlessPost(post: PostRecord): AdminPost {
  return {
    id: post.id,
    workspaceId: post.workspaceId,
    kind: post.kind,
    title: post.title,
    slug: post.slug,
    bodyJson: post.bodyJson,
    status: post.status,
    updatedAt: post.updatedAt,
    version: post.version,
  };
}

/**
 * Maps a post record into the narrower public content DTO shape.
 */
export function toHeadlessContentPost(post: PostRecord): ContentPost {
  return {
    id: post.id,
    kind: post.kind,
    title: post.title,
    slug: post.slug,
    bodyJson: post.bodyJson,
    updatedAt: post.updatedAt,
  };
}
