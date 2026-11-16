import { createMembersControllerHook } from "./MembersPanel.hooks";
import { Members as JiniMembers } from "@jini-ai/user-management/react";
import { ServerLabel } from "@/components/status-labels";
import { useWiredMembers } from "./hooks/members-controller.hooks";
import { defaultMembersPort } from "./hooks/members-dependencies.hooks";

export interface MembersProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before.
   */
  useMembersHook?: typeof useWiredMembers;
}
const port = defaultMembersPort;

/** Supply product vocabulary and protocol-label rendering to the shared Members screen. */
export function Members({ useMembersHook = useWiredMembers }: MembersProps = {}) {
  const useController = createMembersControllerHook({ useMembersHook });
  // `translate` is required by Jini's props but only feeds its default `useMembers`, which
  // `useController` replaces (it translates through `controller.t`). `String` is the identity on a
  // string key, so no never-called arrow function is defined here just to satisfy the type.
  return <JiniMembers port={port} translate={String} useMembersHook={useController}
    description="Site visitors who have registered an account — review status, resend a sign-in link, or disable access."
    emptyDescription="Registered site visitors will show up here."
    renderServerLabel={({ value }) => <ServerLabel value={value} />} />;
}
