import { Members as JiniMembers, type MembersController as JiniController } from "@jini-ai/user-management/react";
import { ServerLabel } from "@/components/status-labels";
import { useWiredMembers } from "./hooks/members-controller.hooks";
import { defaultMembersPort, toJiniMembersPort } from "./hooks/members-dependencies.hooks";

export interface MembersProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before.
   */
  useMembersHook?: typeof useWiredMembers;
}
const port = toJiniMembersPort({ port: defaultMembersPort });

/** Supply product vocabulary and protocol-label rendering to the shared Members screen. */
export function Members({ useMembersHook = useWiredMembers }: MembersProps = {}) {
  function useController(): JiniController {
    const controller = useMembersHook();
    return { ...controller, translate: controller.t, stateFor: ({ id }) => controller.stateFor(id) };
  }
  return <JiniMembers port={port} translate={key => key} useMembersHook={useController}
    description="Site visitors who have registered an account — review status, resend a sign-in link, or disable access."
    emptyDescription="Registered site visitors will show up here."
    renderServerLabel={({ value }) => <ServerLabel value={value} />} />;
}
