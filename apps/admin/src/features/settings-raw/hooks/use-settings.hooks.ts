import { api, type AdminIdentityUser } from "../../../lib/api";
import { useFetchQuery } from "../../../lib/fetch-query";
import { KEYS } from "../rules";

/**
 * @file `Settings()`'s identity/permission bootstrap, so `Settings` (the default export mounted
 * by `App.tsx`) in `Settings.tsx` is only markup.
 *
 * Extracted verbatim — same effect body, same error handling. See `Settings.tsx`'s file header §3
 * for why permissions are read from `/auth/me`'s `effectivePermissions` rather than a dedicated
 * endpoint, and why that is what makes AC-23 exact.
 *
 * `lib/fetch-query` migration (2026-08-12): a pure read, no writes — `useFetchQuery` keyed on
 * `KEYS.self`. See `rules.ts`'s `KEYS` doc for why the sibling `useSettingsContainer` hook did NOT
 * migrate: its per-namespace accumulator has no single cache key this abstraction can hold.
 */

export interface SettingsController {
  loading: boolean;
  error: string | null;
  selfPrincipalId: string | null;
  permissions: string[];
  users: AdminIdentityUser[];
}

/** @complexity Time/space: O(u) in returned users for the initial load; O(1) thereafter. */
export function useSettings(): SettingsController {
  const query = useFetchQuery({
    key: KEYS.self,
    fetch: async () => {
      const [me, usersResult] = await Promise.all([api.me(), api.listUsers()]);
      return { selfPrincipalId: me.user.id, permissions: me.effectivePermissions ?? [], users: usersResult.users };
    },
  });

  return {
    loading: query.status === "loading",
    error: query.error ? (query.error.message || "Failed to load Settings") : null,
    selfPrincipalId: query.data?.selfPrincipalId ?? null,
    permissions: query.data?.permissions ?? [],
    users: query.data?.users ?? [],
  };
}
