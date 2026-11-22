import type { UsersController as JiniController } from "@jini-ai/user-management/react";
import type { useWiredUsers } from "./hooks/users-controller.hooks";

/** Adapt Tovu's injected controller to Jini's existing hook seam. */
export function createUsersControllerHook({ useUsersHook, openOwnPasswordReset }: { useUsersHook: typeof useWiredUsers; openOwnPasswordReset?: boolean }, _options = {}) {
  function useController(_required = {}, _options = {}): JiniController {
    const controller = useUsersHook({ openOwnPasswordReset });
    return { ...controller, translate: controller.t };
  }
  return useController;
}
