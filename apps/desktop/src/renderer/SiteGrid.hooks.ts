/**
 * `SiteGrid.tsx`'s derived logic.
 *
 * The first of these arrived from Tovu-Runner inside `SiteGrid.tsx` itself; the rest were pulled out
 * of that file's component bodies later. This repo keeps functions and derived logic out of `.tsx`
 * files — components render, a sibling `*.hooks.ts` owns everything they derive — which is the same
 * rule `App.tsx`/`App.hooks.ts` already follow. Moving them also makes them directly assertable
 * without mounting the grid: none touches React, `window`, or IPC, so a test can call them on a
 * plain `SiteRecord` or a plain-object event.
 */
import type { SiteRecord } from '../contracts/project.js';

/**
 * Whether clicking a project's card should open it.
 *
 * Nothing to open yet mid-provision — `tovu init` hasn't produced a workspace to serve. A card
 * asking whether to delete itself is not an open target either: the click that dismisses the
 * wrong answer must not also open the project.
 *
 * @complexity O(1) time, O(1) space.
 */
export function isCardOpenable(project: SiteRecord, confirming: boolean): boolean {
  return project.status !== 'provisioning' && project.status !== 'blocked' && !confirming;
}

/**
 * Whether a keydown that reached the card should open the project.
 *
 * The `event.target !== event.currentTarget` half is the whole reason this is a function rather
 * than an inline condition. The card is a keyboard-activated open target, and it is also the
 * ANCESTOR of the delete button; a keydown on that button bubbles to the card, where an unguarded
 * handler called `preventDefault()` — cancelling the very click the browser was about to synthesize
 * from the key — and then opened the project. Keyboard users therefore could not reach the delete
 * confirmation at all: Enter or Space on a focused delete button opened the project instead.
 *
 * `CardConfirmOverlay` already carried the sibling of this guard (`onKeyDown` stopPropagation
 * alongside its `onClick` one) and its own comment states this exact mechanism; the delete button
 * was given only the `onClick` half. Guarding at the card instead of at each descendant fixes both
 * arms and any control added later, which is why the check lives here and not on the button.
 *
 * @param event the keydown, narrowed to the three fields this decision reads — so a test can call
 *   it with plain objects and no DOM.
 * @complexity O(1) time, O(1) space.
 */
export function isCardOpenKey(event: {
  key: string;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
}): boolean {
  if (event.target !== event.currentTarget) return false;
  return event.key === 'Enter' || event.key === ' ';
}

/**
 * The human-readable name for whichever database a project was provisioned against. A `custom`
 * provider carries its own operator-supplied `label`; the fallback names the category rather than
 * leaving the card's metadata row blank.
 *
 * @complexity O(1) time, O(1) space.
 */
export function databaseLabel(project: SiteRecord): string {
  if (project.database.kind === 'supabase') return 'Supabase';
  if (project.database.kind === 'custom') return project.database.label ?? 'Custom DB provider';
  return 'SQLite';
}

/** The words one project card's destructive control uses, and the class its confirm button wears. */
export interface DeleteActionCopy {
  /** The ⋮ menu's own entry text. A short verb, not the card's icon-button aria-label this field
   *  used to be (`cardButtonLabel`) — the entry is now a visible `role="menuitem"` with its own
   *  text, so it is its own accessible name, the same way "Rename…" needs none either. The ellipsis
   *  matches "Rename…"'s convention: both entries open something else (a confirm overlay, a rename
   *  form) rather than acting immediately. */
  menuItemLabel: string;
  confirmTitle: string;
  confirmBody: string;
  confirmButtonLabel: string;
  confirmButtonBusyLabel: string;
  confirmButtonClass: string;
}

/**
 * What this card's destructive control should SAY, given what main will actually do to the folder.
 *
 * Two different consequences must not hide behind one word. A project this app provisioned is
 * genuinely deleted — the folder, the database, the uploads, unrecoverably — and "Delete" in red is
 * the honest label. A project the app only adopted (the seeded `sites/tovu-com` card, or any folder
 * that already held a site when it was picked) loses nothing but its card, so the control says
 * "Remove", explains that the files stay, and is not styled as a destructive action, because it
 * is not one. Calling both of them "Delete" would train the operator to read the scarier meaning
 * onto a harmless button — or, far worse, the harmless meaning onto the irreversible one. The same
 * split decides `card__menuitem--danger` in `SiteGrid.tsx`'s `SiteCardMenu`.
 *
 * Driven by `project.deleteErasesFiles`, which is main's own guard answer rather than anything
 * derived here, so the overlay can never promise a consequence `handleDelete` will not deliver.
 *
 * @complexity O(1) time, O(1) space.
 */
