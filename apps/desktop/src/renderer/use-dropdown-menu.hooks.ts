/**
 * @file A top-nav dropdown menu: its open state with click-outside/Escape dismissal, its keyboard
 * navigation, and `SettingsControl`'s handlers. Split out of `App.hooks.ts` (which still
 * re-exports all of it) with no behaviour change; the document each hook reads is now an injected
 * port defaulting to `document`.
 */
import {
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useDismissOnOutsideOrEscape } from '@jini-ai/ui/browser';
import type { ThemePreference } from './theme.js';

/**
 * A dropdown's open state plus the "click/tap outside closes it" behaviour every dropdown in the
 * top nav wants (`SettingsControl`'s appearance menu, `SiteGrid`'s per-card `SiteCardMenu`). `NavLink`
 * has no dropdown of its own — it is a plain section link — so it is not a caller here. Was
 * duplicated inline in both call sites before this extraction.
 *
 */
export function useDismissibleDropdown<T extends HTMLElement = HTMLDivElement>(): {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  containerRef: RefObject<T | null>;
} {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<T>(null);

  useDismissOnOutsideOrEscape({ onDismiss: () => setOpen(false) }, { enabled: open, containerRef, escapeCapture: true });

  return { open, setOpen, containerRef };
}

/** `SettingsControl`'s three handlers — see {@link settingsControlHandlers}. */
export interface SettingsControlHandlers {
  /** The gear button: flips the dropdown, unless the control is disabled. */
  toggleOpen: () => void;
  /** A theme pill: applies the theme, then closes the dropdown. */
  chooseTheme: (input: { next: ThemePreference }) => void;
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
    chooseTheme: ({ next }) => {
      input.onThemeChange(next);
      input.setOpen(false);
    },
    openAppearancePage: () => {
      input.setOpen(false);
      input.onOpenAppearance();
    },
  };
}
