import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
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
 * e.g. `App.tsx`'s `window.addEventListener("hashchange", ...)`) stays mounted and attached to the
 * shared jsdom `window`, causing cross-test contamination (a stale component instance reacting to
 * a LATER test's `window.location.hash` change).
 */
afterEach(() => {
  cleanup();
});
