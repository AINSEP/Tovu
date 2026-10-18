/**
 * @file Pure rules for the assistant dock header's icon buttons (owner, 2026-10-11): the white
 * tooltip under each one (same bubble as the subagents icon's `InfoTip`) and the gear's settings
 * menu. Kept out of the `.tsx` files so the behaviour is testable without rendering.
 */

import { CHAT_TOOL_CALL_OPTIONS } from "./chat-display-preferences";
import type { ChatDisplayPreferencesController } from "./hooks/use-chat-display-preferences.hooks";

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

/**
 * One row of the gear menu. A plain `menuitem` runs and closes the menu; a `menuitemradio` or
 * `menuitemcheckbox` row is a setting, applied in place with the menu left open so several can be
 * changed in one visit. `disabled` rows render but do nothing when chosen.
 */
export interface DockSettingsMenuItem {
  key: string;
  label: string;
  role?: "menuitem" | "menuitemradio" | "menuitemcheckbox";
  checked?: boolean;
  /** What the setting does, shown on hover. */
  hint?: string;
  disabled?: boolean;
  onSelect?: () => void;
}

/** A run of rows, under an optional heading; sections after the first are drawn with a divider. */
export interface DockSettingsMenuSection {
  key: string;
  label?: string;
  /** One line explaining the whole section, shown under its heading in the Chat settings dialog. */
  description?: string;
  items: DockSettingsMenuItem[];
}

/**
 * The gear menu (owner, 2026-10-11): the chat's display settings right in the dropdown — Tool calls
 * as a Show/Collapsed/Hidden radio group, then Done line and Thinking as on/off rows. They replaced
 * the one-tab Chat settings modal. More settings now opens the advanced dialog while these quick
 * changes stay available. Both surfaces receive these same actions and stored preferences.
 * @param input.t - The dock's translator.
 * @param options.display - The current choices and their saver (`useChatDisplayPreferences`).
 * @returns The sections, in display order.
 * @complexity O(1).
 */
export function dockSettingsMenuSections(
  { t }: { t: (key: string) => string },
  { display, onMoreSettings }: { display: Pick<ChatDisplayPreferencesController, "preferences" | "update">; onMoreSettings?: () => void },
): DockSettingsMenuSection[] {
  const { preferences, update } = display;
  const toolCallsHint = t("Show: every tool call. Collapsed: one line per reply, click to open. Hidden: only failed calls.");
  return [
    {
      key: "tool-calls",
      label: t("Tool calls"),
      description: t("How tool calls appear in the chat."),
      items: CHAT_TOOL_CALL_OPTIONS.map((option) => ({
        key: `tool-calls-${option.value}`,
        label: t(option.label),
        role: "menuitemradio",
        checked: preferences.toolCalls === option.value,
        hint: toolCallsHint,
        onSelect: () => update({ toolCalls: option.value }),
      })),
    },
    {
      key: "transcript",
      items: [
        { key: "done-line", label: t("Done line"), role: "menuitemcheckbox", checked: preferences.showUsageLine,
          hint: t("Time, cost and running total under each reply."), onSelect: () => update({ showUsageLine: !preferences.showUsageLine }) },
        { key: "thinking", label: t("Thinking"), role: "menuitemcheckbox", checked: preferences.showThinking,
          hint: t("Shows the model's reasoning when the agent shares it."), onSelect: () => update({ showThinking: !preferences.showThinking }) },
      ],
    },
    ...(onMoreSettings ? [{ key: "more-settings", items: [{ key: "more-settings", label: t("More settings…"), onSelect: onMoreSettings }] }] : []),
  ];
}

/**
 * Runs a chosen row. A disabled row leaves the menu open and calls nothing, so clicking the
 * placeholder does not look like it did something. A setting row (radio/checkbox) applies without
 * closing, so focus stays on it and the new check mark is visible at once.
 * @param input.item - The chosen row.
 * @param input.selectItem - The menu hook's close-then-run action.
 * @returns Whether the row was run.
 */
export function activateDockMenuItem({ item, selectItem }: {
  item: DockSettingsMenuItem;
  selectItem: (input: { onSelect: () => void }) => void;
}): boolean {
  if (item.disabled || !item.onSelect) return false;
  if (item.role === "menuitemradio" || item.role === "menuitemcheckbox") item.onSelect();
  else selectItem({ onSelect: item.onSelect });
  return true;
}
