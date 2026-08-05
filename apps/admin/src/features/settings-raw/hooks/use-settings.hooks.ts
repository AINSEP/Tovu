import { useEffect, useState } from "react";

import { api, type AdminIdentityUser } from "../../../lib/api";

/**
 * @file `Settings()`'s identity/permission bootstrap, so `Settings` (the default export mounted
 * by `App.tsx`) in `Settings.tsx` is only markup.
 *
 * Extracted verbatim — same state, same effect, same error handling. See `Settings.tsx`'s file
 * header §3 for why permissions are read from `/auth/me`'s `effectivePermissions` rather than a
 * dedicated endpoint, and why that is what makes AC-23 exact.
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selfPrincipalId, setSelfPrincipalId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [users, setUsers] = useState<AdminIdentityUser[]>([]);

  useEffect(() => {
    Promise.all([api.me(), api.listUsers()])
      .then(([me, usersResult]) => {
        setSelfPrincipalId(me.user.id);
        setPermissions(me.effectivePermissions ?? []);
        setUsers(usersResult.users);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load Settings"))
      .finally(() => setLoading(false));
  }, []);

  return { loading, error, selfPrincipalId, permissions, users };
}
