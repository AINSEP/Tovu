import { createTrashUserService } from "@jini-ai/user-management/identity/delete-user-service";

/**
 * @file The host binding of Jini's `trashUser`: the one instance this process serializes on.
 *
 * Jini's factory owns the queue that keeps two concurrent owner trashes from both passing the
 * INV-08 owner floor. That queue only serializes callers that share it, so this site builds exactly
 * one — this codebase runs one workspace per process (CIC U-001) — and both callers (the admin
 * `DELETE users/:principalId` route and the assistant's `trash_item` user port) import it from here.
 * Everything stateless (the account-contract checks, the error identities, the types) comes from Jini.
 */
export const { trashUser } = createTrashUserService({});
