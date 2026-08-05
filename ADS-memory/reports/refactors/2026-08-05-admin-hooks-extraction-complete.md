# Admin hooks extraction — complete

Date: 2026-08-05. Continues `ADS-memory/.local-artifacts/handoff/20260804-170551-handoff.md`,
which left this at **4 of 26 features**.

Dispatched as 6 concurrent Programmer subagents (Sonnet), each bootstrapped through
`AI-Dev-Shop/agents/programmer/skills.md`, against
`ADS-memory/.local-artifacts/briefs/2026-08-05-admin-hooks-extraction-brief.md`.

## Result

**26 of 26 features extracted.** 70 `hooks/use-*.hooks.ts` files, 22 `rules.ts` files.

## Whole-tree verification

Run only after all six agents reported idle — the tree was quiesced first, per the prior session's
mistake #5 (typechecking a tree a subagent was still writing to).

| check | result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **exit 0**, zero errors |
| `npx vitest run` (full suite) | **431 passed / 4 failed / 46 files** |
| unhandled rejections | **0** (was 14) |
| `rules.ts` importing React | **none** (checked all 22) |
| feature barrels exporting non-components | **none** (checked all 26) |

The 4 failures are the 4 that must stay failing, confirmed by name:

1. lists all three unbuilt controls, each marked as not implemented
2. renders every roadmap item as an inert unchecked box — no fake toggles
3. expands to a one-line explanation of what each missing control would do
4. warns, before anyone flips the switch, that there is no cost ceiling yet

**431 passed is identical to the pre-extraction baseline.** Same pass count, same 4 expected
failures — which is the point: this refactor was required to be behaviour-preserving.

## The 14 unhandled rejections (handoff Risk 1) — closed

Previously "NEW, LIKELY MINE, UNCONFIRMED." Now confirmed, fixed, and guarded.

**Cause:** `AssistantDock.tsx` called `void loadExecutionConfig().then(…)` with no `.catch()`. The
dock mounts on every admin route, so the four `App`-mounting tests hit it; those tests stub `fetch`
to return `{}` for every non-auth URL, so `getSettingsEffective` resolved without `.data` and
`rows.map` threw at `execution-settings.ts:165`. Reproduced exactly — those 4 files alone produced
all 14.

**Fix:** added the `.catch()`, matching the shape `handleExecutionModeChange` already used 20 lines
below. `DEFAULT_EXECUTION_CONFIG` is already the state's initial value, so a failed read leaves the
picker on Local CLI instead of firing an unhandled rejection on every page load where the settings
read fails.

**Regression guard — verified, not assumed.** A throwaway probe test that produces an unhandled
rejection while all its assertions pass exits `1`. So the 4 `App` tests fail the build if the
`.catch()` is ever removed. Probe deleted after measuring.

## Brief error caught mid-flight (worth keeping)

Brief item #4 originally said to export the new hook, its Controller type, and the rules functions
from each feature's `index.ts`. **That was wrong.** Every barrel's own `@file` comment states the
boundary:

> everything below can be split, renamed, or grown a `hooks/` directory without the router
> noticing. Adding a file to this feature is not an API change unless it is exported from this line.

Exporting hooks and rules through the barrel widens each feature's public surface to exactly the
internals the boundary exists to hide. Tests import those files directly, so nothing needed it.

**Four agents independently refused the instruction** and followed the `posts`/`collections`/
`menus`/`forms` precedent instead. One followed it as written (correctly — it was the brief), which
widened 4 barrels; all 4 were reverted. The brief now says the opposite, with the reasoning recorded
inline.

## Judgment calls worth knowing about

- **`collections`: one shared `useEscapeToCancel` hook.** Three dialogs had byte-identical
  Escape-key effects; factored once rather than tripled.
