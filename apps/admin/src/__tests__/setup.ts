import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

/**
 * @file Vitest setup — first-ever test harness for `apps/admin` (SPEC-005 REQ-12..17). Registers
 * `@testing-library/jest-dom`'s matchers (`toBeInTheDocument`, `toHaveTextContent`, etc.) globally
 * for every test file, mirroring the standard RTL + Vitest setup convention.
 *
 * `afterEach(cleanup)` is required explicitly because this project's `vitest.config.ts` sets
 * `globals: false` (deliberate — every test file imports `describe`/`it`/`expect` explicitly
 * rather than relying on ambient globals). RTL's own auto-cleanup only self-registers when
 * globals are enabled; without this, a previous test's rendered tree (and its event listeners —
 * e.g. the `popstate`/navigation listeners `lib/router.ts` attaches, and its document-level link
 * interceptor) stays mounted and attached to the shared jsdom `window`, causing cross-test
 * contamination (a stale component instance reacting to a LATER test's history change).
 */
afterEach(() => {
  cleanup();
});

/**
 * `window.matchMedia` — jsdom does not implement it at all (a known jsdom omission, not a Tovu
 * gap): calling it throws `TypeError: window.matchMedia is not a function`. `App.tsx`'s mobile
 * chat-sheet breakpoint (`isSheetMode`, `App.tsx:253-261`, MSG-06) calls it once during render and
 * again in an effect that calls `addEventListener("change", ...)` and removes that same listener on
 * cleanup — so a bare `{ matches: false }` stub is not enough; the effect's cleanup would throw on
 * `removeEventListener` the moment the render-time call stopped throwing. This is shaped like the
 * real `MediaQueryList` interface (plus the deprecated `addListener`/`removeListener` pair some
 * libraries still call) so both call sites work.
 *
 * `matches` defaults to `false` — desktop, non-sheet mode — the state every suite that renders
 * `<App>` today implicitly assumes. This does NOT simulate real breakpoint behavior: nothing here
 * ever fires a `change` event, and changing jsdom's `window.innerWidth` does not recompute
 * `matches` the way a real browser would. A test that needs sheet mode should override this
 * per-test, e.g. `vi.spyOn(window, "matchMedia").mockReturnValue({ ...impl, matches: true })`
 * (and restore it afterward — nothing here does that automatically).
 */
Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated, pre-`addEventListener` MediaQueryList API
    removeListener: vi.fn(), // deprecated, pre-`addEventListener` MediaQueryList API
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// `ResizeObserver` (App.tsx:274) is DELIBERATELY left unstubbed. jsdom does not implement it
// either, and it is the next thing a test that opens chat in sheet mode (`isSheetMode &&
// chatOpen`, gated right above its construction) will hit. Do not add a no-op stub here: App.tsx
// uses it to measure the chat sheet's real rendered height for `avoidBottomPx`'s clearance
// calculation, so a no-op would let a future test assert correct clearance behavior and pass
// without the measurement ever happening — a silently-wrong green, which is worse than the loud
// crash a missing stub produces. Whoever needs this should write a stub that records `observe`
// calls (and lets a test drive a synthetic entry through the callback), not a bare no-op.
