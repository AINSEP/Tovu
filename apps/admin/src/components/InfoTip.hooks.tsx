/**
 * Pre-extraction host rationale (historical names below describe the original layout).
 * The shared implementation and its active lifecycle constraints now live in Jini; Tovu keeps
 * this provenance so the adapter does not erase policy, bug history or the reasons for thresholds.
 *
 * @file `InfoTip`'s open/close state, placement, and portal coordinates — split out of the
 * component so it can be swapped for a fake via the `useTip` prop on `InfoTipProps`, the same
 * `<Name>.tsx`/`<Name>.hooks.tsx` split `ConfirmDialog`/`ConfirmDialog.hooks.tsx` uses in
 * `@jini-ai/admin`. No `-port.hooks.ts`/`-dependencies.hooks.ts` pair: the only outside dependency
 * is `getBoundingClientRect`, a synchronous DOM read with nothing to fail or fake a rejection for,
 * the same reasoning `ChatFab.hooks.tsx`'s `useFabPosition` gives for skipping a port.
 *
 *  A floor on how much room has to exist above the icon before "opens above" (the preference) is
 *  honored — see the component's own former header for the full account of why this exists and
 *  how `176` was chosen.
 *
 *  Half of `.info-tip-bubble`'s own `max-width: 18rem` (`styles.css`) at the default 16px root font
 *  size. Used only as a WORST-CASE half-width for keeping the bubble on-screen — a caller whose
 *  copy renders narrower than the max-width simply gets extra margin to spare, never clipping
 *  either.
 *
 *  Found missing 2026-09-24: `Users.tsx`'s new reset-password info tip sits right after the page
 *  title, close to the left edge on a narrow viewport (900px screenshot check). `show()` used to
 *  center the bubble purely on the icon's own midpoint with no regard for the viewport at all, so
 *  roughly half the bubble rendered off-screen to the left there — the same defect any caller near
 *  EITHER edge would hit, not something specific to that one call site, hence fixed here rather
 *  than worked around locally.
 *
 *  Minimum breathing room between the bubble's outer edge and the viewport edge once clamped.
 *
 *  Keeps `idealLeft` (the icon's own horizontal midpoint) from placing the bubble's worst-case
 *  width past either viewport edge. Falls back to viewport-center on a viewport narrower than the
 *  bubble plus both margins (`2 * (HALF_MAX_BUBBLE_WIDTH_PX + EDGE_MARGIN_PX)` = 304px) — below that
 *  width `minLeft` would exceed `maxLeft` and a plain clamp would invert; not a width this app
 *  targets, but this keeps the math from producing a nonsensical negative-range result there.
 *
 *  Escape-to-dismiss without moving focus off the icon — see the component's own doc for why
 *  this can't just be `onBlur`.
 *
 * Owns `InfoTip`'s open/close state and the measured placement/coordinates its portal renders at.
 *
 * @returns `open`/`placement`/`coords` for the portal, `iconRef` to attach to the trigger, and the
 *   `show`/`hide`/`handleIconKeyDown` event handlers.
 * @complexity Time/space: O(1) — one `getBoundingClientRect` read per `show()`.
 */
// Placement limits/measurement rationale: Jini/packages/ui/src/features/admin-widgets/components/InfoTip.hooks.tsx.
export { useInfoTip } from "@jini-ai/ui/admin-widgets";
export type { InfoTipController } from "@jini-ai/ui/admin-widgets";
