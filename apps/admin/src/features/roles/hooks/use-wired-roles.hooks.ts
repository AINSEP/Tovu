import { useRoles, type RolesController } from "@jini-ai/admin/roles/hooks/use-roles.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { defaultRolesPort } from "./roles-dependencies.hooks";
import { ROLES_API_ERRORS } from "../roles-host-binding";

/**
 * Binds the real `/api/.../roles` and `/policies` clients — see `roles-dependencies.hooks.ts`. The
 * zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Roles.tsx` composes this
 * and a test composes {@link useRoles} with `createFakeRolesPort`.
 *
 * @returns The same `RolesController` {@link useRoles} returns, wired to the live API client.
 */
export function useWiredRoles(): RolesController {
  return useRoles({ port: defaultRolesPort, errors: ROLES_API_ERRORS, useAdminLocale });
}
