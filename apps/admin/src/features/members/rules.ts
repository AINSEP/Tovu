import { ApiError, describeApiError as describeApiErrorDefault, type AdminMember } from "../../lib/api";
import type { RowMenuItem } from "@jini-ai/admin/react";
import { t } from "./members-i18n";

/**
 * @file Pure logic for the `members` feature — everything that computes a value rather than
 * rendering one. Follows the `posts/rules.ts` convention: no React import, no hooks, directly
 * testable.
 *
 * Moved here from `Members.tsx`: `RowActionState`/`emptyRowState` (already module-scope free
 * functions in the original, just not exported or testable), the screen's `describeApiError`
 * override (a `FORBIDDEN`-code branch), and the row-menu item builder (a branch on
 * `member.status !== "disabled"`).
 */

/** This screen's name on `lib/content-refresh-bus.ts` — see `taxonomy/rules.ts`'s
 *  `TAXONOMY_RESOURCE` for why this is a plain colocated constant rather than a shared registry.
 *  Agent-writable via `members_disable` (`apps/website/src/features/members/agent-tools.ts`), which
 *  flips a member's status this list renders. `members_request_magic_link` mutates durable state too
 *  but changes nothing this screen displays, so it needs no separate justification here. */
export const MEMBERS_RESOURCE = "members";

/** Per-row in-flight/result state for the two row actions (Disable, Resend sign-in link). */
export interface RowActionState {
  disabling: boolean;
  resending: boolean;
  error: string | null;
  notice: string | null;
}

export function emptyRowState(): RowActionState {
  return { disabling: false, resending: false, error: null, notice: null };
}

/** Overrides layered on the shared default (`lib/api.ts`'s `describeApiError`).
 *
 *  `locale` (C4 fix, 2026-09-20): the FORBIDDEN override used to return its English literal
 *  directly, leaking English into every non-`en` locale — see `users/rules.ts`'s identical fix for
 *  the full reasoning. The literal is now also a key into `members-i18n.ts`'s `MEMBERS_DICT`. */
export function describeApiError(e: unknown, fallback: string, locale: string): string {
  if (e instanceof ApiError && e.code === "FORBIDDEN") return t(locale, "You do not have permission to do that.");
  return describeApiErrorDefault(e, fallback);
}

/** The callbacks a row menu needs. Passed in rather than imported, so this module stays free of
 *  state (same convention as `posts/rules.ts`'s `PostRowMenuHandlers`). */
export interface MemberRowMenuHandlers {
  onResendSignInLink: (member: AdminMember) => void;
  /** Opens the confirm dialog; only offered when `member.status !== "disabled"`. */
  onRequestDisable: (member: AdminMember) => void;
}

/** `RowMenu` items for one member row. "Disable" is omitted once the member is already disabled
 *  — `RowMenu` has no per-item `disabled`, and `Posts.tsx`'s own precedent (omitting "Disable"
 *  entirely for an already-draft row rather than showing it disabled) is to omit an inapplicable
 *  action rather than show it as a no-op.
 *
 * @complexity Time/space: O(1) — at most two entries, no iteration.
 */
export function memberRowMenuItems(
  member: AdminMember,
  rs: RowActionState,
  handlers: MemberRowMenuHandlers,
  locale: string,
): RowMenuItem[] {
  const items: RowMenuItem[] = [
    {
      key: "resend",
      label: t(locale, "Resend sign-in link"),
      onSelect: () => {
        if (rs.resending) return;
        handlers.onResendSignInLink(member);
      },
    },
  ];
  if (member.status !== "disabled") {
    items.push({
      key: "disable",
      label: t(locale, "Disable"),
      tone: "warning",
      onSelect: () => {
        if (rs.disabling) return;
        handlers.onRequestDisable(member);
      },
    });
  }
  return items;
}
