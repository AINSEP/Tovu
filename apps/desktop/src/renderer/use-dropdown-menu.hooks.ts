/**
 * @file A top-nav dropdown menu: its open state with click-outside/Escape dismissal, its keyboard
 * navigation, and `SettingsControl`'s handlers. Split out of `App.hooks.ts` (which still
 * re-exports all of it) with no behaviour change; the document each hook reads is now an injected
 * port defaulting to `document`.
 */
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import { dismissOnEscape } from './site-shell-policy.js';
import type { ThemePreference } from './theme.js';

/** The slice of `document` {@link useDismissibleDropdown} listens on. */
export type DocumentListeners = Pick<Document, 'addEventListener' | 'removeEventListener'>;

/** The slice of `document` {@link useMenuKeyboard} reads focus from. */
export type DocumentFocus = Pick<Document, 'activeElement' | 'body'>;

/**
 * A dropdown's open state plus the "click/tap outside closes it" behaviour every dropdown in the
 * top nav wants (`SettingsControl`'s appearance menu, `SiteGrid`'s per-card `SiteCardMenu`). `NavLink`
 * has no dropdown of its own — it is a plain section link — so it is not a caller here. Was
 * duplicated inline in both call sites before this extraction.
 *
 * @param options.doc where the outside-press and Escape listeners go; `document` by default.
 */
export function useDismissibleDropdown<T extends HTMLElement = HTMLDivElement>(
  _required: Record<string, never> = {},
  { doc = document }: { doc?: DocumentListeners } = {},
): {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  containerRef: RefObject<T | null>;
} {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => dismissOnEscape({ event, dismiss: () => setOpen(false) });
    doc.addEventListener('keydown', onEscape, true);
    doc.addEventListener('pointerdown', onPointerDown);
    return () => {
      doc.removeEventListener('pointerdown', onPointerDown);
      doc.removeEventListener('keydown', onEscape, true);
    };
  }, [open, doc]);

  return { open, setOpen, containerRef };
}

/**
 * Which menu entry a key moves focus to, or `null` when the key is not a menu-navigation key.
 * Wraps at both ends, as native menus do. `current` is `-1` when focus is not on an entry yet.
 *
 * @complexity O(1).
 */
export function menuFocusIndex(
  { key, current, count }: { key: string; current: number; count: number }, _optional = {},
): number | null {
  if (count === 0) return null;
  if (key === 'ArrowDown') return (current + 1) % count;
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

const MENU_ENTRIES = '[role="menuitem"], [role="menuitemradio"]';

/**
 * The keyboard half of a `role="menu"` dropdown: on open, focus lands on the first entry (the
 * selected one for a radio group is reached with the arrows like any other); Up/Down/Home/End move
 * between entries; and when the menu closes with focus still inside it — an entry was chosen, or
 * Escape — focus goes back to the trigger instead of falling to `<body>`. Escape itself stays
 * `useDismissibleDropdown`'s job. A click elsewhere moved focus on purpose, so that is left alone.
 *
 * @param options.doc where the currently focused element is read; `document` by default.
 * @complexity O(n) per key in the number of entries.
 */
export function useMenuKeyboard<T extends HTMLElement = HTMLDivElement, B extends HTMLElement = HTMLButtonElement>(
  { open }: { open: boolean },
  { doc = document }: { doc?: DocumentFocus } = {},
): { menuRef: RefObject<T | null>; triggerRef: RefObject<B | null>; onMenuKeyDown: (event: ReactKeyboardEvent<T>) => void } {
  const menuRef = useRef<T>(null);
  const triggerRef = useRef<B>(null);
  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector<HTMLElement>(MENU_ENTRIES)?.focus();
    return () => {
      const active = doc.activeElement;
      if (!active || active === doc.body || menuRef.current?.contains(active)) triggerRef.current?.focus();
    };
  }, [open, doc]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<T>) => {
    const entries = [...(menuRef.current?.querySelectorAll<HTMLElement>(MENU_ENTRIES) ?? [])];
    const next = menuFocusIndex({ key: event.key, current: entries.indexOf(doc.activeElement as HTMLElement), count: entries.length });
    if (next === null) return;
    event.preventDefault();
    entries[next]?.focus();
  };

  return { menuRef, triggerRef, onMenuKeyDown };
}

/** `SettingsControl`'s three handlers — see {@link settingsControlHandlers}. */
export interface SettingsControlHandlers {
  /** The gear button: flips the dropdown, unless the control is disabled. */
  toggleOpen: () => void;
  /** A theme pill: applies the theme, then closes the dropdown. */
  chooseTheme: (next: ThemePreference) => void;
  /** The "Appearance" link: closes the dropdown, then opens the page. */
  openAppearancePage: () => void;
}

/**
 * `SettingsControl`'s handlers, built from its dropdown setter and its two callbacks.
 *
 * Only the gear button checks `disabled`, for the same `aria-disabled` reason as
 * `navLinkClick`. The two dropdown entries do not, because a dropdown that cannot open offers
 * nothing to click.
 *
 * @complexity O(1).
 */
export function settingsControlHandlers(input: {
  disabled: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  onThemeChange: (next: ThemePreference) => void;
  onOpenAppearance: () => void;
}): SettingsControlHandlers {
  return {
    toggleOpen: () => {
      if (input.disabled) return;
      input.setOpen((current) => !current);
    },
    chooseTheme: (next) => {
      input.onThemeChange(next);
      input.setOpen(false);
    },
    openAppearancePage: () => {
      input.setOpen(false);
      input.onOpenAppearance();
    },
  };
}
