import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { agentHandle } from "@jini-ai/agentic";
import type { TabBarTab } from "./TabBar";

/**
 * @file `TabBar.tsx`'s own derived-props logic, split out per the `<Name>.tsx`/`<Name>.hooks.tsx`
 * pattern (admin TSX-logic-sweep, 2026-09-05) — this repo's rule that a `.tsx` file carries no
 * functions or derived logic of its own. `tabDotAccessibleSuffix` stayed behind in `TabBar.tsx`:
 * it returns JSX, so it is a render helper (the same kind of thing `TabBarButton` already is in
 * that file), not derived data — only `tabHandleProps` below, which returns a plain props object
 * with no rendering of its own, is the kind of logic this split targets.
 *
 * `resolveTabBarKeyTarget`/`resolveTabBarTabIndex`/`useTabBarKeyboard` (2026-09-20, WAI-ARIA tabs
 * keyboard pattern) follow the same rule: derived index/props logic lives here, the `.tsx` only
 * wires the returned values into JSX. Precedent: `features/forms/hooks/use-form-editor.hooks.ts`'s
 * `onTabsKeyDown`/`nextTabIndex` (automatic activation — arrow keys call `onChange` directly,
 * matched here for the same reason).
 */

/** The `TabBarButton` component's own `agentHandle()` spread, as a plain function rather than an
 *  inline ternary in its JSX — one more small piece pulled out of `TabBar.tsx` for the same
 *  complexity-gate reason that component's own doc comment gives. */
export function tabHandleProps(tab: TabBarTab) {
  return tab.handle ? agentHandle(tab.handle, { role: "button", label: tab.handleLabel ?? tab.label }) : {};
}

const TAB_BAR_NAV_KEYS = ["ArrowRight", "ArrowLeft", "Home", "End"] as const;
type TabBarNavKey = (typeof TAB_BAR_NAV_KEYS)[number];

function isTabBarNavKey(key: string): key is TabBarNavKey {
  return (TAB_BAR_NAV_KEYS as readonly string[]).includes(key);
}

/** Indices of every non-disabled tab, in `tabs` order — the only positions a key can land on. */
function enabledTabIndices(tabs: readonly TabBarTab[]): number[] {
  return tabs.reduce<number[]>((acc, tab, i) => (tab.disabled ? acc : [...acc, i]), []);
}

/**
 * Resolves which tab a keydown on the tablist should move to, for the WAI-ARIA "automatic
 * activation" tabs pattern (arrow keys change the selection immediately, not just focus).
 *
 * @param tabs - The tab row in DOM order.
 * @param activeId - The currently active tab's id.
 * @param key - `KeyboardEvent.key` from the tablist's own `onKeyDown`.
 * @returns The target tab's index into `tabs`, or `null` when `key` isn't a nav key or every tab
 *   is disabled. Disabled tabs are never a target. Home/End always resolve to the first/last
 *   enabled tab. When `activeId` matches no enabled tab (unset, unknown id, or a disabled tab),
 *   ArrowRight/Home resolve to the first enabled tab and ArrowLeft/End resolve to the last —
 *   the same "nothing to move from" case Home/End already answer explicitly.
 * @complexity O(n) in `tabs.length`.
 */
export function resolveTabBarKeyTarget(tabs: readonly TabBarTab[], activeId: string, key: string): number | null {
  if (!isTabBarNavKey(key)) return null;

  const enabled = enabledTabIndices(tabs);
  if (enabled.length === 0) return null;

  if (key === "Home") return enabled[0];
  if (key === "End") return enabled[enabled.length - 1];

  const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
  const activePos = activeIndex === -1 ? -1 : enabled.indexOf(activeIndex);

  if (key === "ArrowRight") {
    if (activePos === -1) return enabled[0];
    return enabled[(activePos + 1) % enabled.length];
  }
  // ArrowLeft
  if (activePos === -1) return enabled[enabled.length - 1];
  return enabled[(activePos - 1 + enabled.length) % enabled.length];
}

/**
 * Resolves one tab's roving-tabindex value — exactly one tab in a `TabBar` is ever in the native
 * Tab order at a time (WAI-ARIA APG roving tabindex), so arrowing between tabs never lets a plain
 * Tab keypress land on more than one of them.
 *
 * @param tabs - The tab row in DOM order.
 * @param activeId - The currently active tab's id.
 * @param tab - The tab being rendered.
 * @returns `0` for the active tab, or for `tab` itself when `activeId` matches no tab and `tab` is
 *   the first enabled one; `-1` otherwise.
 * @complexity O(n) in `tabs.length`.
 */
export function resolveTabBarTabIndex(tabs: readonly TabBarTab[], activeId: string, tab: TabBarTab): 0 | -1 {
  if (tabs.some((t) => t.id === activeId)) return tab.id === activeId ? 0 : -1;
  const firstEnabled = tabs.find((t) => !t.disabled);
  return firstEnabled?.id === tab.id ? 0 : -1;
}

export interface TabBarKeyboardHandlers {
  onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Wires {@link resolveTabBarKeyTarget} into a tablist's `onKeyDown`: on a nav key, changes the
 * active tab and moves DOM focus to the new tab button, so focus and selection never drift apart.
 *
 * @param tabs - The tab row in DOM order.
 * @param activeId - The currently active tab's id.
 * @param onChange - `TabBarProps.onChange`, called with the target tab's id.
 * @returns `onKeyDown`, for the tablist container's own React event prop.
 * @complexity O(n) in `tabs.length` per keydown (bounded by the on-screen tab count).
 */
export function useTabBarKeyboard(tabs: readonly TabBarTab[], activeId: string, onChange: (id: string) => void): TabBarKeyboardHandlers {
  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>): void {
    const target = resolveTabBarKeyTarget(tabs, activeId, e.key);
    if (target === null) return;
    e.preventDefault();
    onChange(tabs[target].id);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[target]?.focus();
  }
  return { onKeyDown };
}
