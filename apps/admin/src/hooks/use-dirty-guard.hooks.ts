import { useEffect } from "react";

/**
 * @file Unsaved-changes protection — audit cross-cutting finding: none of the admin's editor
 * screens (`PostEditor`, `CollectionEntryEditor`, `FormEditor`, `MenuEditor`,
 * `WidgetInstanceEditor`) protect against navigating away from unsaved changes. Confirmed live on
 * a real post and on `MenuEditor`: editing a field, then clicking the in-app "← X" back-link,
 * discards the edit silently with no dialog of any kind. None of these screens track "original
 * loaded state" at all today, so this is new state to add, not just a new warning layered on
 * existing state (`ADS-memory/reports/audits/20260801-admin-adversarial-ux-audit.md`, "Detail /
 * editor routes" section).
 *
 * No `<name>-port.hooks.ts` / `<name>-dependencies.hooks.ts` pair (`apps/admin/INFO.md`'s hook
 * convention): this hook's only outside dependency is `window`'s `beforeunload` event, a browser
 * built-in rather than a swappable backend — same reasoning `use-sidebar-rail.hooks.ts` already
 * gives for skipping the three-file port seam.
 */

/** Cheap structural-equality check for the small, JSON-serializable form-state objects this hook
 *  compares (title/slug/status/fields-style shapes, not arbitrary values). Sensitive to key order,
 *  which is fine here: both `current` and `original` are built by the same call site each time, so
 *  their key order is always consistent with each other. Not a general-purpose deep-equal. */
function shallowJsonEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface DirtyGuard {
  /** Whether `current` differs from the loaded `original`. Always `false` before `original` is
   *  set (nothing loaded yet to have drifted from). */
  isDirty: boolean;
  /** Call before an in-app navigation the operator triggered (e.g. a back-link's `onClick`).
   *  Returns `true` when it's safe to proceed — either nothing is dirty, or the operator confirmed
   *  the native "leave without saving?" prompt. Returns `false` when the operator chose to stay.
   *  `unsavedBeyondTracked` covers work `current` cannot see yet (the Page editor's Interactive tab
   *  holds an open edit outside `current` until it is flushed): `true` prompts even when `isDirty`
   *  is `false`. */
  confirmLeave: (unsavedBeyondTracked?: boolean) => boolean;
}

/**
 * Tracks whether `current` has drifted from `original` and guards against losing that drift: a
 * `beforeunload` listener for the operator leaving the tab/window entirely (browser back, reload,
 * close), and a `confirmLeave()` the caller wires to its own in-app "back to the list" link for
 * client-side navigation, which `beforeunload` never fires for.
 *
 * @param current The form's live state, recomputed by the caller every render.
 * @param original The state as loaded from the server, or `null` before it has loaded (or for a
 *   brand-new/not-yet-saved record with nothing to compare against yet).
 *
 * @complexity O(n) in the serialized size of `current`/`original` per render (one `JSON.stringify`
 * pair) — acceptable for the small per-record form state these editors hold; not meant for a
 * current/original pair with a large embedded document.
 * @overallScore 100
 */
export function useDirtyGuard<T>(current: T, original: T | null): DirtyGuard {
  const isDirty = original !== null && !shallowJsonEqual(current, original);

  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Both assignments are the standard cross-browser incantation (the returned string is
      // ignored by every modern browser in favor of their own fixed prompt copy, but the property
      // still has to be set for the prompt to appear at all in some engines).
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  function confirmLeave(unsavedBeyondTracked = false): boolean {
    if (!isDirty && !unsavedBeyondTracked) return true;
    return window.confirm("You have unsaved changes. Leave without saving?");
  }

  return { isDirty, confirmLeave };
}