- **`collections`: the `nextRowId` counter lives in `rules.ts`, not per-hook.** Pre-extraction, ONE
  module-level counter was shared across two dialogs (open New, cancel, open Edit — ids keep
  incrementing, don't reset). Splitting it into two hook-local counters would have been a real
  behaviour change. Disclosed in that file's header as a deliberate exception to "rules.ts is pure":
  a monotonic ID generator has a side effect by definition.
- **`recovery`: `parseDeepLinkEnvelope` returns a discriminated result, not a nullable.** The
  original `try/catch` bailed only on a THROW, not on a falsy parsed value (`"null"`, `"0"` are
  valid JSON). A plain-null return would have conflated the two.
- **`database`: `navigateToRecoveryWithDeepLink` went to the hook, not `rules.ts`** — it writes
  `sessionStorage` and navigates. Not pure.
- **`database` has no `rules.ts`** — spot-checked and correct. What remains in the 250-line view is a
  static `KIND_OPTIONS`, three thin wrappers, and ternaries on an already-computed `step`.
- **`comments`: only the exported `Comments` got the DI seam**, not its private `QueueSection` /
  `SettingsSection`. Neither is separately exported or tested, so a seam there would add a prop
  nothing ever supplies.
- **`ai-assistant`: `useSyncExternalStore` was treated as hook state** and moved into its own hook
  file, though the brief's Pattern 1 list didn't name it.

## Two self-caught copy errors (the reason "extract verbatim" is a rule)

Both would have passed `tsc` — same type signature, different behaviour — and neither was covered by
any existing test:

1. **`comments`**: two `catch` blocks were initially miscopied to call `describeModerationError`
   instead of the original's `describeApiError(e, "failed to load the moderation queue")` /
   `describeApiError(e, "Failed to purge comment.")`. Caught on a re-read against the original.
2. **`settings/SettingsUi`**: `InstructionsTab`'s onChange fallback was initially miscopied from
   `next ?? DEFAULT_INSTRUCTIONS` to `next ?? ""`. Caught by diffing against the original.

Both agents disclosed these rather than burying them. Neither has a regression net for that specific
string — stated here rather than implying coverage that doesn't exist.

## Known accepted debt

- `useSettingsContainer` (settings-raw) self-scored **90** — orchestrates 4 loosely-coupled concerns
  in one hook body. Not restructured, because "extract verbatim" bars it. Flagged, not hidden.
- `useSettingsUi` (settings) self-scored **95** — six near-identical `useSettingsSlice` config
  blocks; could be data-driven.
- `use-form-fields-editor` / `use-form-editor` expose live mutable DOM refs (`kebabRefs`,
  `tabRefs`) — the only place the extraction produces a hook returning a DOM-attachable ref. The
  WCAG focus-return tests pass, but the shape is novel in this codebase and deserves a reviewer's
  eye if focus management changes.

## Still owed

1. **TDD pass for the screens with no regression net.** The DI seam now exists on every one of them,
   which was the prerequisite. Unguarded: `appearance`, `analytics`, `auth`, `workspace`,
   `collections/Collections`, `database`, `pages`, `recovery`, `redirects`, `roles`, `seo`,
   `settings/SettingsUi`, `taxonomy`, `integrations/IntegrationDeliveries`,
   `widgets/WidgetRegionEditor`, `widgets/WidgetRegions`.
2. **No `rules.ts` function has direct unit coverage yet** — all 22 files' exports are exercised only
   indirectly through existing component tests. This was the brief's explicit trade, not an oversight.
3. **Migration-authored barrels and READMEs still lack the `@complexity`/`@overallScore` contract**
   (carried over from the prior handoff; untouched this session).
4. **Popover clamp-to-dock** — owner decided, not implemented. See
   `.local-artifacts/handoff/20260805-owner-decisions-popover-and-info-tree.md`.

## Not committed

Nothing in this tree is committed. `git add`/`git commit` were barred for every agent and none were
run. `apps/admin/sections/` was deleted this session with plain `rm -rf`, so the deletions are
unstaged and the shared index is untouched.
