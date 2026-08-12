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
 *
 * `mergeSourceUpdate` below serves a different hook in this same feature
 * (`hooks/use-external-mcp.hooks.ts`'s `updateSource`) — landed here rather than a second file
 * because it is the same "pure decision, no React, directly testable" shape as everything else in
 * this module, just for a different screen within `settings`.
 */

/** The subset of `SourceConfigItem`'s shape {@link mergeSourceUpdate} actually reads — kept
 *  narrow and local rather than importing `@jini-ai/ui`'s full `SourceConfigItem` type here, so
 *  this module stays free of that package's own type surface. */
interface PreviousSourceFields {
  fields?: Record<string, string>;
  enabled?: boolean;
  label?: string;
}

/** Mirrors the shape `use-external-mcp.hooks.ts`'s local `SourceUpdateInput` type describes (a
 *  partial patch: `fields`/`enabled`/`label`, each optional). */
interface SourceUpdatePatch {
  fields?: Record<string, string>;
  enabled?: boolean;
  label?: string;
}

/** What `updateSource` sends to `toWriteBody` — the merged result of a partial patch over the
 *  last-known values for a source that a write route replaces wholesale (see
 *  `use-external-mcp.hooks.ts`'s own comment on `lastKnown` for why the merge is needed at all:
 *  the route replaces the whole row, so an unmerged patch would blank out every field it doesn't
 *  mention). */
export interface MergedSourceUpdate {
  fields: Record<string, string>;
  enabled: boolean;
  label: string | undefined;
}

/**
 * `updateSource`'s own decision, pulled out to a top-level pure function per the 2026-08-12
 * complexity-ceiling pass: every `?.`/`??` in the three merged fields below is its own branch under
 * ESLint's `complexity` rule, and moving them out of `updateSource`'s own scope is what actually
 * lowers that function's score (unlike a switch, where moving CASE BODIES out doesn't reduce the
 * case count — this is a flat expression, so extracting the whole computation removes the branches
 * entirely from the caller). Also now directly testable with plain object literals, no port, no
 * `useRef`, no `await`.
 *
 * @complexity Time/space: O(k) in the patch's own field count — one shallow merge, no iteration.
 */
export function mergeSourceUpdate(previous: PreviousSourceFields | undefined, patch: SourceUpdatePatch): MergedSourceUpdate {
  return {
    fields: { ...(previous?.fields ?? {}), ...(patch.fields ?? {}) },
    enabled: patch.enabled ?? previous?.enabled ?? true,
    label: patch.label ?? previous?.label,
  };
}

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
