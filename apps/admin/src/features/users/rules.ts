import { ApiError, describeApiError as describeApiErrorDefault, type AdminIdentityUser } from "../../lib/api";
import type { RowMenuItem } from "@jini-ai/admin/react";

/**
 * @file Pure logic for the `users` feature — everything that computes a value rather than
 * rendering one. Follows the `posts/rules.ts` convention: no React import, no hooks, directly
 * testable.
 *
 * Moved here from `Users.tsx`: the screen's own `describeApiError` override (a branch per server
 * error `code`), the row-menu item builder (a branch on `user.status` plus the confirm-vs-immediate
 * split for Disable/Enable), and the role/policy grant label formatter (a branch on whether the
 * user holds any grants of that kind). All three were previously closures or free functions inside
 * the component, reachable only by rendering the full screen.
 */

/** Server error `code` -> a plain-language prefix, for every code on this screen whose message is
 *  a fixed string. Keyed by the same closed set of `ApiError` codes the old if-chain checked, in a
 *  flat lookup rather than sequential branches — this is what actually lowered the function's
 *  cognitive score (11 -> under the ceiling): the codes are a closed set of *literal string* keys,
 *  not a discriminated union, so there is no TypeScript exhaustiveness to lose by using a table
 *  (contrast `translateRunAgentPayload`'s `switch`, which stays a `switch` for exactly that reason). */
const STATIC_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  GRANT_EXCEEDS_ISSUER: "You cannot grant a permission you do not hold.",
  FORBIDDEN: "You do not have permission to do that.",
  RESOURCE_CONFLICT: "That username is already in use.",
  OWNER_REQUIRED: "The workspace must keep at least one active owner.",
};

/** Server error `code` -> a plain-language prefix (SPEC-006 errors.spec.md §2), layered on the
 *  shared default (`lib/api.ts`'s `describeApiError`) — this screen's `RESOURCE_CONFLICT` means
 *  "username already in use", a different meaning than `Roles.tsx`'s "still referenced" or
 *  `Workspace.tsx`'s "slug already taken" for the same code (audit cross-cutting finding #2 —
 *  deliberately not unified into one table). `VALIDATION_ERROR` stays a dedicated branch rather than
 *  joining the table above: its message comes from the error itself (`e.message`), not a fixed
 *  string, so it isn't a value a plain lookup can hold. */
export function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === "VALIDATION_ERROR") return e.message || "Please correct the highlighted fields.";
    const staticMessage = STATIC_ERROR_MESSAGES[e.code];
    if (staticMessage) return staticMessage;
  }
  return describeApiErrorDefault(e, fallback);
}

/** The callbacks a row menu needs. Passed in rather than imported, so this module stays free of
 *  state, and so a test can assert exactly which one a given row wires up (same convention as
 *  `posts/rules.ts`'s `PostRowMenuHandlers`). */
export interface UserRowMenuHandlers {
  /** Asked only when `user.status === "active"` — opens the confirm dialog rather than acting. */
  onRequestDisable: (user: AdminIdentityUser) => void;
  /** Asked only when `user.status !== "active"` — fires immediately, no confirm (Enable was never
   *  confirm-gated). */
  onEnable: (user: AdminIdentityUser) => void;
  onManage: (user: AdminIdentityUser) => void;
  onResetPassword: (user: AdminIdentityUser) => void;
}

/**
 * `RowMenu` items for one user row — matches `Posts.tsx`/`Pages.tsx`'s three-dot menu shape, per
 * the corrected spec: Disable/Enable, Manage, Reset password (no Delete — there is no server-side
 * delete route for a user principal; `src/server/routes/admin/users/` has
 * `create`/`disable`/`enable`/`update`/`reset-password` plus role/policy grants, nothing else).
 *
 * Disable/Enable share a single "toggle" item (label follows status, same shape as
 * `Redirects.tsx`'s own toggle item) — Disable confirms via the modal below; Enable fires
 * immediately, matching this screen's existing behavior (Enable was never confirm-gated). The
 * `toggleSaving` guard reproduces the original inline check (`if (toggleSavingId) return`) against
 * whatever row action is currently in flight, read fresh at click time.
 *
 * "Manage" always reads "Manage", never "Close": the item still toggles the expanded panel
 * (`onManage` — closing it again by selecting "Manage" a second time still works exactly as it did
 * as a standalone button), but a `RowMenu` item disappears the instant it is selected, so a label
 * that flips to "Close" is never actually visible mid-interaction — it would only ever describe a
 * state the operator cannot see while the menu that shows it is open. A static label sidesteps that
 * without losing any capability.
 *
 * @complexity Time/space: O(1) — exactly three entries, no iteration.
 */
export function userRowMenuItems(
  user: AdminIdentityUser,
  toggleSaving: boolean,
  handlers: UserRowMenuHandlers,
): RowMenuItem[] {
  return [
    {
      key: "toggle",
      label: user.status === "active" ? "Disable" : "Enable",
      tone: user.status === "active" ? "warning" : "default",
      onSelect: () => {
        if (toggleSaving) return;
        if (user.status === "active") {
          handlers.onRequestDisable(user);
        } else {
          handlers.onEnable(user);
        }
      },
    },
    {
      key: "manage",
      label: "Manage",
      onSelect: () => handlers.onManage(user),
    },
    {
      key: "reset-password",
      label: "Reset password",
      tone: "warning",
      onSelect: () => handlers.onResetPassword(user),
    },
  ];
}

/**
 * The role or policy names a user holds, for the "Roles"/"Policies" table cells — `null` when the
 * user holds none, which the caller renders as the `muted-cell` "none" fallback (a plain ternary on
 * this already-computed value, per this feature's extraction rule).
 *
 * A grant id with no matching entry in `byId` (a role/policy deleted out from under a still-held
 * grant) falls back to rendering the raw id rather than dropping it silently — the operator sees
 * something is wrong instead of an undercount with no explanation.
 *
 * @complexity Time: O(n) in the number of granted ids; space: O(n) for the joined string.
 */
export function formatGrantLabel(ids: readonly string[], byId: ReadonlyMap<string, { name: string }>): string | null {
  if (ids.length === 0) return null;
  return ids.map((id) => byId.get(id)?.name ?? id).join(", ");
}
