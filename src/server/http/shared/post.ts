import type { PostRecord } from "../../../features/post";
import type { AdminPost, ContentPost } from "../../../headless";

/**
 * Maps a post record into the richer admin-facing DTO shape.
 *
 * SPEC-005 REQ-11 (T022): `ext` is spread in only when the record actually carries one, so an
 * entry with no contributing plugin serializes with no `ext` key at all (AC-14) and every
 * pre-feature response field is untouched.
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
    ...(post.ext !== undefined ? { ext: post.ext as Record<string, Record<string, unknown>> } : {}),
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
