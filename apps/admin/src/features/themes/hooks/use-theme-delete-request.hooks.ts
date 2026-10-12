import { useConfirmRequest, type ConfirmDialogProps } from "@jini-ai/admin/react";
import { interpolate, type Translate } from "@jini-ai/ui/panel-kit";
import { useState } from "react";

import { themeDeleteBlockReasonKey, type ThemeDeleteRequest } from "../theme-card-menu";

/**
 * @file The card menu's "Delete theme…" flow (owner 2026-10-10): a refused Delete reports why, an
 * allowed one asks first ("Delete Plannie copy? It moves to Trash.") and only then calls `trash`.
 * Its own hook, not more state on `useThemes`: that controller owns the server round trips, this
 * owns one confirmation, and `Themes.tsx` stays markup.
 */

export interface ThemeDeleteRequestController {
  /** Props for the screen's one always-mounted `ConfirmDialog`. */
  dialog: ConfirmDialogProps;
  /** The card menu's Delete handler — see {@link useThemeDeleteRequest}. */
  requestDelete: (request: ThemeDeleteRequest) => Promise<void>;
  /** Why the last picked Delete was refused, or `null`. Shown as a toast. */
  blockedNotice: string | null;
  dismissBlockedNotice: () => void;
}

/**
 * @param required.trash - Moves the theme to the Trash; `useThemes`'s `trash`. Called only after the
 *   owner confirms.
 * @param optional.useConfirmation - Seam for Jini's `useConfirmRequest`; defaults to it.
 * @complexity O(1) per request; at most one dialog open (a second request denies the first).
 */
export function useThemeDeleteRequest(
  required: { trash: (themeId: string) => Promise<void>; t: Translate },
  optional: { useConfirmation?: typeof useConfirmRequest } = {}
): ThemeDeleteRequestController {
  const { trash, t } = required;
  const useConfirmation = optional.useConfirmation ?? useConfirmRequest;
  const approval = useConfirmation({});
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);

  async function requestDelete({ themeId, name, block }: ThemeDeleteRequest) {
    setBlockedNotice(null);
    if (block !== null) {
      setBlockedNotice(t(themeDeleteBlockReasonKey(block)));
      return;
    }
    const accepted = await approval.confirm({
      dialog: {
        title: interpolate({ template: t("Delete {name}?"), vars: { name } }),
        body: t("It moves to Trash."),
        confirmLabel: t("Delete"),
        tone: "danger",
      },
    });
    if (accepted) await trash(themeId);
  }

  return { dialog: approval.dialog, requestDelete, blockedNotice, dismissBlockedNotice: () => setBlockedNotice(null) };
}
