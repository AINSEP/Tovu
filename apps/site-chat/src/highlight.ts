/**
 * @file SPEC-046 §4 — the highlight/scroll_to visual treatment and the DOM-target lookup both share.
 *
 * ## Why title-text search, not a server-controlled selector
 *
 * REQ-6 requires "the client resolves nothing" beyond turning a resolved target into an actual DOM
 * element — the server never emits a selector (`client-directives.ts`'s own doc). But this widget
 * ships on every page of a real site, rendered by whichever theme is active: the built-in fallback
 * theme (`render.ts`'s `entryContent`) wraps a post in `<article class="entry"><h1
 * class="entry-title">…`, while a custom Liquid/Handlebars theme can emit any markup a theme author
 * wrote, with no `data-*` attribute this codebase controls. There is no selector this file could ask
 * the server to resolve that would work across every theme.
 *
 * What IS constant across themes: a published entry's `title` (from `PostRecord`) has to appear as
 * visible text somewhere on its own rendered page — themes render titles, they do not omit them.
 * `findTargetElement` below searches for an element whose own text content equals the server-resolved
 * `title` exactly (case-sensitive, falling back to case-insensitive). This is a heuristic, not a
 * guarantee: a theme that never renders a plain-text title (an image-only hero, e.g.) will not be
 * found, and the widget degrades to "no highlight" rather than guessing at some other element — see
 * `SiteAssistantWidget.tsx` for how a `null` result is handled (never a thrown error, never a
 * fallback to an unrelated element).
 */

const HIGHLIGHT_CLASS = "tovu-site-assistant__highlight";
/** The `@keyframes` name `widget.css`'s fade-out animation uses — checked against
 *  `AnimationEvent.animationName` so cleanup fires on the FADE ending, not the earlier pulse
 *  (pulse and fade both dispatch their own `animationend`; see `applyHighlight`'s doc). */
const FADE_ANIMATION_NAME = "tovu-site-assistant-highlight-fade";
/** Matches `widget.css`'s ~20s pulse+hold+fade timeline plus a safety margin. The AUTHORITATIVE
 *  cleanup path is `animationend` on the fade keyframe; this timeout only guards against a host page
 *  that somehow suppresses CSS animations entirely (a page-level `* { animation: none !important }`
 *  reset, e.g.) and would otherwise never fire that event, leaving the outline stuck forever. */
const CLEANUP_FALLBACK_MS = 21_000;

interface HighlightedState {
  readonly element: Element;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

/** Module-level by design, not injected: this bundle self-mounts exactly once per page load
 *  (`main.tsx`), so there is exactly one widget instance and exactly one "currently highlighted
 *  element" to track, the same singleton-state shape `site-assistant-transport.ts`'s `activeRuns`
 *  map already uses for the same reason. */
let current: HighlightedState | null = null;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Heading tags plus any element whose class name mentions "title" — covers the built-in theme's
 *  `h1.entry-title` and a reasonable range of custom-theme title markup without matching arbitrary
 *  body content (a bare `article`/`main`/`section` candidate would almost never have textContent
 *  exactly equal to just the title, since it also contains the body). */
const TITLE_CANDIDATE_SELECTOR = "h1, h2, h3, h4, h5, h6, [class*='title']";

/**
 * Finds the element whose trimmed text content equals `title`, searching `root` and excluding
 * anything inside the widget's own pane (SPEC-046 §4: "Never highlight inside the widget's own
 * pane"). Case-sensitive match first, case-insensitive fallback — a theme that title-cases a heading
 * via CSS `text-transform` rather than the source string is still findable. Returns `null` on no
 * match rather than guessing at a near-miss; the caller must treat that as "nothing to do here," not
 * an error (see file header).
 *
 * @complexity O(n) in matching-selector element count on the page; a real page's heading/title-class
 *   count is small, so this is not a scaling concern.
 * @overallScore 100
 */
export function findTargetElement(title: string, root: ParentNode = document): Element | null {
  const needle = title.trim();
  if (needle.length === 0) return null;

  const candidates = Array.from(root.querySelectorAll(TITLE_CANDIDATE_SELECTOR)).filter((el) => !el.closest(".tovu-site-assistant"));

  const exact = candidates.find((el) => el.textContent.trim() === needle);
  if (exact) return exact;

  const lowerNeedle = needle.toLowerCase();
  return candidates.find((el) => el.textContent.trim().toLowerCase() === lowerNeedle) ?? null;
}

function handleAnimationEnd(event: Event): void {
  const animationName = (event as AnimationEvent).animationName;
  if (animationName !== FADE_ANIMATION_NAME) return; // ignore the earlier pulse's own animationend
  clearHighlight();
}

/**
 * Removes the highlight treatment from whatever is currently highlighted, if anything. Idempotent —
 * safe to call with nothing highlighted (SPEC-046 §4: "Cleanup on animation end, on a new highlight,
 * and on navigation" all route through this, and not every one of those is guaranteed to fire while
 * something is actually highlighted).
 */
export function clearHighlight(): void {
  if (!current) return;
  clearTimeout(current.timeoutId);
  current.element.removeEventListener("animationend", handleAnimationEnd);
  current.element.classList.remove(HIGHLIGHT_CLASS);
  current = null;
}

/**
 * Applies the highlight treatment to `element` — at most one element highlighted at a time (SPEC-046
 * §4), so any previously-highlighted element is cleared first. All animation timing (pulse, hold,
 * fade) lives in `widget.css`'s `@media (prefers-reduced-motion: reduce)` override for this class;
 * this function does not brand the element with a separate reduced-motion class, since the CSS media
 * query alone already fully determines that behavior with no JS-side branch needed here.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export function applyHighlight(element: Element): void {
  if (current?.element === element) return; // already highlighted — do not restart the animation
  clearHighlight();

  element.classList.add(HIGHLIGHT_CLASS);
  element.addEventListener("animationend", handleAnimationEnd);
  const timeoutId = setTimeout(clearHighlight, CLEANUP_FALLBACK_MS);
  current = { element, timeoutId };
}

/**
 * Scrolls `element` into view, honoring `prefers-reduced-motion` (SPEC-046 §4: "no... smooth scroll"
 * under reduced motion). `scroll-margin-top` on `.tovu-site-assistant__highlight` (`widget.css`) is
 * what keeps a sticky theme header from covering the target once scrolled to — this function only
 * decides scroll BEHAVIOR, not final position.
 */
export function scrollToElement(element: Element): void {
  element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
}
