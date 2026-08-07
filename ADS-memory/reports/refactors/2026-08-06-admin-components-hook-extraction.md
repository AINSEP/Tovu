# Admin components → ConfirmDialog-pattern hook extraction

**Date:** 2026-08-06
**Branch:** `refactor/jini-admin-extraction`
**Scope:** `apps/admin/src/components/` — 7 components named by the owner
**Status:** dispatched, 3 subagents in flight

## What the owner asked for

Apply "the ConfirmDialog pattern" — each component gets its own folder with its hooks
alongside — to seven components in `apps/admin/src/components/`, and write the
corresponding tests. `apps/admin/src/hooks/use-fab-position.hooks.ts` was explicitly
named as belonging inside the new `ChatFab/` folder.

## D1 — Where the reference pattern actually lives

`ConfirmDialog` does **not** exist anywhere in Tovu. It lives in the sibling Jini repo:
`/Users/la/Programming/Jini/packages/admin/src/react/components/ConfirmDialog/`.
Owner confirmed ("sorry that was in Jini") after the search came up empty here.

Two sibling components in Jini follow the same shape (`ConfirmButton/`, `RowMenu/`), so
it is an established convention there, not a one-off.

## D2 — What the pattern actually is

Read off the reference, not inferred:

1. `components/<Name>/<Name>.tsx` — props + JSX only.
2. `components/<Name>/<Name>.hooks.tsx` — state/effects/refs/DOM logic as named hooks.
3. **No `index.ts` barrel.** Importers reference `components/<Name>/<Name>` directly.
   Verified: nothing in Jini imports a barrel for these three folders.
4. **Injectable hook seam** — `ConfirmDialog` takes `useDialog?: typeof useConfirmDialog`
   defaulted to the real hook. This is the load-bearing part: it lets a test render the
   JSX against a fake with zero module mocking. The folder split alone buys much less.
5. **Tests stay outside the folder.** Jini keeps them at
   `src/react/__tests__/components/<Name>.test.tsx`. Tovu's equivalent is
   `src/components/__tests__/<Name>.unit.test.tsx` — so this pass moves NO test files
   for the six components that already have one; it only fixes their import paths.

## D3 — Most of the extraction was already half-done

Hook-name census over the seven targets:

| component | lines | existing named hooks | had a test |
|---|---|---|---|
| `AssistantDock` | 879 | `useByokRuntime`, `useLocalCliSelection`, `useExecutionConfig`, `useWorkingDir`, `useChatPane` | yes |
| `Select` | 493 | `useSelectDropdown` | yes |
| `WidgetPickerDialog` | 313 | `useWidgetPickerDialog`, `useWidgetAddControl`, `useExistingInstances` | yes |
| `WidgetConfigFields` | 240 | **none** (raw `useState` ×5, `useEffect` ×3) | yes |
| `SeeMore` | 166 | `useSeeMoreClamp` | yes |
| `MediaPickerDialog` | 121 | `useMediaPickerDialog`, `useMediaPickerItems` | **no** |
| `ChatFab` | 66 | (consumes `useFabPosition` from `hooks/`) | yes |

Consequence: five of seven are a move-and-seam job, not a redesign. The two that carry
real risk are `WidgetConfigFields` (genuine extraction required — nothing named yet) and
`MediaPickerDialog` (no test at all, so the refactor is unguarded until one is written).

## D4 — `use-fab-position.hooks.ts` renamed, not just moved

Grep confirmed `useFabPosition` has exactly ONE consumer: `ChatFab.tsx`. So moving it
into `ChatFab/` is safe. Renamed to `ChatFab.hooks.tsx` to match the pattern rather than
kept at its old filename — exported symbols (`useFabPosition`, `FAB_EDGE_MARGIN`)
unchanged, so this is a path change only.

Its existing test (`hooks/__tests__/use-fab-position.hooks.test.ts`, ~300 lines) is
`git mv`'d to `components/__tests__/ChatFab.hooks.unit.test.tsx` with only the import
fixed. **Not re-authored** — re-authoring loses coverage while looking productive.

## D5 — Agent split is by shared-importer, not by size

The constraint that decided this: no two agents may edit the same file. Component
importers overlap, so the split follows the import graph.

| agent | components | exclusively owns |
|---|---|---|
| A `refactor-assistant` | `AssistantDock`, `ChatFab` | `App.tsx` (imports both), `hooks/use-fab-position*` |
| B `refactor-widgets` | `Select`, `WidgetConfigFields`, `WidgetPickerDialog` | `features/widgets/*`, `lib/widget-embed-extension.tsx` |
| C `refactor-media` | `MediaPickerDialog`, `SeeMore` | `lib/media-image-extension.tsx`, `FormEditor.tsx`, `AiAssistant.tsx` |
| Coordinator | — | `lib/embed-insert-control.tsx` |

- A owns `App.tsx` because it imports both `AssistantDock` and `ChatFab` (lines 18-19).
- B owns all three widget components together because `WidgetPickerDialog` imports both
  `Select` and `WidgetConfigFields`.
- `lib/embed-insert-control.tsx` imports B's components AND C's, so the Coordinator took
  it rather than letting two agents race on one file. Both agents were told to expect a
  typecheck error there and not to fix it.

Deliberately unbalanced (A ≈ 51KB of source, B ≈ 49KB, C ≈ 13KB) — file-exclusivity beat
load-balancing.

## D6 — No agent commits

Agents were forbidden from `git add`/`git commit`. Reasons: the working tree carries ~21
dirty paths from prior sessions that must not be swept into a commit, and three agents
committing concurrently contend on `index.lock`. Coordinator commits once at the end
after verification.

