import { useCallback } from "react";
import { useMembers as useJiniMembers, type MembersController as JiniController, type IdentityRefreshPort, type MembersPort } from "@jini-ai/user-management/react";
import { WORKSPACE_ID } from "@/lib/admin-http/config";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { contentRefreshApplies, subscribeToContentRefresh } from "@/lib/content-refresh-bus";
import { defaultMembersPort, MEMBERS_RESOURCE } from "./members-dependencies.hooks";
import { t } from "../members-i18n";

// Agent-written member changes must re-read the list through the authorized host API.
const refresh: IdentityRefreshPort = {
  subscribe: ({ onRefresh }) => subscribeToContentRefresh({ listener: scope => {
    if (contentRefreshApplies({ scope, resource: MEMBERS_RESOURCE })) onRefresh();
  } }),
};
export type MembersController = Omit<JiniController, "stateFor"> & {
  locale: string;
  stateFor: (required: { id: string }, optional?: Record<string, never>) => ReturnType<JiniController["stateFor"]>;
};
export interface MembersDependencies { port: MembersPort }

/** Bind Tovu transport, translated copy and agent refresh to the shared controller. */
export function useMembers({ port }: MembersDependencies, _optional: Record<string, never> = {}): MembersController {
  const locale = useAdminLocale();
  const translate = useCallback((key: string) => t({ locale: locale, key: key }), [locale]);
  const controller = useJiniMembers({ port, translate, queryScope: WORKSPACE_ID }, { refresh });
  return { ...controller, locale, stateFor: ({ id }, _optional = {}) => controller.stateFor({ id }) };
}

/**
 * Binds the real `/api/.../members` client — see `members-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `Members.tsx` composes this and a test composes {@link useMembers} with `createFakeMembersPort`.
 */
/** Bind the live member HTTP client. */
export function useWiredMembers(): MembersController {
  return useMembers({ port: defaultMembersPort });
}
