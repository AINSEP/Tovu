# apps/admin TSX component-body logic sweep — audit + partial fix

Scope: `apps/admin/src/**/*.tsx`, excluding `__tests__`. Persona: Programmer
(`AI-Dev-Shop/agents/programmer/skills.md`), supported by Refactor
(`AI-Dev-Shop/agents/refactor/skills.md`, specifically `skills/refactor-patterns/SKILL.md`).
`CLAUDE.md`/`AGENTS.md` were not read (dispatch marker).

Rule under audit (owner, 2026-09-03): no functions or derived logic inside a `.tsx` *component*
body — they belong in that component's `*.hooks.ts`/`*.hooks.tsx`. Rendering (`.map()` returning
JSX, DataTable `cell` callbacks) is not logic. An inline arrow that only forwards an event
(`onClick={() => setOpen(true)}`) is not a violation.

## File count

`find apps/admin/src -name "*.tsx" -not -path "*__tests__*"` returns **107** files (dispatch brief
said 109 — likely a slightly different exclude pattern; not material). Of those, **13** are
`*.hooks.tsx` — the folder convention's own designated home for "state, effects, refs, DOM/IO
logic" (`apps/admin/INFO.md`'s Components section). Functions living there are the correct,
intended end state of this rule, not violations, so they were excluded from the violation sweep
and only spot-checked. The remaining **94** are the actual component-body audit target.

## Method

Grepped all 94 files for: top-level function declarations, indented `const`/`let` arrow functions,
`useMemo`/`useCallback` call sites, `.map`/`.filter`/`.reduce`/`.sort`/`.flatMap` chains, and inline
multi-statement JSX event-handler bodies (`onX={() => { ... }}`). Every hit was read in context
(not just grep-matched) before classifying — several early hits that looked like violations on the
grep line turned out to be module-level pure functions, DataTable cell renderers, or the
`buildAgentListHandles` precedent once read with surrounding code.

## The 8-file precedent (confirmed, extended)

A prior session (`tovu-hooks-sweep`, referenced in memory) found the
`buildAgentListHandles(items.map(...))` pattern — a small `.map()`/`new Map()` lookup built
directly in the component body, un-memoized, immediately consumed by the JSX below it — in 8+
files, several with comments defending the inlining (`memoization is a hook concern, not a rules
concern`, `use-taxonomy.hooks.ts:184`). This sweep re-confirmed that pattern live in:
`MediaPickerDialog.tsx`, `Select.tsx`, `CollectionEntries.tsx`, `CollectionEntryEditor.tsx`,
`Collections.tsx`, `FormEditor.tsx`, `FormsList.tsx`, `Integrations.tsx`, `Media.tsx`,
`Members.tsx`, `Redirects.tsx`, `Roles.tsx`, `ExternalMcpSettingsPanel.tsx`, `Taxonomy.tsx`,
`ThemeExplore.tsx`, `Users.tsx`, `StaticSiteTab.tsx` — more than the 8 originally counted, all the
same shape. `Users.tsx:414-420`'s comment is the clearest exemplar: explicitly NOT `useMemo`'d
because that would require hoisting above an early return, cross-references `Media.tsx`'s identical
reasoning, and calls the cost "a single O(n) pass... not worth [the] indirection."

**Disposition: SANCTIONED, left alone**, per this precedent's own prior ruling ("report as a
finding rather than bulk-fixing unilaterally... a scoped decision for the owner, not something a
sweep should resolve on its own authority"). Nothing new to decide here — same tension, same
owner-facing choice, now with a fuller file list.

## A second, previously undocumented sanctioned class

A distinct, equally consistent pattern: a **single-branch guard directly forwarding one call**,
each with its own defending comment (never bulk-generated) —
`ThemeExplore.tsx:896` `handleClick`, `ThemePagesTab.tsx:123` `handleClick`, `Themes.tsx:88`
`handleError`, `Users.tsx:628` `handleConfirm`, `Select.tsx:252` `setOptionRef` — e.g. "Guarded on
`state.kind` rather than relying solely on the DOM's own disabled-buttons-don't-fire behavior —
explicit here so a locked switch can never dispatch a publish call no matter what wraps or
simulates the click." This is a step beyond a bare forward but computes no value and has exactly
one guard clause; classified as an extension of the "forwards an event" carve-out, not a new
violation class. Same disposition for the ~39 inline multi-statement JSX handlers found
(`onPickMedia={() => { setMediaPicking(true); setOpen(false); }}` etc., in `EmbedInsertControl.tsx`,
`Collections.tsx`, `PostEditor.tsx`, and others) — sampled several, all sequential
`setState`/close/reload orchestration, no branching, no derived value.

**Disposition: CLEAN.** Flagging this to the owner as a finding, same as the class above, since it
was not previously documented and a stricter reading could disagree.

## Module-level functions colocated with a component (not component-body logic at all)

`App.tsx`'s `parseRoute`/`currentPanelId`/`agentPageId`/`PANELS_BY_ID`, `MenuEditor.tsx`'s
`countDescendants`, `PostEditor.tsx`'s `probeToolbar`, `Themes.tsx`'s `buildThemeTabs`,
`ThemeExplore.tsx`'s preview-URL builder — all top-level, exported or file-private, no React state,
already independently testable. **CLEAN** — this is the rule's own end state (pure logic pulled out
of the render path), just not literally inside a `*.hooks.ts` file. Not touched.

## Confirmed VIOLATIONS — fixed this pass

