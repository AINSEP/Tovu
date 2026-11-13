import type { MembersController as JiniController } from "@jini-ai/user-management/react";
import type { useWiredMembers } from "./hooks/members-controller.hooks";

/** Adapt Tovu's injected controller to Jini's existing hook seam. */
export function createMembersControllerHook({ useMembersHook }: { useMembersHook: typeof useWiredMembers }, _options = {}) {
  function useController(_required = {}, _options = {}): JiniController {
    const controller = useMembersHook();
    return { ...controller, translate: controller.t, stateFor: ({ id }) => controller.stateFor({ id }) };
  }
  return useController;
}
