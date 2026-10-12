/**
 * @file Pure rules for the assistant dock header's icon buttons (owner, 2026-10-11): the white
 * tooltip under each one (same bubble as the subagents icon's `InfoTip`) and the gear's settings
 * menu. Kept out of the `.tsx` files so the behaviour is testable without rendering.
 */

/**
 * Whether a hover/focus on `target` should open the header tooltip. Never while the control's own
 * popup is open (its trigger reports `aria-expanded="true"`) or for anything inside that popup —
 * the conversation switcher renders its menu inside the tooltip's wrapper, and the gear's portaled
 * menu still bubbles React focus events through it, so either would otherwise cover the open menu.
 * @param input.target - The event target the hover/focus came from.
 * @returns `true` only for a control whose popup is closed.
 * @complexity O(depth) for the two `closest` walks.
 */
export function shouldShowHeaderTip({ target }: { target: EventTarget | null }): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('[role="menu"]') === null && target.closest('[aria-expanded="true"]') === null;
}

/** One row of the gear menu. `disabled` rows render but do nothing when chosen. */
export interface DockSettingsMenuItem {
  key: string;
  label: string;
  disabled?: boolean;
  onSelect?: () => void;
}

/**
 * The gear menu's rows. A list rather than one hard-coded row so settings can be added later
 * without reshaping the menu. Today it holds one row, which opens the Chat settings dialog (owner,
 * 2026-10-11; it replaced the disabled "Settings — coming soon" placeholder).
 * @param input.t - The dock's translator.
 * @param options.onOpenChatSettings - Opens the dialog.
 * @returns The rows, in display order.
 */
export function dockSettingsMenuItems(
  { t }: { t: (key: string) => string },
  { onOpenChatSettings }: { onOpenChatSettings: () => void },
): DockSettingsMenuItem[] {
  return [{ key: "chat-settings", label: t("Open chat settings…"), onSelect: onOpenChatSettings }];
}

/**
 * Runs a chosen row. A disabled row leaves the menu open and calls nothing, so clicking the
 * placeholder does not look like it did something.
 * @param input.item - The chosen row.
 * @param input.selectItem - The menu hook's close-then-run action.
 * @returns Whether the row was run.
 */
export function activateDockMenuItem({ item, selectItem }: {
  item: DockSettingsMenuItem;
  selectItem: (input: { onSelect: () => void }) => void;
}): boolean {
  if (item.disabled || !item.onSelect) return false;
  selectItem({ onSelect: item.onSelect });
  return true;
}
