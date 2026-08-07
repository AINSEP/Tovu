import type { RowMenuItem } from "@jini-ai/admin/react";

import { ApiError, describeApiError as describeApiErrorDefault, type AdminPolicy, type AdminRole } from "../../lib/api";

/**
 * @file Pure logic for the `roles` feature — everything that computes a value rather than
 * rendering one.
 *
 * Follows the `rules.ts` convention `features/posts/rules.ts` establishes: the slice's decisions
 * live in one importable, directly testable module with no React in it. `describeApiError` and the
 * two row-menu builders were previously module-level helpers/closures inside `Roles.tsx`; they
 * compute a value (an error string, a menu array) rather than render one, so per that convention
 * they move here rather than stay "presentation".
 *
 * The row-menu builders take their callbacks as an explicit handlers object rather than closing
 * over component state, mirroring `postRowMenuItems`' `PostRowMenuHandlers` — this module has no
 * component to close over, and passing handlers explicitly is also what lets a test assert exactly
 * which callback a given row wires up.
 */

/** Same flat-lookup shape as `users/rules.ts`'s `describeApiError` (see its comment for why a
 *  table doesn't lose exhaustiveness here) — a closed set of literal `code` strings, not a
 *  discriminated union. */
const STATIC_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  FORBIDDEN: "You do not have permission to do that.",
  RESOURCE_CONFLICT: "It is still in use — remove that assignment/attachment first.",
  PERMISSION_UNKNOWN: "That permission is not recognized.",
  GRANT_EXCEEDS_ISSUER: "You cannot grant a permission you do not hold.",
};

/** Overrides layered on the shared default (`lib/api.ts`'s `describeApiError`) — this screen's
 *  `RESOURCE_CONFLICT` means "still referenced by an assignment/attachment", a different meaning
 *  than `Workspace.tsx`'s "slug already taken" or `Users.tsx`'s "username already in use" for the
 *  same code (audit cross-cutting finding #2 — deliberately not unified into one table).
 *  `VALIDATION_ERROR` stays its own branch — its message comes from `e.message`, not a fixed
 *  string a lookup table can hold.
 *
 * @complexity Time/space: O(1) — a fixed set of code checks, no iteration.
 */
export function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === "VALIDATION_ERROR") return e.message || "Please correct the highlighted fields.";
    const staticMessage = e.code ? STATIC_ERROR_MESSAGES[e.code] : undefined;
    if (staticMessage) return staticMessage;
  }
  return describeApiErrorDefault(e, fallback);
}

/** The callbacks a role row menu needs. Passed in rather than imported so this module stays free
 *  of state and navigation, and so a test can assert exactly which one a given row wires up. */
export interface RoleRowMenuHandlers {
  onRename: (role: AdminRole) => void;
  onDelete: (role: AdminRole) => void;
}

/** At-rest row actions for a role (built-in rows and an actively-editing row never reach these —
 *  see `Roles.tsx`'s table JSX, which renders `—` or the Save/Cancel pair for those instead).
 *
 * @complexity Time/space: O(1) — exactly two entries, no iteration.
 */
export function roleMenuItems(role: AdminRole, handlers: RoleRowMenuHandlers): RowMenuItem[] {
  return [
    { key: "rename", label: "Rename", onSelect: () => handlers.onRename(role) },
    { key: "delete", label: "Delete", destructive: true, onSelect: () => handlers.onDelete(role) },
  ];
}

/** The callbacks a policy row menu needs, plus the id of whichever policy currently has its
 *  "Add permission" form open — needed to compute the toggle item's label. Passed in rather than
 *  read from state so this module stays free of state and navigation. */
export interface PolicyRowMenuHandlers {
  onRename: (policy: AdminPolicy) => void;
  onTogglePermissionForm: (policyId: string) => void;
  onDelete: (policy: AdminPolicy) => void;
}

/** Same shape as {@link roleMenuItems}, plus the "Add permission"/"Close" toggle — its label still
 *  flips based on `permissionPolicyId` exactly as the inline button it replaced did; only where
 *  that toggle now lives (a `RowMenu` item instead of a bare button) changed.
 *
 * @complexity Time/space: O(1) — exactly three entries, no iteration.
 */
export function policyMenuItems(
  policy: AdminPolicy,
  permissionPolicyId: string | null,
  handlers: PolicyRowMenuHandlers,
): RowMenuItem[] {
  return [
    { key: "rename", label: "Rename", onSelect: () => handlers.onRename(policy) },
    {
      key: "permission",
      label: permissionPolicyId === policy.id ? "Close" : "Add permission",
      onSelect: () => handlers.onTogglePermissionForm(policy.id),
    },
    { key: "delete", label: "Delete", destructive: true, onSelect: () => handlers.onDelete(policy) },
  ];
}
