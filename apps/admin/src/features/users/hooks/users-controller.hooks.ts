import { useCallback, useMemo } from "react";
import { useUsers as useJiniUsers, type UsersController as JiniController } from "@jini-ai/user-management/react";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { navigate as realNavigate } from "@/lib/router";
import { WORKSPACE_ID } from "@/lib/api";
import { passwordResetNotice, t } from "../users-i18n";
import { defaultUsersPort, toJiniUsersPort } from "./users-dependencies.hooks";
import type { UsersPort } from "./users-port.hooks";

export type UsersController = Omit<JiniController, "onAssignRole" | "onAttachPolicy" | "onSaveEmail" | "translate"> & {
  // Retained host field; the comment below records the pre-extraction row-menu contract.
  /** Raw resolved locale — `rules.ts`'s `userRowMenuItems` takes `locale` directly rather than a
   *  bound translator. See this file's header. */
  locale: string;
  onAssignRole: (principalId: string) => Promise<void>;
  onAttachPolicy: (principalId: string) => Promise<void>;
  onSaveEmail: (principalId: string) => Promise<void>;
};
export interface UsersDependencies {
  port: UsersPort;
  /** When true, auto-opens the reset-password dialog on the caller's own row once it is known —
   *  see the one-shot effect in {@link useUsers} for why this needs both the flag AND the user list
   *  AND `me()` to have settled before it can act. */
  openOwnPasswordReset?: boolean;
  /** DI seam for `@/lib/router`'s `navigate`, same convention `use-post-editor.hooks.ts`'s `navigate`
   *  dependency uses — real impl wired only in {@link useWiredUsers}. */
  navigate?: (path: string, options?: { replace?: boolean }) => void;
}

/** Bind host locale, routes and transport; Jini owns all screen state and account rules. */
export function useUsers({ port, openOwnPasswordReset, navigate }: UsersDependencies, _optional: Record<string, never> = {}): UsersController {
  const locale = useAdminLocale();
  const translate = useCallback((key: string) => t(locale, key), [locale]);
  const jiniPort = useMemo(() => toJiniUsersPort({ port }), [port]);
  const controller = useJiniUsers({ port: jiniPort, translate, queryScope: WORKSPACE_ID }, {
    openOwnPasswordReset,
    // A normal row-menu reset must not navigate; Jini calls this only for the deep-linked dialog.
    onOwnPasswordResetClosed: () => navigate?.("/users"),
    passwordResetNotice: ({ username }) => passwordResetNotice(locale, username),
  });
  return { ...controller, locale,
    onAssignRole: principalId => controller.onAssignRole({ principalId }),
    onAttachPolicy: principalId => controller.onAttachPolicy({ principalId }),
    onSaveEmail: principalId => controller.onSaveEmail({ principalId }),
  };
}

/**
 * Binds the real `/api/.../users`, `/roles`, and `/policies` clients — see
 * `users-dependencies.hooks.ts`. The zero-argument (or options-only) half of the
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
export function useWiredUsers(options: { openOwnPasswordReset?: boolean } = {}): UsersController {
  return useUsers({ port: defaultUsersPort, navigate: realNavigate, ...options });
}
