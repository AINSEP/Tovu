import { agentHandle } from "@jini-ai/agentic";
import type { TabBarTab } from "./TabBar";

/**
 * @file `TabBar.tsx`'s own derived-props logic, split out per the `<Name>.tsx`/`<Name>.hooks.tsx`
 * pattern (admin TSX-logic-sweep, 2026-09-05) — this repo's rule that a `.tsx` file carries no
 * functions or derived logic of its own. `tabDotAccessibleSuffix` stayed behind in `TabBar.tsx`:
 * it returns JSX, so it is a render helper (the same kind of thing `TabBarButton` already is in
 * that file), not derived data — only `tabHandleProps` below, which returns a plain props object
 * with no rendering of its own, is the kind of logic this split targets.
 */

/** The `TabBarButton` component's own `agentHandle()` spread, as a plain function rather than an
 *  inline ternary in its JSX — one more small piece pulled out of `TabBar.tsx` for the same
 *  complexity-gate reason that component's own doc comment gives. */
export function tabHandleProps(tab: TabBarTab) {
  return tab.handle ? agentHandle(tab.handle, { role: "button", label: tab.handleLabel ?? tab.label }) : {};
}
