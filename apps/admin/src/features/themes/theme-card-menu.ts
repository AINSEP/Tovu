import type { RowMenuItem } from "@jini-ai/admin/react";

import type { PresentationSettings } from "@/lib/api";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { isActiveTheme } from "./rules";

/**
 * @file The theme card's ⋮ menu (owner 2026-10-10): which items it lists and when Delete is refused.
 * Pure — `Themes.tsx` renders the list with the admin's shared `RowMenu`, and a new card action is
 * one more entry in {@link buildThemeCardMenuItems}, not another icon button on the card.
 */

/** Why a card's Delete is refused, or `null` when the theme can go to the Trash. */
export type ThemeDeleteBlock = "active" | "built-in" | null;

/**
 * The active theme can't be trashed (the server refuses it too — `THEME_ACTIVE`, `trash-theme-tool.ts`),
 * and a theme the package ships stays out of the menu's reach. Active wins when both hold: that is the
 * one the owner can do something about.
 *
 * @complexity O(1).
 */
export function themeDeleteBlock(required: { settings: PresentationSettings; themeId: string; builtIn: boolean }): ThemeDeleteBlock {
  if (isActiveTheme(required.settings, required.themeId)) return "active";
  return required.builtIn ? "built-in" : null;
}

/** The sentence shown when a refused Delete is picked — an i18n key. @complexity O(1). */
export function themeDeleteBlockReasonKey(block: Exclude<ThemeDeleteBlock, null>): string {
  return block === "active" ? "Turn this theme off or activate another one first" : "Built-in themes can't be deleted";
}

/** What Delete hands the screen: the theme, its display name for the dialog, and any refusal. */
export interface ThemeDeleteRequest {
  themeId: string;
  name: string;
  block: ThemeDeleteBlock;
}

/**
 * The card menu's items, in display order: Copy theme, then Delete theme… (danger tone).
 *
 * `RowMenu` has no disabled item, so a refused Delete stays listed and picking it reports the reason
 * (`onRequestDelete` gets the `block`) — the same "show the item, explain on select" call the Explore
 * file menu made (owner 2026-08-11). Each item is left out when its handler is (an older controller
 * without `duplicate`/`trash`), so an empty list means the card shows no ⋮ at all. Copy does nothing
 * while any copy is in flight, so two picks can't race two copies — that is what the old Duplicate
 * button's `disabled` did.
 *
 * @complexity O(1) — at most two items.
 */
export function buildThemeCardMenuItems(
  required: {
    themeId: string;
    name: string;
    block: ThemeDeleteBlock;
    duplicatingTheme: string | null;
    t: Translate;
  },
  optional: { duplicate?: (themeId: string) => Promise<void>; onRequestDelete?: (request: ThemeDeleteRequest) => void } = {}
): RowMenuItem[] {
  const { themeId, name, block, duplicatingTheme, t } = required;
  const { duplicate, onRequestDelete } = optional;
  const items: RowMenuItem[] = [];
  if (duplicate) {
    items.push({
      key: "copy",
      label: duplicatingTheme === null ? t("Copy theme") : t("Duplicating…"),
      onSelect: () => {
        if (duplicatingTheme === null) void duplicate(themeId);
      },
    });
  }
  if (onRequestDelete) {
    items.push({
      key: "delete",
      label: t("Delete theme…"),
      tone: "danger",
      onSelect: () => onRequestDelete({ themeId, name, block }),
    });
  }
  return items;
}
