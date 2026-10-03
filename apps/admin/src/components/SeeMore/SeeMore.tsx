import "../../styles/see-more.css";
import { resolveSeeMoreView as resolvePackageView, type SeeMoreView } from "@jini-ai/ui/admin-widgets";

// Clamp rationale: Jini packages/ui/src/features/admin-widgets/components/SeeMore/SeeMore.tsx.
// FormEditor's allowlist hint occupied 98px of a 389px dialog; reuse the clamp for long hints
// while leaving all explanatory text available to browser find and assistive technology.
export { SeeMore } from "@jini-ai/ui/admin-widgets";
export type { SeeMoreProps, SeeMoreView } from "@jini-ai/ui/admin-widgets";

/** Split required state and optional presentation values for the package helper.
 *
 * Pre-extraction host rationale (historical names below describe the original layout).
 * The shared implementation and its active lifecycle constraints now live in Jini; Tovu keeps
 * this provenance so the adapter does not erase policy, bug history or the reasons for thresholds.
 *
 * @file `SeeMore` — clamps its children to the first N rendered lines and offers a "See more" /
 * "See less" toggle. Built as a reusable component rather than a one-off truncation in its first
 * caller (`FormEditor.tsx`'s field-attributes modal, whose allowlist explainer wrapped to 5 lines
 * — 98px of a 389px dialog, measured, not eyeballed — and dominated the two inputs it describes),
 * because the admin has other long `.field-hint` copy with the same problem.
 *
 * **Clamping, not conditional rendering.** The hidden text stays in the DOM at all times — that is
 * the entire reason to clamp rather than slice the string. Collapsed text remains findable by the
 * browser's own in-page search and readable by a screen reader that walks the region directly,
 * neither of which is true of text React never rendered. Do not "optimize" this into a substring.
 *
 * Colocated + self-imports its own stylesheet, the precedent `Select.tsx` → `styles/select.css` and
 * `AssistantDock.tsx` → `styles/assistant.css` establish, rather than a line in `main.tsx` —
 * component and styles are meant to move into `@jini-ai/admin` together. See `styles/see-more.css`'s
 * own header for why every rule there is written at two-class specificity rather than trusting
 * stylesheet order; that is a hard requirement for surviving that move, not a style preference.
 *
 * State and DOM measurement — the collapse/expand flag, the `scrollHeight`/`clientHeight` overflow
 * check, and the `ResizeObserver` — live in `SeeMore.hooks.tsx`, split out the same way
 * `ConfirmDialog`/`ConfirmDialog.hooks.tsx` does in `@jini-ai/admin`. This file stays props-and-JSX
 * only; the `useClamp` prop below lets a test render this JSX against a fake measurement hook, with
 * no real layout engine and no real `ResizeObserver` involved at all.
 *
 *  Lines to show while collapsed. Any integer ≥ 1; values below 1 are raised to 1.
 *
 *  Applied to the wrapper, alongside `see-more`.
 *
 * Applied to the clamped region, alongside `see-more-text`. This is where a caller keeps its own
 * typography — `see-more.css` deliberately sets no color/size/line-height, only clamp mechanics,
 * so a caller class here wins on every property that isn't the clamp itself.
 *
 *  Applied to the toggle button, alongside `see-more-toggle`.
 *
 * Accessible name for the toggle, when the visible "See more" would be ambiguous — e.g. several
 * of these on one screen, which a screen reader's button list renders as N identical entries.
 * `aria-expanded` + `aria-controls` are always set regardless.
 *
 *  Injectable seam for the collapse/expand + overflow-measurement hook. Defaults to the real
 *  {@link useSeeMoreClamp}; a test can pass a fake here to exercise `SeeMore`'s rendering without
 *  a real `scrollHeight`/`clientHeight` layout or a real `ResizeObserver`.
 *
 *  Publishes the "See more"/"See less" toggle as agent-addressable via `agentHandle()`
 *  (`@jini-ai/agentic`). Only meaningful when the content actually overflows and the toggle
 *  renders at all — omit to leave it untagged, and every existing render stays byte-identical.
 *
 * Derives every className/label `SeeMore`'s JSX reads from its own props plus the hook's live
 * `expanded` flag — the four ternaries (wrapper class, text class, toggle class, toggle label) and
 * the `moreLabel`/`lessLabel` defaults that used to sit directly in the component body, pulled out
 * as a top-level pure function per this pass's extraction rule (§2 of the complexity-ceiling brief).
 * Nothing here touches state or refs, so it needs no access to the component's own scope — a plain
 * function of its inputs, independently testable without rendering anything.
 *
 * The line count rides a custom property rather than a class-per-N (`.see-more-text--3`),
 * so `lines` can be any integer a caller needs without this file growing a rule for each.
 */
export function resolveSeeMoreView({ expanded, ...options }: {
  expanded: boolean;
  moreLabel?: string;
  lessLabel?: string;
  className?: string;
  textClassName?: string;
  toggleClassName?: string;
}): SeeMoreView {
  return resolvePackageView({ expanded }, options);
}
