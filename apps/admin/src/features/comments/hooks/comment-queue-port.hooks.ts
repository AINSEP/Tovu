import type { AdminCommentsQueuePage, CommentModerationAction, CommentStatus } from "../../../lib/api";

/**
 * @file What `use-comment-queue.hooks.ts` needs from the outside world, as an interface rather than
 * a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface CommentQueuePort {
  listCommentsQueue(options: { status?: CommentStatus; cursor?: string }): Promise<AdminCommentsQueuePage>;
  moderateComment(input: { commentId: string; action: CommentModerationAction; expectedVersion: number }): Promise<void>;
  purgeComment(input: { commentId: string }): Promise<void>;
}
