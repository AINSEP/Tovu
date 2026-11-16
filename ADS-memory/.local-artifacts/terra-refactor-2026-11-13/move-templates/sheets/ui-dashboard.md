id: UI-dashboard-1   (template T-UI; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton: ui-hooks.gen.md)
feature: admin/features/dashboard (path apps/admin/src/features/dashboard/hooks)
kind_check: UI confirmed (React hook; survey label MOVE, note "a `usePersistedBoolean(key)` hook. Host passes the key."). Target `@jini-ai/ui` (direct: no kit needed, the hook renders nothing). Generic name chosen: `usePersistedDisclosure` (it returns `open/toggle/panelId`, not just a boolean; `panelId` is part of the disclosure contract). Tovu keeps the key and a one-line binding `useRecentActivityDisclosure()` (a binding with a host value, not a forwarder), so `Dashboard.tsx` and the Tovu test stay untouched.
untangle_overlap: YES (Jini side only) -> EXECUTE AFTER WAVE B MERGE. C1-plus.repoint.tsv:15 and C9-ui.repoint.tsv:5 edit `packages/ui/src/index.ts`; that file is guarded by TEXT (the anchor line below occurs once). C2.repoint.tsv:160 edits `apps/admin/src/features/dashboard/Dashboard.tsx`, which this sheet does NOT touch.
blocked: no
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base

tovu_files:
  - apps/admin/src/features/dashboard/hooks/use-recent-activity-disclosure.hooks.ts | blob 65fc82ff8ab1797b9cd0deea2b90caf7ed013017 | keep-reduced (key + binding)
jini_target: ui (root barrel `.`, runtime browser) NEW packages/ui/src/react/hooks/usePersistedDisclosure.ts + NEW packages/ui/src/react/hooks/__tests__/usePersistedDisclosure.test.ts
kit_injection: -
components:
  - useRecentActivityDisclosure() -> usePersistedDisclosure({ storageKey }, _optional = {}) | Tovu passes storageKey RECENT_ACTIVITY_OPEN_KEY ("tovu.admin.dashboard.recent-activity.open")
  - RecentActivityDisclosure (interface) -> PersistedDisclosure (same 3 fields, same doc on panelId)
jini_guards:
  - packages/ui/src/react/hooks/usePersistedDisclosure.ts must not exist
  - packages/ui/src/react/hooks/__tests__/usePersistedDisclosure.test.ts must not exist
  - rg -n "usePersistedDisclosure|PersistedDisclosure" packages/ui/src -> prints nothing
  - packages/ui/src/index.ts: TEXT guard, the line "export * from './react/hooks/useEdgeAutoScroll.js';" occurs exactly once
jini_code: |
  NEW packages/ui/src/react/hooks/usePersistedDisclosure.ts (exact text, ending with one newline):
  ----8<----
// Open/closed state of a collapsible panel, persisted per browser in localStorage under a
// host-supplied key. Every read and write is best-effort: localStorage throws outright in some
// privacy modes, and a failed read falls back to collapsed (the default), so the worst case is the
// panel starting closed again. Not tied to any one feature domain — feature-local hooks live
// inside their own `features/<domain>/react/hooks/` instead.
import { useCallback, useId, useState } from 'react';

