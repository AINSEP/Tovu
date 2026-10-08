import { Users as JiniUsers, type UsersController as JiniController } from "@jini-ai/user-management/react";
import { ServerLabel } from "@/components/status-labels";
import { WORKSPACE_ID } from "@/lib/api";
import { useWiredUsers } from "./hooks/users-controller.hooks";
import { defaultUsersPort, toJiniUsersPort } from "./hooks/users-dependencies.hooks";

export { UserManagePanel } from "@jini-ai/user-management/react";
export type { UserManageController } from "@jini-ai/user-management/react";
export interface UsersProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the wired hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before.
   */
  useUsersHook?: typeof useWiredUsers;
  /** Password-banner plan (2026-09-24), Slice 3: set by `panels.tsx` when the route is
   *  `/users/change-password` (the dashboard nag's deep link). Forwarded to `useUsersHook` as-is —
   *  `Users` itself has no opinion on what it means, see `use-users.hooks.ts` for the behavior. */
  openOwnPasswordReset?: boolean;
}
const port = toJiniUsersPort({ port: defaultUsersPort });

/** Product composition only; Jini owns markup, hooks and account protections. */
export function Users({ useUsersHook = useWiredUsers, openOwnPasswordReset }: UsersProps = {}) {
  function useController(): JiniController {
    const controller = useUsersHook({ openOwnPasswordReset });
    return { ...controller, translate: controller.t,
      onAssignRole: ({ principalId }) => controller.onAssignRole(principalId),
      onAttachPolicy: ({ principalId }) => controller.onAttachPolicy(principalId),
      onSaveEmail: ({ principalId }) => controller.onSaveEmail(principalId),
    };
  }
  return <JiniUsers port={port} queryScope={WORKSPACE_ID} translate={key => key}
    useUsersHook={useController} renderServerLabel={({ value }) => <ServerLabel value={value} />} />;
}
