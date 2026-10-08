import { useCallback, useMemo } from "react";
import { useMembers as useJiniMembers, type MembersController as JiniController, type IdentityRefreshPort } from "@jini-ai/user-management/react";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { contentRefreshApplies, subscribeToContentRefresh } from "@/lib/content-refresh-bus";
import { defaultMembersPort, MEMBERS_RESOURCE, toJiniMembersPort } from "./members-dependencies.hooks";
import type { MembersPort } from "./members-port.hooks";
import { t } from "../members-i18n";

// Agent-written member changes must re-read the list through the authorized host API.
const refresh: IdentityRefreshPort = {
  subscribe: ({ onRefresh }) => subscribeToContentRefresh(scope => {
    if (contentRefreshApplies(scope, MEMBERS_RESOURCE)) onRefresh();
  }),
};
export type MembersController = Omit<JiniController, "stateFor"> & {
  locale: string;
  stateFor: (id: string) => ReturnType<JiniController["stateFor"]>;
};
export interface MembersDependencies { port: MembersPort }

/** Bind Tovu transport, translated copy and agent refresh to the shared controller. */
export function useMembers({ port }: MembersDependencies, _optional: Record<string, never> = {}): MembersController {
  const locale = useAdminLocale();
  const translate = useCallback((key: string) => t({ locale: locale, key: key }), [locale]);
  const jiniPort = useMemo(() => toJiniMembersPort({ port }), [port]);
  const controller = useJiniMembers({ port: jiniPort, translate }, { refresh });
  return { ...controller, locale, stateFor: id => controller.stateFor({ id }) };
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
