import { ToolInputError } from "@jini-ai/core";
import { IdentityForbiddenError, IdentityNotFoundError, IdentityValidationError, OwnerRequiredError } from "@jini-ai/user-management";
import { trashUser, SelfDeleteError } from "#src/features/identity/delete-user-service";
import { UserDeleteUnsupportedError } from "#src/features/identity/user-purge-types";
import type { TrashUserPort } from "#src/features/trash/index";
import { identityServiceDepsFrom, type UsersRouteDeps } from "#src/server/inbound/admin-http/routes/users/deps";

/**
 * The refusals `trashUser` throws, all fixed text plus caller-supplied ids (the same set the admin
 * route maps in `routes/users/delete.ts`'s `sendUserDeleteError`), so safe to show the model as-is.
 */
const MODEL_FACING_REFUSALS = [IdentityForbiddenError, SelfDeleteError, OwnerRequiredError, IdentityValidationError, IdentityNotFoundError, UserDeleteUnsupportedError];

/**
 * Binds `trash_item`'s `user` kind to the SAME `trashUser` call the admin `DELETE users/:principalId`
 * route makes, over the same route-deps fields, so the chat and the Users screen cannot diverge.
 *
 * Unlike that route (which answers 204 whatever `removeUser` returns), a non-ok Trash outcome is
 * refused here: the model must not be told a user was trashed when the Trash row was never written.
 *
 * @param deps - The users-route slice of the composition root's route deps.
 * @returns A {@link TrashUserPort}; every refusal is a `ToolInputError` ending in "Nothing was changed."
 * @complexity O(n) in the workspace's principals (`trashUser`'s owner-count guard).
 */
export function bindTrashUserForTool(deps: UsersRouteDeps): TrashUserPort {
  return async ({ principalId, callerPrincipalId }) => {
    let result: Awaited<ReturnType<typeof trashUser>>;
    try {
      result = await trashUser({
        deps: { identity: identityServiceDepsFrom(deps), removeUser: deps.removeUser, isInTrash: deps.isInTrash },
        input: { workspaceId: deps.workspaceId, callerPrincipalId, principalId, seededOwnerPrincipalId: await deps.ownerPrincipalId },
      });
    } catch (error) {
      if (MODEL_FACING_REFUSALS.some((refusal) => error instanceof refusal)) {
        throw new ToolInputError({ message: `trash_item: ${(error as Error).message}. Nothing was changed.` });
      }
      throw error;
    }
    if (!result.ok) {
      throw new ToolInputError({ message: `trash_item: user '${principalId}' could not be moved to the Trash (${result.reason}). Reload and try again. Nothing was changed.` });
    }
    return { noop: result.noop === true };
  };
}
