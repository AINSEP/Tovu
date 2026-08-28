import type { CommentsSettings } from "@/lib/api";

/**
 * @file What `use-comment-settings.hooks.ts` needs from the outside world, as an interface rather
 * than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented
 * in `development/docs/architecture/wired-hooks-convention.md`.
 */
export interface CommentSettingsPort {
  getCommentsSettings(): Promise<{ data: CommentsSettings }>;
  putCommentsSettings(patch: Partial<CommentsSettings>): Promise<{ data: CommentsSettings }>;
}
