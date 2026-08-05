import type { SaveState } from "../../hooks/use-settings-slice.hooks";

/**
 * @file Pure logic for the `settings` feature (the Open Design settings-dialog port) —
 * everything that computes a value rather than rendering one.
 *
 * Named `rules.ts` to match `features/posts/rules.ts`'s and `features/settings-raw/rules.ts`'s
 * convention: the slice's decisions live in one importable, directly testable module with no
 * React in it.
 *
 * `SettingsUi.tsx` mounts six independent `useSettingsSlice` instances (Execution, Instructions,
 * Notifications, Privacy, Dialog appearance, Language); the functions below all operate on that
 * homogeneous `{ value, loadError, saveState }` shape rather than on any one slice's own type, so
 * they don't need to know which of the six they're being called with.
 */

/** The subset of `SettingsSlice<T>` these functions actually read, kept generic-free so callers
 *  don't have to reconcile six different `T`s into one array type. */
export interface SliceLoadState {
  value: unknown;
  loadError: string | null;
}

/**
 * `SettingsUi`'s "everything resolved" gate. Every slice starts `null` and settles
 * independently; gating on the whole set keeps tabs from popping in one at a time as their
 * namespaces resolve.
 *
 * @complexity Time: O(n) in slice count; space: O(1).
 */
export function areAnySlicesLoading(slices: readonly SliceLoadState[]): boolean {
  return slices.some((slice) => slice.value === null);
}

/**
 * First load error across the mounted slices. One banner is enough — they all mean the same thing
 * to the operator (this screen is showing defaults), and one banner per slice would push the tabs
 * off the fold.
 *
 * @complexity Time: O(n) in slice count; space: O(1).
 */
export function firstLoadError(slices: readonly SliceLoadState[]): string | null {
  return slices.find((slice) => slice.loadError !== null)?.loadError ?? null;
}

/** Renders the merged save state as the status pill's text — the branch order (saving, then
 *  saved, then error's own message, then nothing) matches `mergeSaveStates`' own precedence, since
 *  this only ever runs on its output.
 *
 * @complexity Time/space: O(1).
 */
export function describeSaveStatus(save: SaveState): string {
  if (save.status === "saving") return "Saving…";
  if (save.status === "saved") return "Saved";
  if (save.status === "error") return save.message;
  return "";
}

/**
 * Maps the stored `core.appearance.theme` choice to the settings panel's `data-theme` attribute.
 *
 * `"system"` means "match the OS", which the panel already does natively via
 * `@media (prefers-color-scheme)` when no `data-theme` is set at all — so `"system"` maps to
 * `undefined` here rather than a literal string `data-theme` has no value for. See
 * `SettingsUi.tsx`'s own comment at the call site for the fuller history (the reconciled-default
 * fix that made this control real again).
 *
 * @complexity Time/space: O(1).
 */
export function resolveDialogDataTheme(theme: string): string | undefined {
  return theme === "system" ? undefined : theme;
}
