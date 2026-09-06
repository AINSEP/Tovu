/**
 * @file The `?tab=` guard shared by every "URL-as-source-of-truth" tabbed admin screen
 * (ADR-063's first idiom: `Database.tsx`, `Security.tsx`, `SourceControl.tsx`, `Deployment.tsx`,
 * `Themes.tsx`) — extracted from five near-identical per-screen `resolveActiveTabId` functions
 * that all did the same thing: don't trust a raw query value, fall back to a known-good default
 * for anything absent or unrecognized, so a stale link or a typo opens on a sensible tab instead
 * of a blank panel.
 *
 * This does NOT touch ADR-063's own open item — whether `?tab=` id lists should become a real
 * `AdminPanel.tabs` manifest field for agent enumerability (`buildAgentPageMap` etc.). That is a
 * data-modeling question about a structural route manifest, deferred in the ADR behind a
 * `page.navigate` param-support trigger that hasn't fired. This file only removes the duplicated
 * *validation* logic; each screen still owns its own tab-id list and still decides its own
 * default, exactly as before.
 *
 * `Pages.tsx` is NOT one of the five — per ADR-063 it deliberately uses the other idiom
 * (local-state-mirrors-URL, `pages-tab-url.hooks.ts`'s `resolvePagesTabFromUrl`/
 * `writePagesTabToUrl`), for a documented reason (avoiding a real navigation over data it already
 * eagerly fetches). It was never one of these five duplicates and stays untouched here.
 */

/**
 * Falls back to `defaultId` for an absent or unrecognized `tabId` — the raw `?tab=` query value
 * is caller-controlled (a stale bookmark, a typo, an old link), so it is checked against
 * `validIds` rather than trusted directly.
 *
 * `defaultId` is a parameter rather than baked in because one of the five original call sites
 * (`Themes.tsx`) computes its default dynamically (`defaultThemeTabGroup(settings, themeTiers)`)
 * instead of using a fixed constant — passing the already-computed default in here keeps this
 * function itself trivial and stateless rather than growing a settings/themeTiers-shaped
 * parameter only one caller needs.
 *
 * `defaultId` is caller-supplied too, and gets the same "don't trust it blindly" treatment as
 * `tabId` (2026-09-05 Gemini audit finding 17): the four fixed-constant callers get an invalid
 * default caught at compile time (`T` infers from their literal `as const` tuple), but
 * `Themes.tsx`'s dynamically-computed default widens `validIds` to plain `readonly string[]`,
 * where `T` infers as `string` and a `defaultThemeTabGroup`/`THEME_TAB_GROUPS` drift would
 * type-check cleanly while returning an id nothing in `validIds` recognizes. Falling back to
 * `validIds[0]` when `defaultId` itself is invalid keeps this function's contract absolute —
 * its return value is always a member of `validIds` — rather than resting on every caller getting
 * its own default right.
 *
 * @complexity O(n) in `validIds.length` (`Array.includes`) — every existing caller's list is a
 * small fixed-size constant, not caller-controlled in size.
 */
export function resolveActiveTabId<T extends string>(
  tabId: string | null | undefined,
  validIds: readonly T[],
  defaultId: T,
): T {
  const ids = validIds as readonly string[];
  const safeDefault = ids.includes(defaultId) ? defaultId : validIds[0];
  return tabId && ids.includes(tabId) ? (tabId as T) : safeDefault;
}
