import { useCallback } from "react";
import { useLocalizedUsers, useUsers as useJiniUsers, type LocalizedUsersController } from "@jini-ai/user-management/react";
import type { UsersPort } from "@jini-ai/core/contracts/site/user-management-react";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { navigate as realNavigate } from "@jini-ai/admin/shell/lib/router";
import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { defaultUsersPort } from "../users-host-binding";
import { t } from "@jini-ai/admin/users/users-i18n";

/**
 * @file This host's composition of Jini's `useLocalizedUsers`: binds the admin locale hook,
 * `WORKSPACE_ID` and the users dictionary translator. `useUsers` takes the port (a test passes
 * `createFakeUsersPort`); `useWiredUsers` binds the live port and the real router.
 */

/** Bind host locale, workspace scope and dictionary; Jini owns the controller. */
export function useUsers({ port, openOwnPasswordReset, navigate }: { port: UsersPort; openOwnPasswordReset?: boolean; navigate?: (path: string, options?: { replace?: boolean }) => void }, _optional: Record<string, never> = {}): LocalizedUsersController {
  // The host owns the deep-link close route (rv1123l FIX 9): back to the Users list. A normal
  // row-menu reset never calls this.
  const onOwnPasswordResetClosed = useCallback(() => navigate?.("/users"), [navigate]);
  return useLocalizedUsers({ port, openOwnPasswordReset, onOwnPasswordResetClosed, useUsers: useJiniUsers, useAdminLocale, queryScope: WORKSPACE_ID, t });
}

/**
 * Binds the real `/api/.../users`, `/roles`, and `/policies` clients — see
 * `users-host-binding.ts`. The zero-argument (or options-only) half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `Users.tsx` composes this and a test composes
 * {@link useUsers} with `createFakeUsersPort`.
 *
 * @param options - `openOwnPasswordReset`, threaded from `panels.tsx`'s `/users/change-password`
 *   route (password-banner plan, 2026-09-24 Slice 3). Omitted for every other caller of the Users
 *   panel, same as before this slice.
 * @returns The same `UsersController` {@link useUsers} returns, wired to the live API client and
 *   the real `@/lib/router` navigate.
 */
/** Bind the real API and route callback for the product panel. */
export function useWiredUsers(options: { openOwnPasswordReset?: boolean } = {}): LocalizedUsersController {
  const navigate = useCallback((routePath: string, navOptions?: { replace?: boolean }) => navOptions === undefined ? realNavigate({ routePath }) : realNavigate({ routePath }, navOptions), []);
  return useUsers({ port: defaultUsersPort, navigate, ...options });
}