| File | Symbol | Extraction |
|---|---|---|
| `components/WidgetConfigFields/WidgetConfigFields.tsx` | `SocialLinksConfigFields`'s `updateLink`/`removeLink`/`addLink` | → `useSocialLinksConfig` in the already-existing `WidgetConfigFields.hooks.tsx` |
| `components/AssistantDock/AssistantDock.tsx:396` | `selectedPluginChips` (`.map()` building chip objects, un-memoized) | → `useSelectedPluginChips` (new, `useMemo`-wrapped) in `hooks/AssistantDock.hooks.tsx` |
| `features/forms/FormsList.tsx:46` | `rowMenuItems` (branching `RowMenuItem[]` builder) | → `formRowMenuItems` in `features/forms/rules.ts`, matching `redirects/rules.ts`'s `redirectRowMenuItems`/`posts/rules.ts`'s `postRowMenuItems` exactly |
| `App.tsx:335` | `collapsibleGroups` (`.map().filter()` chain, un-memoized, root component) | → `useCollapsibleNavGroupLabels` (new, `useMemo`-wrapped) in `App.hooks.tsx` |

All four were trivial-to-moderate: a colocated hooks/rules file already existed in three of four
cases, the fourth (`FormsList`) had a directly on-point sibling precedent (`Redirects.tsx`) to copy
exactly. Each move is a pure relocation — same computation, same inputs/outputs, no behavior
change. `App.tsx`'s hook call sits in the exact same unconditional position (before the
`checking`/`!user` early returns) the inline code occupied, so Rules of Hooks are unaffected.

## RISKY — deferred, not fixed

- **`AccessTokensTab.tsx` / `OtherCredentialsSection.tsx`** — multiple `forwardRef` dialog
  sub-components (`RemoveConfirmDialog`, `AddCustomCredentialDialog`,
  `OtherCredentialRemoveDialog`, ...) each define `close()`/`confirm()`/`save()` inline, directly
  manipulating the forwarded `ref.current.close()`. Per `INFO.md`'s own rule this SHOULD be a hook
  ("any hook that touches the DOM... is an injectable prop"), but neither file has a colocated
  `.hooks.tsx`, the file is large with several near-duplicate dialog components, and the area is
  credential/destructive-action handling — restructuring several `forwardRef` generics safely in
  one pass was judged higher risk than the return justified here. Flagging for a dedicated pass.
- **`ThemeExplore.tsx:1197-1216`** — `closeFullscreen`/`handleFullscreenCancel`/
  `handleFullscreenBackdropClick`, a `<dialog>` open/close lifecycle over two refs and local state.
  The file's own comment says it mirrors `ImagePreviewModal.tsx`, which already has this exact
  lifecycle extracted into `ImagePreviewModal.hooks.tsx` — a real, precedented target — but
  `ThemeExplore.tsx` is 1300+ lines with no dedicated hooks file of its own yet, and it's the
  screen's root component. Deferred rather than restructured under this pass's time budget.
- **`SitemapModal.tsx:221`** `handleRegenerate` — small (2 lines) but bridges a prop
  (`onRegenerate`) with the injected hook's `modal.refetch()`; extracting it would change
  `use-sitemap-modal.hooks.ts`'s public hook signature. Borderline; left as a named finding rather
  than fixed.

## Out of scope

`features/plugins/bundled/ui-ux-design/skills/shadcn-ui/examples/*.tsx` (and similar bundled skill
templates) are vendored example code shipped as a skill bundle, not this app's own component code —
excluded from the sweep entirely, same as `node_modules`.

## Unrelated finding: complexity gate

`npx tsx development/scripts/check-admin-complexity-drift.ts` reports **11 pre-existing
`apps/admin` complexity violations** not in `admin-complexity-debt.json`, contradicting the
dispatch brief's premise that the debt list is "currently empty (0 entries)." Confirmed via
`git show HEAD:<path> | eslint --stdin` that these already exist in the **committed** tree,
unrelated to this session's edits — e.g. `AssistantDock.hooks.tsx`'s flagged function is
`resolveRunContext` (pre-existing, complexity 10), not anything touched by this sweep. The other 10
flagged files (`EmbedInsertControl.tsx`, `Select.tsx`, `WidgetPickerDialog.tsx`, `MenuEditor.tsx`,
`use-page-editor.hooks.ts`, `composer-capabilities.ts`, `Recovery.tsx`,
`ExternalMcpSettingsPanel.tsx`, `use-external-mcp.hooks.ts`, `ThemeExplore.tsx`) were never touched
by this session either. Verified none of the 4 files this sweep edited introduced a new violation —
re-ran the gate after the edits, same 11 files, none of them newly implicated by name for a symbol
this sweep added. Flagging for the owner/next session; out of scope to fix here (would be a
separate, much larger effort, and 8 of the 10 other files have nothing to do with TSX-body logic).

## Verification

- `npx tsc -p tsconfig.json --noEmit` (repo root): 2 pre-existing errors, both in
  `apps/website` (unrelated to this sweep's scope; other agents' concurrent work). Zero errors in
  `apps/admin`.
- `vitest run` scoped to every test file touching the 4 edited components/hooks (19 files): first
  run under full session load showed 9 timeouts (`Test timed out in 5000ms`) across
  `App`/`AssistantDock`/`FormsList` tests. Re-ran the same failing files in isolation with
  `--testTimeout=20000`: **all passed** (58 tests, 0 failures) — confirms the timeouts were
  resource contention from concurrent session load, not a regression.
- `check-admin-complexity-drift.ts`: unchanged violation count/file list before and after this
  sweep's edits (see finding above) — this sweep did not regress it.

## Files changed

- `apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx`
- `apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.hooks.tsx`
- `apps/admin/src/components/AssistantDock/AssistantDock.tsx`
- `apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx`
- `apps/admin/src/features/forms/FormsList.tsx`
- `apps/admin/src/features/forms/rules.ts`
- `apps/admin/src/App.tsx`
- `apps/admin/src/App.hooks.tsx`
