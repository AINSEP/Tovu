import type { AdminUser } from "@/lib/api";

/**
 * @file What `use-login.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md` (canonical spec) and
 * `redirects-port.hooks.ts` (canonical reference implementation): this file declares,
 * `login-dependencies.hooks.ts` binds the real `api` client, and nothing else under
 * `features/auth` imports `lib/api`.
 */
export interface LoginPort {
  login(credentials: { username: string; password: string }): Promise<{ user: AdminUser }>;
}
