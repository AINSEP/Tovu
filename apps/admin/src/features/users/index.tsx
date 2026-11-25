import { UsersPanel, type WiredUsersHook } from "@jini-ai/user-management/react";
import { ServerLabel } from "@/components/status-labels";
import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { useWiredUsers } from "./hooks/use-wired-users.hooks";
import { defaultUsersPort } from "./users-host-binding";

/**
 * @file Public surface of the `users` feature — and this host's binding of the Jini Users screen.
 *
 * `panels.tsx` imports from HERE, never from a file inside this folder. That indirection is the
 * point of the feature boundary: everything below can be split, renamed, or grown a `hooks/`
 * directory without the router noticing. Adding a file to this feature is not an API change unless
 * it is exported from this line.
 */

export interface UsersProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the wired hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before.
   */
  useUsersHook?: WiredUsersHook;
  /** Password-banner plan (2026-09-24), Slice 3: set by `panels.tsx` when the route is
   *  `/users/change-password` (the dashboard nag's deep link). Forwarded to `useUsersHook` as-is. */
  openOwnPasswordReset?: boolean;
}

/** The Users screen with this host's collaborators bound in: the wired controller hook, the live
 *  port, `WORKSPACE_ID` and `ServerLabel`. */
export function Users({ useUsersHook = useWiredUsers, openOwnPasswordReset }: UsersProps = {}) {
  return <UsersPanel useUsersHook={useUsersHook} openOwnPasswordReset={openOwnPasswordReset} port={defaultUsersPort}
    queryScope={WORKSPACE_ID} renderServerLabel={({ value }) => <ServerLabel value={value} />} />;
}
