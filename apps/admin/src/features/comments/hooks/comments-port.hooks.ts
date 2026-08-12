/**
 * @file What `use-comments.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented on `assistant-chats-port.hooks.ts`
 * (the canonical reference in this workspace) — see `development/docs/architecture/wired-hooks-
 * convention.md` for the full shape. `comments-dependencies.hooks.ts` binds the real `api` client;
 * nothing else under `features/comments/hooks/use-comments.hooks.ts` imports `lib/api`.
 */
export interface CommentsPort {
  /** Narrowed to the one field this hook reads — the real `api.me()` also returns `user`, which
   *  this hook never uses. Matches `page-editor-port.hooks.ts`'s own narrowing precedent. */
  me(): Promise<{ effectivePermissions?: string[] }>;
}
