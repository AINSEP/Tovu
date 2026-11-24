import html2canvas from "html2canvas-pro";
import type { CapturedCanvas } from "@jini-ai/admin/shell/lib/agent-screenshot";

/**
 * The real capture adapter — `html2canvas-pro` adds ~230KB to the admin load; it was previously
 * deferred until this capability was invoked. Not exercised by this module's
 * own unit tests (see `@jini-ai/admin/shell/lib/agent-screenshot`'s module doc): jsdom does not lay out or paint, so a test importing
 * the real library here would assert nothing about real rendering while paying real cost to run it.
 * Real verification is manual/browser (see the handoff's Self-Validation section) — which is what
 * caught the plain-`html2canvas` `oklch()` failure that module doc's "why the -pro fork" note
 * records; a jsdom-based unit test would never have exercised real color parsing and would have
 * shipped that failure silently.
 *
 * Clipped to the CURRENT viewport (`window.innerWidth/innerHeight` at the current scroll offset)
 * rather than `element`'s full scrollable height: a "does this look cramped/clipped" question is
 * almost always about what the operator can see RIGHT NOW at their current window size, and a
 * full-scrollable-height capture would both miss viewport-relative clipping bugs and produce a much
 * larger image for no benefit to that question. `scale: 1` deliberately ignores `devicePixelRatio`
 * (which a `scale` left at its default would otherwise multiply into) — a retina display would triple
 * the pixel count, and therefore the encoded size, for no fidelity the JPEG encode step would
 * preserve anyway at the quality levels that module's `JPEG_QUALITIES` uses. `useCORS: true` is best-effort
 * only: an image whose host does not opt in still taints the canvas and renders blank — see this
 * module's (`@jini-ai/admin/shell/lib/agent-screenshot`) "what this capture cannot see" section.
 *
 * @complexity Not this module's to bound — the library's own DOM-clone-and-paint cost, proportional
 * to the viewport's rendered subtree size.
 */
export async function renderAdminScreenshotCanvas(element: HTMLElement): Promise<CapturedCanvas> {
  return html2canvas(element, {
    scale: 1,
    useCORS: true,
    x: window.scrollX,
    y: window.scrollY,
    width: window.innerWidth,
    height: window.innerHeight,
    windowWidth: document.documentElement.clientWidth,
    windowHeight: document.documentElement.clientHeight,
  });
}