Accepted risk: local subagent work lives only in the working tree. Mitigated by not
stopping any agent mid-flight.

## D7 — Verification bar set above "tests pass"

Every brief requires **per-file negative verification**: for each test file touched,
deliberately break an assertion, confirm THAT FILE fails, revert, and report the observed
failure message. An aggregate pass count does not prove a moved test still asserts
anything — a silently no-opped file reports green, and under jsdom a layout-measuring
test can pass vacuously because every measurement is `0`.

Also required per brief: scoped `npx vitest run <single file>` only, never the full suite.

## D8 — The `lib/` vs `components/` boundary rule (owner-raised, 2026-08-06)

Owner asked whether the three `.tsx` files in `lib/` are misfiled, since "they're obviously
React components." Answer differs per file, and the differentiator is worth writing down
because it will be re-litigated otherwise.

**The rule: the file extension is not the test. The test is whether the thing is
*addressable* as a component, or a *module the editor consumes*.**

| export | kind | verdict |
|---|---|---|
| `EmbedInsertControl` | React component, 3× `useState`, one consumer (`PostEditor.tsx:79`) | **move to `components/`** |
| `MediaImage` / `WidgetEmbed` | TipTap `Node` schema objects, passed to `useEditor({ extensions: […] })` | **stay in `lib/`** |
| `MediaImageNodeView` / `WidgetEmbedNodeView` | React, but mounted ONLY by `ReactNodeViewRenderer` from inside their own extension; zero external references (verified by grep) | **stay in `lib/`, beside their schema** |
| `MediaImageInsertControl` | React component, **zero callers anywhere** | **delete — dead code** |

A node view is the schema's rendering half, always 1:1 with it. Filing it under
`components/` would put half of one node's definition in another folder for a naming
reason, and nothing could import it anyway.

`INFO.md:64` already states the underlying principle for `hooks/` vs `lib/` ("`lib/` is
for modules (clients, pure helpers)"). This pass extends the same sentence to cover
`components/` so the boundary is written down rather than inferred.

### Dead code found

`media-image-extension.tsx:134-155` — `MediaImageInsertControl`, a toolbar "Media" button
with zero imports and zero tests. Superseded by `EmbedInsertControl`, whose own header
(`embed-insert-control.tsx:8`) states it replaced "the previously-separate Media and
Insert widget buttons." The Media half was replaced; this was left behind.

### Related inconsistency — NOT fixed, deliberately out of scope

`WidgetEmbedInsertControl` is the same shape but is NOT dead:
`features/collections/CollectionEntryEditor.tsx:230` still uses it. So Posts got the
unified `EmbedInsertControl` and Collections is still on the old per-kind button. That is
a product/UX decision, not folder hygiene — flagged for the owner, not changed here.

### Forward pointer, deliberately not built

`ADS-memory` records a decided-but-unimplemented generic embed contract (one
`data-embed-type` replacing per-kind attributes). `EmbedInsertControl`'s four hardcoded
choices are exactly what a registry would replace. Building that registry now would be
scope creep on a folder-hygiene pass, so it is noted in the file header as a seam and
left unbuilt.

## D9 — Fix landed: `use-taxonomy.hooks.ts` neutered delete guard

Found while triaging the complexity list (`useTaxonomy` 10/18), not by looking for bugs.

`features/taxonomy/hooks/use-taxonomy.hooks.ts:101` read `if (false) return;` where its sibling
`confirmDeleteTaxonomy` reads `if (!pendingDeleteTaxonomy) return;`. Two lines below,
`const term = pendingDeleteTerm as AdminTerm;` dereferenced the result unchecked.

Introduced by `87e07f6 feat(taxonomy): delete UI + guarded delete routes + visual convergence [WIP]`
(2026-08-05) — committed, not a working-tree artifact.

**The test already existed and was already failing on main:**

```
FAIL  confirmDeleteTerm is a no-op when nothing is pending
  expected 'Cannot read properties of null (reading 'id')' to be null
Tests  1 failed | 16 passed
```

Fixed 2026-08-06 to `if (!pendingDeleteTerm) return;` + `const term = pendingDeleteTerm;`.
Suite now 17/17.

Two things worth carrying forward:

1. **The cast was the weapon, not the guard.** `if (false)` merely disabled the check; the
   `as AdminTerm` is what let `null` reach `.id`. Narrowing instead of casting makes the compiler
   hold the invariant, so the same bug cannot return without someone deliberately re-adding a cast.
2. **A red test nobody watches is worse than no test** — it proves the defect exists *and*
   normalises ignoring the signal. Counterpart to the per-file negative-verification rule: green
   proves nothing unchecked, red proves nothing unread.

## Open items for the Coordinator

- [ ] `lib/embed-insert-control.tsx` — update the `MediaPickerDialog` and
      `WidgetPickerDialog`/`WidgetAddControl`/`useWidgetAddControl` import paths.
- [ ] **Pass 4 (per D8), after the three agents land:**
      move `EmbedInsertControl` → `components/EmbedInsertControl/` (folder + `.hooks.tsx`
      + injectable seam + its FIRST test); delete dead `MediaImageInsertControl`;
      document the boundary rule in `apps/admin/INFO.md`.
- [ ] `lib/settings-refresh-bus.ts` and `lib/settings-events.ts` mention
      `components/AssistantDock.tsx` in comments only (no import) — sweep the stale paths.
- [ ] Whole-app typecheck + scoped test sweep after all three report.
- [ ] Single commit of the refactor paths only.