/** @complexity Time/space: O(1). */
function readOpen({ storageKey }: { storageKey: string }): boolean {
  try {
    return localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}

/** @complexity Time/space: O(1). */
function writeOpen({ storageKey, open }: { storageKey: string; open: boolean }): void {
  try {
    localStorage.setItem(storageKey, open ? '1' : '0');
  } catch {
    // best-effort; see this file's header.
  }
}

export interface PersistedDisclosure {
  open: boolean;
  toggle: () => void;
  /** DOM id for the collapsible body, so the header button can point `aria-controls` at it. */
  panelId: string;
}

/**
 * Stores `"1"` under `storageKey` while open; any other value, or none, means collapsed.
 * @example
 * const { open, toggle, panelId } = usePersistedDisclosure({ storageKey: 'app.panel.open' });
 */
export function usePersistedDisclosure(
  { storageKey }: { storageKey: string },
  _optional: Record<string, never> = {},
): PersistedDisclosure {
  const [open, setOpen] = useState(() => readOpen({ storageKey }));
  const panelId = useId();
  const toggle = useCallback(() => {
    setOpen((previous) => {
      writeOpen({ storageKey, open: !previous });
      return !previous;
    });
  }, [storageKey]);
  return { open, toggle, panelId };
}
  ----8<----
  Behaviour vs the Tovu body (lines 13-55): identical except the key is the `storageKey` argument instead of the module constant (read once on mount, written on every toggle). No `console`, no `process.env`, no other `@jini-ai/*` import (COMMON rules 5-8).
jini_index: packages/ui/src/index.ts: after "export * from './react/hooks/useEdgeAutoScroll.js';" insert "export * from './react/hooks/usePersistedDisclosure.js';"
class_renames: - (the hook renders no JSX)
agent_handles: - (none emitted)
i18n: - (no strings)
jini_tests: |
  NEW packages/ui/src/react/hooks/__tests__/usePersistedDisclosure.test.ts = the Tovu test apps/admin/src/features/dashboard/__tests__/use-recent-activity-disclosure.unit.test.ts (blob f85cc33e30fc460112ed08c160b0cc28b2291a77) with ONLY these edits:
    - prepend line 1 "// @vitest-environment jsdom" (the ui package's hook tests declare it; see useDebouncedValue.test.ts:1)
    - "import { RECENT_ACTIVITY_OPEN_KEY, useRecentActivityDisclosure } from \"../hooks/use-recent-activity-disclosure.hooks\";" -> "import { usePersistedDisclosure } from '../usePersistedDisclosure.js';" followed by a blank line and "const RECENT_ACTIVITY_OPEN_KEY = 'jini.test.disclosure.open';"
    - "useRecentActivityDisclosure()" (4 occurrences, inside renderHook callbacks) -> "usePersistedDisclosure({ storageKey: RECENT_ACTIVITY_OPEN_KEY })"
    - "describe(\"useRecentActivityDisclosure\", () => {" -> "describe(\"usePersistedDisclosure\", () => {"
    - the @file comment "The \"Recently updated\" accordion's open state:" -> "A persisted disclosure's open state:"
    Every `expect(...)` line stays byte-identical (8 expects). The Tovu test file itself stays in Tovu unchanged (it now exercises the binding with Tovu's real key).
tovu_reduced: |
  The WHOLE new apps/admin/src/features/dashboard/hooks/use-recent-activity-disclosure.hooks.ts (exact text, ending with one newline):
  ----8<----
import { usePersistedDisclosure, type PersistedDisclosure } from "@jini-ai/ui";

/**
 * @file Open/closed state of the Dashboard's "Recently updated" card (owner 2026-10-13: the
 * dashboard read as "a bit too busy", so the card collapses to its header by default).
 *
 * Persisted per browser in `localStorage`, namespaced under `tovu.admin.` like the default-password
 * banner's dismiss key in `use-dashboard.hooks.ts`. The best-effort storage handling (a failed read
 * falls back to collapsed) lives in `@jini-ai/ui` `usePersistedDisclosure`; Tovu supplies the key.
 */

/** Stores `"1"` while the card is open; any other value, or none, means collapsed. */
export const RECENT_ACTIVITY_OPEN_KEY = "tovu.admin.dashboard.recent-activity.open";

/**
 * @example
 * const { open, toggle, panelId } = useRecentActivityDisclosure();
 */
export function useRecentActivityDisclosure(): PersistedDisclosure {
  return usePersistedDisclosure({ storageKey: RECENT_ACTIVITY_OPEN_KEY });
}
  ----8<----
  (`RecentActivityDisclosure` is dropped: `rg -n "RecentActivityDisclosure\b" apps/admin/src` today prints only its declaration line 34 and the return type on line 45 of this file; re-check, any other hit = SKIP.)
tovu_imports: - (Dashboard.tsx:8 and the Tovu unit test import from the reduced file unchanged)
jsx_edits: -
comment_edits: -   (Dashboard.tsx:103 names `use-recent-activity-disclosure.hooks.ts`, which still exists)
census: python3 scripts/census.py {TOVU_CLONE} apps/admin/src/features/dashboard/hooks/use-recent-activity-disclosure.hooks.ts -> exactly 2: Dashboard.tsx:8 static, __tests__/use-recent-activity-disclosure.unit.test.ts:4 static (both unchanged)
changeset: NEW .changeset/ui-persisted-disclosure.md:
  ----8<----
---
"@jini-ai/ui": minor
---

Add `usePersistedDisclosure({ storageKey })`: a collapsible panel's open state persisted best-effort in localStorage.
  ----8<----
look: Admin Dashboard: the "Recently updated" card starts collapsed on a fresh profile, opens on header click, stays open after reload; header button `aria-controls` equals the body id.
jini_msg: "feat(ui): add usePersistedDisclosure hook" | tovu_msg: "refactor(admin): persist the dashboard recent-activity card through @jini-ai/ui usePersistedDisclosure"
Commits: Jini (4 paths: 2 new hook files, src/index.ts, changeset). Tovu (1 path: the reduced hooks file).
Admin complexity: useRecentActivityDisclosure complexity 1. Jini usePersistedDisclosure complexity 1 (helpers 2 each).
Cloud run owes: Jini ui vitest usePersistedDisclosure.test.ts + ui typecheck/subpath-isolation; Tovu admin vitest use-recent-activity-disclosure.unit.test.ts (resolves @jini-ai/ui after linking, D1) + admin typecheck. No RED test, no behaviour change.
est_executor_tokens: ~35k Sonnet