export function deleteActionCopy(project: SiteRecord): DeleteActionCopy {
  if (project.deleteErasesFiles) {
    return {
      menuItemLabel: 'Delete…',
      confirmTitle: `Delete ${project.displayName}?`,
      confirmBody:
        'Stops its process and erases its install directory and all of its content. This cannot be undone.',
      confirmButtonLabel: 'Delete',
      confirmButtonBusyLabel: 'Deleting…',
      confirmButtonClass: 'button button--danger',
    };
  }
  return {
    menuItemLabel: 'Remove from Projects…',
    confirmTitle: `Remove ${project.displayName} from Projects?`,
    confirmBody:
      'Takes this card off the Projects screen and stops its process. Tovu did not create this folder, so nothing on disk is touched — its content stays exactly where it is.',
    confirmButtonLabel: 'Remove',
    confirmButtonBusyLabel: 'Removing…',
    // Primary, not danger and not quiet: it is still this dialog's affirmative action, so it must
    // read differently from Cancel (which is `button--quiet`), but red would restate exactly the
    // destructive meaning this whole branch exists to deny.
    confirmButtonClass: 'button button--primary',
  };
}

/**
 * Which overlay, if any, covers a card right now.
 *
 * One value rather than the two parallel booleans this started as (`confirming`, `renaming`),
 * because they were never independent: a card shows at most one overlay, and both make it inert
 * for the same reason — the click that commits or dismisses an overlay must not also open the site
 * underneath it. Two booleans let the type say "both at once", which the UI has no rendering for.
 *
 * @complexity O(1) time, O(1) space.
 */
export type CardOverlayMode = 'confirm' | 'rename' | null;

/**
 * The overlay mode for one card, given the grid's two single-slot ids.
 *
 * Delete wins a tie. It cannot currently happen — opening either flow does not close the other's
 * slot — but if it ever did, the destructive confirmation is the one that must not be hidden.
 *
 * @complexity O(1) time, O(1) space.
 */
export function cardOverlay(
  id: string,
  pendingDeleteId: string | null,
  renamingId: string | null,
): CardOverlayMode {
  if (pendingDeleteId === id) return 'confirm';
  return renamingId === id ? 'rename' : null;
}

/** Exactly what {@link isCardOpenKey} reads, plus the one method the handler calls — so a test can
 *  drive `cardOpenProps` with a plain object and no DOM, the same way `isCardOpenKey` already can. */
export interface CardOpenKeyEvent {
  key: string;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  preventDefault: () => void;
}

/**
 * The card's "I am an open target" props, or the inert equivalents.
 *
 * Extracted because the card element was carrying five separate `openable ? … : undefined`
 * ternaries for what is one decision — a reader had to check all five to confirm they agreed, and
 * a sixth attribute added later could disagree with the other five silently. One call, one answer.
 *
 * `onKeyDown` keeps using {@link isCardOpenKey} rather than an inline key check: it also refuses a
 * keydown that started on a DESCENDANT, which is what stops the delete button's and the ⋮ menu's
 * keyboard activation from opening the site instead. See that function's own doc.
 *
 * @param openable whether this card should respond at all.
 * @param onOpen invoked with nothing — the caller closes over which site it means.
 * @complexity O(1) time, O(1) space.
 */
export function cardOpenProps(
  openable: boolean,
  onOpen: () => void,
): {
  role: 'button' | undefined;
  tabIndex: 0 | undefined;
  onClick: (() => void) | undefined;
  onKeyDown: ((event: CardOpenKeyEvent) => void) | undefined;
} {
  if (!openable) {
    return { role: undefined, tabIndex: undefined, onClick: undefined, onKeyDown: undefined };
  }
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (event) => {
      if (!isCardOpenKey(event)) return;
      event.preventDefault();
      onOpen();
    },
  };
}

/**
 * The ⋮ menu's per-entry `onClick` builder: every entry closes the menu first, then acts — the same
 * order `SettingsControl` (`App.tsx`) uses for its Appearance link. Acting first would leave an open
 * menu floating over whatever the action changed.
 *
 * @param setOpen the menu's open-state setter (`useDismissibleDropdown`'s).
 * @returns `choose(act)`, which builds one entry's handler. Building it runs nothing.
 * @complexity O(1) time, O(1) space.
 */
export function closeMenuThen(setOpen: (open: boolean) => void): (act: () => void) => () => void {
  return (act) => () => {
    setOpen(false);
    act();
  };
}
