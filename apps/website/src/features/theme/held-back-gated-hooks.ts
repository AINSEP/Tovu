import type { GatedMutationHooks } from "@jini-ai/core/gated-mutations";
import { planHashOf, resolveActorClassIdentity } from "#src/contracts/core/gated-mutations/composition";

/**
 * @file Binds the held-back theme restore (A452) to the shared plan -> confirm -> execute gateway,
 * so the approval card's "Restore" click is a host-minted, single-use confirmation token rather than
 * the check's digest echoed back.
 *
 * Two things now stand between a held-back theme and the live themes folder, and they answer
 * different questions: the digest is a VERSION check (are these still the files that were checked?),
 * the token is the APPROVAL (did this person, on this site, agree to restore this theme at this
 * version?). The plan hash covers domain, workspace, site, theme and digest, and the gateway itself
 * binds the token to the confirming actor and the workspace scope — so a token cannot be replayed
 * by someone else, for another theme, at another version, or on another site.
 */

/** Stable gateway domain id; part of the plan hash so a token from another ceremony never matches. */
export const HELD_BACK_RESTORE_DOMAIN = "theme.held-back-restore";

/** Same gates the routes use: reading (check) is `theme.set`, restoring is `theme.edit`. */
export const HELD_BACK_READ_PERMISSION = "theme.set";
export const HELD_BACK_RESTORE_PERMISSION = "theme.edit";

/** What one approval is bound to (beyond the actor, which the gateway's token carries). */
export interface HeldBackRestoreScope {
  workspaceId: string;
  siteDir: string;
  themeId: string;
  /** The digest the check returned, i.e. the version the owner saw on the card. */
  digest: string;
}

/**
 * Builds the per-request hooks. `restore` is the actual move, injected so this module stays free of
 * filesystem side effects; it runs only after every gateway check has passed and the token is spent.
 * @complexity O(1) to build; `computePlan` hashes a five-field object.
 */
export function buildHeldBackRestoreHooks<TResult>(
  required: { scope: HeldBackRestoreScope; restore: () => TResult },
  _optional: Record<string, never> = {},
): GatedMutationHooks<HeldBackRestoreScope & { domain: string }, TResult> {
  const details = { domain: HELD_BACK_RESTORE_DOMAIN, ...required.scope };
  return {
    domain: HELD_BACK_RESTORE_DOMAIN,
    readPermission: HELD_BACK_READ_PERMISSION,
    mutatePermission: HELD_BACK_RESTORE_PERMISSION,
    scopeId: required.scope.workspaceId,
    computePlan: async () => ({ planHash: planHashOf({ details }), details }),
    executeMutation: async () => required.restore(),
    resolveActorClassIdentity,
  };
}
