import { useRef } from "react";

/**
 * @file `useSettlementGeneration` — the "ignore a settled async result once a newer call has
 * superseded it" guard that showed up, hand-rolled as its own `useRef(0)`, at eight call sites
 * across `apps/admin` (2026-09-06 sweep): `use-page-editor.hooks.ts`'s `save`, `use-post-
 * editor.hooks.ts`'s `runSave`, `use-access-tokens.hooks.ts`'s `reloadAllStores`, `use-sites
 * .hooks.ts`'s `activate`, `use-theme-explore.hooks.ts`'s `performRename`, and `use-themes
 * .hooks.ts`'s `activate`/`download`, plus `use-widgets-library.hooks.ts`'s `purge`. Each one
 * mints a monotonic id synchronously at the top of its own async call (`const generation =
 * ++someRef.current`), then, after every `await`, skips a state write if a NEWER call has since
 * minted a higher id — a stale response must not overwrite whatever the latest call already
 * produced, regardless of settlement order.
 *
 * A `useRef`, not `useState`: two calls issued in the same synchronous tick (a double-click, or
 * a caller reaching the action directly) must each observe the increment the other one just
 * made, which only a synchronous ref read/write guarantees — a `useState` counter would have
 * both calls read the same pre-commit value. See `use-static-publish.hooks.ts`'s `publishingRef`
 * doc for the same reasoning applied to a boolean in-flight lock instead of a generation counter.
 *
 * **What this does NOT cover.** Three more `*GenerationRef` guards in this codebase were left as
 * hand-rolled refs on purpose, because they don't fit this "mint my own id, check it after my own
 * await" shape:
 * - `use-static-publish.hooks.ts`'s `previewGenerationRef` is bumped by `invalidatePreview`
 *   (every FIELD EDIT), not by `checkPreview` itself — it's a version stamp on the form fields,
 *   read by a call that never mints its own generation. Wrapping it here would misstate what it
 *   actually tracks.
 * - `use-roles.hooks.ts`'s `permissionsGenerationRef` is minted by `loadPermissions` but also
 *   read (without minting) by `onWritePermission`, a second function checking "did the operator
 *   switch panels while my write was in flight" against an ambient counter it doesn't own.
 * - `use-users.hooks.ts`'s `toggleGenerationRef` is bumped by `toggleExpanded` (an unrelated,
 *   synchronous UI action) and threaded as a plain number into `runGrantMutation`, a top-level
 *   function outside the hook's closure, shared by two different mutations.
 *
 * All three cross a single counter between two different functions with two different roles
 * (one mints, the other only peeks) — this hook's two-method API has no "peek without minting"
 * escape hatch, and adding one just to cover three call sites that already work would trade their
 * current, accurately-commented shape for a generic one that fits worse.
 *
 * @example
 * const settlement = useSettlementGeneration();
 * async function save() {
 *   const generation = settlement.next();
 *   setSaving(true);
 *   try {
 *     const result = await port.save(...);
 *     if (!settlement.isCurrent(generation)) return; // a newer save/publish already won
 *     setSaved(result);
 *   } catch (e) {
 *     if (!settlement.isCurrent(generation)) return;
 *     setError(describeApiError(e));
 *   } finally {
 *     if (settlement.isCurrent(generation)) setSaving(false);
 *   }
 * }
 */

export interface SettlementGeneration {
  /** Mint a new generation for a call that is about to start, superseding every generation
   *  minted before it. Call this synchronously, before the first `await`, so two calls issued in
   *  the same tick each observe the other's claim. */
  next: () => number;
  /** True when `generation` (a value previously returned by {@link next}) is still the most
   *  recently minted one — i.e. no later call has started since. Check this after every `await`
   *  before writing state the call doesn't exclusively own. */
  isCurrent: (generation: number) => boolean;
}

export function useSettlementGeneration(): SettlementGeneration {
  const ref = useRef(0);
  return {
    next: () => (ref.current += 1),
    isCurrent: (generation: number) => ref.current === generation,
  };
}
