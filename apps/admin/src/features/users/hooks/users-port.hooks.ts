import type { AdminIdentityUser, AdminPolicy, AdminRole } from "@/lib/api";

/**
 * @file What `use-users.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair `apps/admin/
 * INFO.md`'s "Hooks" section documents (canonical example: `features/pages/hooks/theme-pages-
 * port.hooks.ts`).
 *
 * One shared port for the whole screen, not split by concern (e.g. "account" vs. "grants"): `Users`
 * is a single hook backing a single screen, every method below is used by exactly one code path in
 * `use-users.hooks.ts`, and splitting would not shrink what any one test has to fake — a full-render
 * or full-hook test always loads `listUsers`/`listRoles`/`listPolicies` together regardless of which
 * mutation it exercises. Ten methods sits at, not past, the "roughly 8-10, then split" boundary
 * (`AI-Dev-Shop/skills/frontend-react-orcbash/SKILL.md`); `features/seo/hooks/seo-port.hooks.ts`'s
 * `SeoPort` (8 methods in one interface, shared by three separate hooks) is this codebase's existing
 * precedent for keeping one flat interface at this size — no port in this codebase is split by
 * concern today, so doing it here first would add a shape with no other example to match.
 */
export interface UsersPort {
  listUsers(): Promise<{ users: AdminIdentityUser[] }>;
  /** Password-banner plan (2026-09-24), Slice 3 deep-link half: the SIGNED-IN caller's own id, so
   *  `use-users.hooks.ts` can find their row and open the reset-password dialog on it without the
   *  operator having to pick themselves out of the table. Same shape as `api.me()`'s `user` field,
   *  narrowed to the one field this screen actually needs. */
  me(): Promise<{ user: { id: string } }>;
  listRoles(): Promise<{ roles: AdminRole[] }>;
  listPolicies(): Promise<{ policies: AdminPolicy[] }>;
  createUser(
    input: { username: string; password: string },
    options?: { email?: string },
  ): Promise<{ user: AdminIdentityUser }>;
  updateUser(
    target: { principalId: string },
    options?: { email?: string },
  ): Promise<{ user: AdminIdentityUser }>;
  disableUser(principalId: string): Promise<{ user: AdminIdentityUser }>;
  enableUser(principalId: string): Promise<{ user: AdminIdentityUser }>;
  resetUserPassword(input: { principalId: string; password: string }): Promise<void>;
  assignRole(input: { principalId: string; roleId: string }): Promise<{ assignment: unknown }>;
  attachPolicy(input: { principalId: string; policyId: string }): Promise<{ attachment: unknown }>;
}
