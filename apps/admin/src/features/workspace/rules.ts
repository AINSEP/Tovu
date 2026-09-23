import { ApiError, describeApiError as describeApiErrorDefault, type AdminWorkspace } from "../../lib/api";
import { t } from "./workspace-i18n";

/**
 * @file Pure logic for the `workspace` feature — everything that computes a value rather than
 * rendering one. See `features/posts/rules.ts`'s file header for the standing convention this
 * follows.
 */

/**
 * Overrides layered on the shared default (`lib/api.ts`'s `describeApiError`) — this screen's
 * `RESOURCE_CONFLICT` means "slug already taken", a different meaning than `Roles.tsx`'s "still
 * referenced" or `Users.tsx`'s "username already in use" for the same code (audit cross-cutting
 * finding #2 — deliberately not unified into one table).
 *
 * `locale` (C4 fix, 2026-09-20): every branch here used to return its English literal directly,
 * leaking English into every non-`en` locale — see `users/rules.ts`'s identical fix for the full
 * reasoning. Each literal is now also a key into `workspace-i18n.ts`'s `WORKSPACE_DICT`.
 *
 * @complexity Time/space: O(1).
 */
export function describeApiError(e: unknown, fallback: string, locale: string): string {
  if (e instanceof ApiError) {
    if (e.code === "FORBIDDEN") return t(locale, "You do not have permission to do that.");
    if (e.code === "RESOURCE_CONFLICT") return t(locale, "That slug is already in use.");
    if (e.code === "VALIDATION_ERROR") return e.message || t(locale, "Please correct the highlighted fields.");
  }
  return describeApiErrorDefault(e, fallback);
}

/**
 * Whether the rename form's draft `name`/`slug` differ from the persisted workspace — drives
 * whether the Save button is enabled and whether a stale "Saved." label is suppressed after a
 * further edit.
 *
 * @complexity Time/space: O(1).
 */
export function isWorkspaceDirty(workspace: AdminWorkspace, name: string, slug: string): boolean {
  return name !== workspace.name || slug !== workspace.slug;
}
