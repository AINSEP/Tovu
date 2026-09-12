/**
 * `SiteGrid.tsx`'s derived logic.
 *
 * Both functions below arrived from Tovu-Runner inside `SiteGrid.tsx` itself. This repo keeps
 * functions and derived logic out of `.tsx` files — components render, a sibling `*.hooks.ts` owns
 * everything they derive — which is the same rule `App.tsx`/`App.hooks.ts` already follow. Moving
 * them also makes them directly assertable without mounting the grid: neither touches React,
 * `window`, or IPC, so a test can call them on a plain `SiteRecord`.
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
  cardButtonLabel: string;
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
 * onto a harmless button — or, far worse, the harmless meaning onto the irreversible one.
 *
 * Driven by `project.deleteErasesFiles`, which is main's own guard answer rather than anything
 * derived here, so the overlay can never promise a consequence `handleDelete` will not deliver.
 *
 * @complexity O(1) time, O(1) space.
 */
export function deleteActionCopy(project: SiteRecord): DeleteActionCopy {
  if (project.deleteErasesFiles) {
    return {
      cardButtonLabel: `Delete ${project.displayName}`,
      confirmTitle: `Delete ${project.displayName}?`,
      confirmBody:
        'Stops its process and erases its install directory and all of its content. This cannot be undone.',
      confirmButtonLabel: 'Delete',
      confirmButtonBusyLabel: 'Deleting…',
      confirmButtonClass: 'button button--danger',
    };
  }
  return {
    cardButtonLabel: `Remove ${project.displayName} from Projects`,
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
